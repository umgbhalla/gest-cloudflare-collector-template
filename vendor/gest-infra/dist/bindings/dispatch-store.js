// @gest/infra / bindings / D1 dispatch stores
//
// Production D1 implementations of the ingest-core dispatch-store contracts the
// generic dispatch loop (@gest/ingest-dispatch) drives:
//
//   D1OutboxDispatchStore — claimReady (atomic pending|retry -> sending + lease),
//                           recordDispatchDecision (lease-fenced), reapExpiredLeases.
//   D1RateLimitStore       — check ALL of a row's rate keys; update (defer a bucket).
//   D1DispatchDlq          — durable sink for terminal/exhausted rows.
//
// Binding glue only — no platform/provider/policy. Mirrors the
// @gest/ingest-local reference stores so offline proofs and D1 agree. Lease
// fencing is enforced in SQL (conditional UPDATE on lease_id) so a stale lease
// can never record a decision. Ordering is the Oracle review's
// (created_at, caused_by_id, effect_index).
import { decodeOutboxAttempt, orThrow } from "@gest/ingest-core";
function addSeconds(iso, seconds) {
    return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}
function rowToOutbox(row) {
    const attempts = JSON.parse(row.attempts).map((a) => orThrow("outbox.attempts[]", decodeOutboxAttempt(a)));
    const rateKeys = JSON.parse(row.rate_keys);
    return {
        outboxId: row.outbox_id,
        idempotencyKey: row.idempotency_key,
        platform: row.platform,
        tenant: row.tenant,
        account: row.account,
        credentialRef: row.credential_ref,
        method: row.method,
        destination: row.destination,
        rateKey: row.rate_key,
        rateKeys,
        requestHash: row.request_hash,
        requestBody: JSON.parse(row.request_body),
        causedById: row.caused_by_id,
        effectIndex: row.effect_index,
        state: row.state,
        attempts,
        createdAt: row.created_at,
        ...(row.not_before === null ? {} : { notBefore: row.not_before }),
        ...(row.lease_id === null ? {} : { leaseId: row.lease_id }),
        ...(row.lease_expires_at === null ? {} : { leaseExpiresAt: row.lease_expires_at }),
    };
}
/**
 * One D1 class serving BOTH the consumer-side `OutboxStore` (enqueue / list /
 * get / recordAttempt) and the dispatcher-side `OutboxDispatchStore` (claimReady
 * / recordDispatchDecision / reapExpiredLeases) over the same `outbox` table. The
 * consumer enqueues pending rows; the dispatcher claims + sends them. Keeping it
 * one class avoids a second binding for the same table.
 */
