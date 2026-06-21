// @gest/infra / bindings / D1DeliveryGateStore + D1MessageDedupeStore
//
// The production D1 implementations of the ingest-core delivery gate + message
// dedupe contracts. This is binding glue only: it persists the records the ack
// path / consumer produce and runs the atomic claim the Oracle review requires.
//
// ATOMICITY (the load-bearing invariant): `prepareDelivery` claims the delivery
// dedupe key AND inserts the delivery_work ledger row in ONE D1 batch
// transaction (Cloudflare D1 batch is an implicit transaction that rolls back if
// any statement fails). So a dedupe claim NEVER exists without a recoverable work
// row — that is what lets a duplicate ack 200 SAFELY and lets a crash before the
// Queue send be repaired (listUnenqueued) instead of losing the event.
//
// The dedupe claim uses INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <=
// now (expiry reclaim) so a fresh delivery wins after the retention window while
// a live claim collapses the redelivery. No SELECT-then-INSERT race.
//
// Mirrors the @gest/ingest-local MemoryDeliveryGateStore behaviour exactly so the
// offline reference proofs and the D1 path agree on the contract.
import { decodeQueueMessage, orThrow } from "@gest/ingest-core";
/** States that mean "a recoverable, queued unit already exists" (no re-enqueue). */
const COVERED_STATES = new Set(["queued", "processing", "done"]);
/** States from which a consumer may claim the row for processing. */
const CLAIMABLE_STATES = new Set(["ready", "queued", "processing"]);
/** Default work id derivation when the caller does not supply one. */
function defaultWorkId(dedupeKey) {
    return `work_${dedupeKey}`;
}
function addSeconds(iso, seconds) {
    return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}
/** ISO `a` <= ISO `b`. */
function lte(a, b) {
    return Date.parse(a) <= Date.parse(b);
}
function rowToWork(row) {
    const queueMessage = orThrow("delivery_work.payload", decodeQueueMessage(JSON.parse(row.payload)));
    return {
        workId: row.work_id,
        platform: row.platform,
        tenant: row.tenant,
        account: row.account,
        dedupeKey: row.native_key,
        rawId: row.raw_id,
        state: row.state,
        attempts: row.attempts,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        queueMessage,
        ...(row.enqueued_at === null ? {} : { enqueuedAt: row.enqueued_at }),
        ...(row.not_before === null ? {} : { notBefore: row.not_before }),
        ...(row.last_error === null ? {} : { lastError: row.last_error }),
    };
}
export class D1DeliveryGateStore {
    #db;
    #leaseSeq = 0;
    // No clock dependency: every delivery-gate timestamp is the caller's `input.now`,
    // so the gate stays deterministic and replay-safe with no ambient clock read.
    constructor(db) {
        this.#db = db;
    }
    async prepareDelivery(input) {
        const workId = input.workId ?? defaultWorkId(input.dedupeKey);
        const expiresAt = addSeconds(input.now, input.retentionSeconds);
        const payload = JSON.stringify(input.queueMessage ?? {});
        // ONE D1 batch == ONE transaction. Statement 1 claims the dedupe key with an
        // expiry-reclaim upsert; statement 2 ensures the work row exists. Either both
        // commit or both roll back — the atomicity invariant holds at the DB level.
        const claimStmt = this.#db
            .prepare(`INSERT INTO dedupe_delivery (dedupe_key, raw_id, claimed_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(dedupe_key) DO UPDATE SET
           raw_id = excluded.raw_id,
           claimed_at = excluded.claimed_at,
           expires_at = excluded.expires_at
         WHERE dedupe_delivery.expires_at <= excluded.claimed_at`)
            .bind(input.dedupeKey, input.rawId, input.now, expiresAt);
        // INSERT OR IGNORE: a duplicate within retention keeps the original work row
        // (and its state), so a repair can re-enqueue an unconfirmed row.
        const workStmt = this.#db
            .prepare(`INSERT OR IGNORE INTO delivery_work
           (work_id, raw_id, native_key, platform, tenant, account, payload,
            state, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', 0, ?, ?)`)
            .bind(workId, input.rawId, input.dedupeKey, input.platform, input.tenant, input.account, payload, input.now, input.now);
        const results = await this.#db.batch([claimStmt, workStmt]);
        // Duplicate = an earlier LIVE claim already held this key. The claim upsert
        // changes a row ONLY when this call won it: a fresh INSERT (changes=1) or an
        // expiry-reclaim UPDATE (changes=1). A live prior claim hits ON CONFLICT with
        // the WHERE expires_at<=now guard FALSE -> no row changed (changes=0). So the
        // statement's affected-row count is the exact, atomic duplicate signal —
        // correct even when a same-body redelivery reuses the rawId (real Slack
        // retries resend identical bytes) AND when it arrives with the same `now`.
        // Mirrors the memory reference's "a live claim already exists" check.
        const claimChanges = Number(results[0]?.meta?.changes ?? 0);
        const duplicate = claimChanges === 0;
        const workRow = await this.#readWork(workId);
        if (workRow === undefined) {
            // Must be impossible (the work insert is in the same batch); fail loud.
            throw new Error(`infra: prepareDelivery produced no recoverable work row for ${workId}`);
        }
        const work = rowToWork(workRow);
        return {
            duplicate,
            work,
            shouldEnqueue: !COVERED_STATES.has(work.state),
        };
    }
    async markEnqueued(input) {
        // Idempotent: only the first ready->queued transition matters.
        await this.#db
            .prepare(`UPDATE delivery_work
         SET state = 'queued', enqueued_at = ?, updated_at = ?
         WHERE work_id = ? AND state = 'ready'`)
            .bind(input.now, input.now, input.workId)
            .run();
    }
    async listUnenqueued(input) {
        const res = await this.#db
            .prepare(`SELECT * FROM delivery_work
         WHERE state = 'ready'
           AND (not_before IS NULL OR not_before <= ?)
         ORDER BY created_at ASC, work_id ASC
         LIMIT ?`)
            .bind(input.now, input.limit)
            .all();
        return res.results.map(rowToWork);
    }
    async listRepairable(input) {
        const res = await this.#db
            .prepare(`SELECT * FROM delivery_work
         WHERE (not_before IS NULL OR not_before <= ?)
           AND (
             state IN ('ready', 'queued')
             OR (state = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
           )
         ORDER BY created_at ASC, work_id ASC
         LIMIT ?`)
            .bind(input.now, input.now, input.limit)
            .all();
        return res.results.map(rowToWork);
    }
    async claimWork(input) {
        const row = await this.#readWork(input.workId);
        if (row === undefined)
            return undefined;
        if (!CLAIMABLE_STATES.has(row.state))
            return undefined;
        if (row.not_before !== null && !lte(row.not_before, input.now))
            return undefined;
        // A live lease blocks a second claim — this is what stops a duplicate Queue
        // delivery from concurrently invoking the runtime.
        if (row.lease_expires_at !== null && !lte(row.lease_expires_at, input.now)) {
            return undefined;
        }
        this.#leaseSeq += 1;
        const claimToken = `dwlease_${input.workId}_${this.#leaseSeq}_${input.now}`;
        const leaseExpiresAt = addSeconds(input.now, input.leaseSeconds);
        // Conditional UPDATE fences a concurrent claimer: only succeeds while the row
        // is still claimable and lease-free/expired. We re-assert the lease guard in
        // SQL so two callers in the same instant cannot both win.
        const res = await this.#db
            .prepare(`UPDATE delivery_work
         SET state = 'processing', attempts = attempts + 1, claimed_by = ?,
             claim_token = ?, lease_expires_at = ?, updated_at = ?
         WHERE work_id = ?
           AND state IN ('ready', 'queued', 'processing')
           AND (not_before IS NULL OR not_before <= ?)
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`)
            .bind(input.workerId, claimToken, leaseExpiresAt, input.now, input.workId, input.now, input.now)
            .run();
        const changed = res.meta?.changes;
        // When the binding reports row counts use them; otherwise re-read to confirm.
        if (changed === 0)
            return undefined;
        const claimed = await this.#readWork(input.workId);
        if (claimed === undefined || claimed.claim_token !== claimToken)
            return undefined;
        return { ...rowToWork(claimed), claimToken, leaseExpiresAt };
    }
    async completeWork(input) {
        // Fencing: only the holder of the current claim token may complete.
        await this.#db
            .prepare(`UPDATE delivery_work
         SET state = 'done', done_at = ?, claim_token = NULL, lease_expires_at = NULL,
             not_before = NULL, updated_at = ?
         WHERE work_id = ? AND claim_token = ?`)
            .bind(input.now, input.now, input.workId, input.claimToken)
            .run();
    }
    async failWork(input) {
        if (input.terminal === true) {
            await this.#db
                .prepare(`UPDATE delivery_work
           SET state = 'failed', last_error = ?, claim_token = NULL,
               lease_expires_at = NULL, not_before = NULL, updated_at = ?
           WHERE work_id = ? AND claim_token = ?`)
                .bind(input.error, input.now, input.workId, input.claimToken)
                .run();
            return;
        }
        // Non-terminal: re-arm `ready` so listUnenqueued + a fresh claimWork re-pick it.
        await this.#db
            .prepare(`UPDATE delivery_work
         SET state = 'ready', last_error = ?, claim_token = NULL,
             lease_expires_at = NULL, not_before = ?, updated_at = ?
         WHERE work_id = ? AND claim_token = ?`)
            .bind(input.error, input.retryAt ?? null, input.now, input.workId, input.claimToken)
            .run();
    }
    /** Read-only snapshot for assertions/repair. */
    async getWork(workId) {
        const row = await this.#readWork(workId);
        return row === undefined ? undefined : rowToWork(row);
    }
    async #readWork(workId) {
        const row = await this.#db
            .prepare(`SELECT * FROM delivery_work WHERE work_id = ?`)
            .bind(workId)
            .first();
        return row ?? undefined;
    }
}
// ---------------------------------------------------------------------------
// Message-level dedupe (distinct layer)
// ---------------------------------------------------------------------------
export class D1MessageDedupeStore {
    #db;
    constructor(db) {
        this.#db = db;
    }
    async claim(request) {
        const expiresAt = addSeconds(request.now, request.retentionSeconds);
        // Expiry-reclaim upsert: a fresh claim wins after the window; a live claim
        // collapses the re-send. Mirrors the delivery-level claim shape.
        const claimResult = await this.#db
            .prepare(`INSERT INTO dedupe_message (message_key, event_id, claimed_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(message_key) DO UPDATE SET
           event_id = excluded.event_id,
           claimed_at = excluded.claimed_at,
           expires_at = excluded.expires_at
         WHERE dedupe_message.expires_at <= excluded.claimed_at`)
            .bind(request.key, request.rawId, request.now, expiresAt)
            .run();
        const row = await this.#db
            .prepare(`SELECT event_id, claimed_at FROM dedupe_message WHERE message_key = ?`)
            .bind(request.key)
            .first();
        // Duplicate = a prior LIVE claim already holds this message key. The upsert
        // changes a row only when this call wins it (fresh INSERT or expiry-reclaim);
        // a live conflict no-ops (changes=0). Affected-row count is the atomic signal,
        // correct even for same-body redelivery / same `now` (not event_id/rawId).
        const claimChanges = Number(claimResult.meta?.changes ?? 0);
        const duplicate = claimChanges === 0;
        return {
            key: request.key,
            duplicate,
            ...(row?.event_id === undefined ? {} : { firstRawId: row.event_id }),
            ...(row?.claimed_at === undefined ? {} : { claimedAt: row.claimed_at }),
        };
    }
}
//# sourceMappingURL=delivery-store.js.map