export class D1OutboxDispatchStore {
    #db;
    #leaseSeq = 0;
    constructor(db) {
        this.#db = db;
    }
    /** Seed a pending row (consumer-side enqueue). Idempotent on idempotency_key. */
    async enqueue(o) {
        const existing = await this.get(o.idempotencyKey);
        if (existing !== undefined)
            return { entry: existing, inserted: false };
        await this.#db
            .prepare(`INSERT OR IGNORE INTO outbox
           (outbox_id, idempotency_key, platform, tenant, account, credential_ref,
            method, destination, rate_key, rate_keys, request_hash, request_body,
            caused_by_id, effect_index, state, attempts, not_before, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(o.outboxId, o.idempotencyKey, o.platform, o.tenant, o.account, o.credentialRef, o.method, o.destination, o.rateKey, JSON.stringify(o.rateKeys), o.requestHash, JSON.stringify(o.requestBody), o.causedById, o.effectIndex, o.state, JSON.stringify(o.attempts), o.notBefore ?? null, o.createdAt)
            .run();
        const entry = (await this.get(o.idempotencyKey)) ?? o;
        return { entry, inserted: true };
    }
    /** OutboxStore.get is keyed by idempotencyKey (UNIQUE). */
    async get(idempotencyKey) {
        const row = await this.#db
            .prepare(`SELECT * FROM outbox WHERE idempotency_key = ?`)
            .bind(idempotencyKey)
            .first();
        return row ? rowToOutbox(row) : undefined;
    }
    async list() {
        const res = await this.#db.prepare(`SELECT * FROM outbox`).all();
        return res.results.map(rowToOutbox);
    }
    /** Legacy consumer dispatcher path: record an attempt by idempotencyKey. */
    async recordAttempt(idempotencyKey, attempt, nextState) {
        const current = await this.get(idempotencyKey);
        if (current === undefined) {
            throw new Error(`infra: recordAttempt on unknown outbox row "${idempotencyKey}"`);
        }
        const attempts = [...current.attempts, attempt];
        await this.#db
            .prepare(`UPDATE outbox SET state = ?, attempts = ? WHERE idempotency_key = ?`)
            .bind(nextState, JSON.stringify(attempts), idempotencyKey)
            .run();
        return { ...current, state: nextState, attempts };
    }
    /** Dispatcher-side read by outboxId (the loop's RecordDispatchDecision key). */
    async getById(outboxId) {
        const row = await this.#db
            .prepare(`SELECT * FROM outbox WHERE outbox_id = ?`)
            .bind(outboxId)
            .first();
        return row ? rowToOutbox(row) : undefined;
    }
    async claimReady(input) {
        const platformFilter = input.platforms && input.platforms.length > 0
            ? ` AND platform IN (${input.platforms.map(() => "?").join(",")})`
            : "";
        const res = await this.#db
            .prepare(`SELECT * FROM outbox
         WHERE state IN ('pending', 'retry')
           AND (not_before IS NULL OR not_before <= ?)${platformFilter}
         ORDER BY created_at ASC, caused_by_id ASC, effect_index ASC
         LIMIT ?`)
            .bind(input.now, ...(input.platforms ?? []), input.limit)
            .all();
        const claimed = [];
        for (const row of res.results) {
            this.#leaseSeq += 1;
            const leaseId = `oblease_${row.outbox_id}_${this.#leaseSeq}_${input.now}`;
            const leaseExpiresAt = addSeconds(input.now, input.leaseSeconds);
            const attemptNumber = JSON.parse(row.attempts).length + 1;
            // Conditional UPDATE fences a concurrent claimer: only transitions a row
            // still in a claimable state with no live lease. changes=0 => lost the race.
            const upd = await this.#db
                .prepare(`UPDATE outbox
           SET state = 'sending', lease_id = ?, lease_expires_at = ?
           WHERE outbox_id = ?
             AND state IN ('pending', 'retry')`)
                .bind(leaseId, leaseExpiresAt, row.outbox_id)
                .run();
            const changes = upd.meta?.changes;
            if (changes === 0)
                continue;
            const base = rowToOutbox({ ...row, state: "sending", lease_id: leaseId, lease_expires_at: leaseExpiresAt });
            claimed.push({ ...base, leaseId, leaseExpiresAt, attemptNumber });
        }
        return claimed;
    }
    async recordDispatchDecision(input) {
        const row = await this.#db
            .prepare(`SELECT attempts FROM outbox WHERE outbox_id = ?`)
            .bind(input.outboxId)
            .first();
        if (row === null)
            return;
        const attempts = [...JSON.parse(row.attempts), input.attempt];
        const nextNotBefore = input.nextState === "retry" && input.notBefore !== undefined ? input.notBefore : null;
        // Lease-fenced: the WHERE lease_id guard makes a stale/expired lease a no-op.
        await this.#db
            .prepare(`UPDATE outbox
         SET state = ?, attempts = ?, lease_id = NULL, lease_expires_at = NULL,
             not_before = ?
         WHERE outbox_id = ? AND lease_id = ?`)
            .bind(input.nextState, JSON.stringify(attempts), nextNotBefore, input.outboxId, input.leaseId)
            .run();
    }
    async reapExpiredLeases(input) {
        // Select the expired sending leases, then release them back to retry. We
        // gather ids first so we can honour `limit` and return an accurate count.
        const res = await this.#db
            .prepare(`SELECT outbox_id FROM outbox
         WHERE state = 'sending' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
         ORDER BY lease_expires_at ASC
         LIMIT ?`)
            .bind(input.now, input.limit)
            .all();
        let reaped = 0;
        for (const { outbox_id } of res.results) {
            const upd = await this.#db
                .prepare(`UPDATE outbox
           SET state = 'retry', lease_id = NULL, lease_expires_at = NULL
           WHERE outbox_id = ? AND state = 'sending'
             AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`)
                .bind(outbox_id, input.now)
                .run();
            if (upd.meta?.changes !== 0)
                reaped += 1;
        }
        return reaped;
    }
}
// ---------------------------------------------------------------------------
// Rate-limit store
// ---------------------------------------------------------------------------
export class D1RateLimitStore {
    #db;
    #clock;
    constructor(db, clock) {
        this.#db = db;
        this.#clock = clock;
    }
    async check(input) {
        if (input.rateKeys.length === 0)
            return { allowed: true };
        const placeholders = input.rateKeys.map(() => "?").join(",");
        const res = await this.#db
            .prepare(`SELECT rate_key, not_before FROM rate_limit
         WHERE rate_key IN (${placeholders}) AND not_before > ?
         ORDER BY not_before DESC`)
            .bind(...input.rateKeys, input.now)
            .all();
        if (res.results.length === 0)
            return { allowed: true };
        const blocked = res.results[0];
        return { allowed: false, blockedUntil: blocked.not_before, blockedRateKey: blocked.rate_key };
    }
    async update(input) {
        const now = this.#clock();
        // Keep the latest (most restrictive) block time.
        await this.#db
            .prepare(`INSERT INTO rate_limit (rate_key, not_before, reason, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(rate_key) DO UPDATE SET
           not_before = excluded.not_before,
           reason = excluded.reason,
           updated_at = excluded.updated_at
         WHERE excluded.not_before > rate_limit.not_before`)
            .bind(input.rateKey, input.notBefore, input.reason, now)
            .run();
    }
}
// ---------------------------------------------------------------------------
// Dead-letter queue
// ---------------------------------------------------------------------------
export class D1DispatchDlq {
    #db;
    constructor(db) {
        this.#db = db;
    }
    async put(entry) {
        const dlqId = `${entry.outbox.outboxId}_${entry.recordedAt}`;
        await this.#db
            .prepare(`INSERT OR IGNORE INTO dispatch_dlq
           (dlq_id, outbox_id, platform, reason, outbox, attempt, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(dlqId, entry.outbox.outboxId, entry.outbox.platform, entry.reason, JSON.stringify(entry.outbox), JSON.stringify(entry.attempt), entry.recordedAt)
            .run();
    }
}
//# sourceMappingURL=dispatch-store.js.map