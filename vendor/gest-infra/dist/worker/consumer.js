// @gest/infra / worker / queue consumer + outbox dispatcher
//
// The deferred-work stage. The fetch ack path only stored raw + claimed dedupe +
// enqueued; ALL processing and the only side-effect dispatch live here.
//
// processBatch (per message):
//   decodeBatch -> load raw (source truth) -> platform normalize -> journal append
//   (canonical event) -> runtime consumer (decision) -> runtime record -> proposals
//   -> outbox (the ONLY side-effect path; rows are pending, nothing sent yet).
//
// dispatchOutbox (separate stage):
//   read pending outbox rows -> send platform effects honoring the rate key +
//   idempotency key -> record the attempt. assertNoDispatchInDryRun guards the
//   replay path so a dry run NEVER sends. Per-artifact idempotency: a retry after a
//   partial crash re-creates exactly the missing artifacts (event/record/outbox).
//
// Replay safety: pass a ReplayContext with dryRun=true to processBatch; the same
// journal/outbox audit rows are written, but dispatchOutbox refuses to send.
import { NoopTracer, assertNoDispatchInDryRun, proposalsToOutbox, stableOutboxIdForProposal, } from "@gest/ingest-core";
import { decodeBatch, } from "@gest/ingest-cloudflare";
import { hashJson } from "@gest/ingest-core";
import { GATEWAY_FRAME_QUEUE_MESSAGE_KIND, QUEUE_MESSAGE_KIND, decodeGatewayFramePayload, decodeWorkPayload, encodeWorkPayload, eventIdFor, jobMessageId, recordIdFor, } from "../ids.js";
import { DECODER_VERSIONS, messageDedupeKeyFor, normalizeFromRaw } from "../platform-normalize.js";
import { ATTR_ACCOUNT, ATTR_DECODE_ISSUES, ATTR_DUPLICATE, ATTR_EVENT_ID, ATTR_EFFECT_METHOD, ATTR_NATIVE_KEY, ATTR_OUTBOX_ID, ATTR_OUTCOME, ATTR_PLATFORM, ATTR_RATE_KEY, ATTR_RAW_ID, ATTR_SKIPPED, ATTR_TENANT, SPAN_CLAIM_WORK, SPAN_DISPATCH_CLAIM, SPAN_MESSAGE_DEDUPE, SPAN_NORMALIZE, SPAN_OUTBOX_WRITE, SPAN_RUNTIME, } from "../observability/attributes.js";
/** Message-dedupe retention (~5m): shorter than delivery-level dedupe. */
const MESSAGE_DEDUPE_RETENTION_SECONDS = 300;
/** Delivery-dedupe retention used by the HTTP ack path and deferred gateway capture. */
const DELIVERY_RETENTION_SECONDS = 3600;
/** Consumer lease (seconds): a crashed consumer's lease is reaped after this. */
const CONSUMER_LEASE_SECONDS = 120;
/** Bound queue-batch overlap so D1/R2 latency does not serialize every event. */
const CONSUMER_BATCH_CONCURRENCY = 16;
const DISCORD_PLATFORM = "discord";
const GATEWAY_SIGNATURE = {
    kind: "not-applicable",
    scheme: "discord-gateway",
    reason: "gateway frames carry no per-frame signature (IDENTIFY-time transport trust)",
};
/**
 * Process a decoded Queue consumer batch. Acks each message after its artifacts are
 * durable; retries it on a transient failure. NO dispatch happens here — proposals
 * land in the outbox as pending rows; dispatchOutbox sends them.
 */
export async function processBatch(batch, deps) {
    const decoded = decodeBatch(batch);
    const events = [];
    const outboxKeys = [];
    const undecodableDeliveries = [];
    let skipped = 0;
    for (const u of decoded.undecodable)
        u.ack(); // poison: drop, do not loop forever.
    const outcomes = await mapWithConcurrency(decoded.decoded, CONSUMER_BATCH_CONCURRENCY, async (item) => {
        try {
            const result = await processQueueMessage(item.message, deps);
            if (result === undefined) {
                item.ack();
                return { kind: "skipped" };
            }
            else if (result.kind === "undecodable") {
                // Malformed-but-signed: surfaced, raw retained, NO side effect — and acked
                // gracefully below (NOT retried), so it never loops or 500s.
                item.ack();
                return { kind: "undecodable", rawId: result.rawId, issues: result.issues };
            }
            else {
                item.ack();
                return { kind: "event", eventId: result.eventId, outboxKeys: result.outboxKeys };
            }
        }
        catch {
            // Transient: let the platform redeliver. The per-artifact idempotency below
            // makes a retry safe (no duplicate event/record/outbox).
            item.retry();
            return { kind: "retried" };
        }
    });
    for (const outcome of outcomes) {
        if (outcome.kind === "skipped") {
            skipped += 1;
        }
        else if (outcome.kind === "undecodable") {
            undecodableDeliveries.push({ rawId: outcome.rawId, issues: outcome.issues });
        }
        else if (outcome.kind === "event") {
            events.push(outcome.eventId);
            outboxKeys.push(...outcome.outboxKeys);
        }
    }
    return {
        events,
        outboxKeys,
        undecodable: decoded.undecodable.length,
        undecodableDeliveries,
        skipped,
    };
}
async function mapWithConcurrency(items, concurrency, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workerCount = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
        for (;;) {
            const index = next;
            next += 1;
            if (index >= items.length)
                return;
            const item = items[index];
            if (item === undefined)
                return;
            results[index] = await fn(item);
        }
    }));
    return results;
}
async function processQueueMessage(message, deps) {
    if (message.kind === GATEWAY_FRAME_QUEUE_MESSAGE_KIND) {
        return processGatewayFrame(message.payload, deps);
    }
    if (message.kind === QUEUE_MESSAGE_KIND) {
        return processOne(message.payload, deps);
    }
    return undefined;
}
async function processGatewayFrame(payload, deps) {
    const frame = decodeGatewayFramePayload(payload);
    if (frame === undefined)
        return undefined;
    const raw = {
        rawId: frame.rawId,
        platform: DISCORD_PLATFORM,
        transport: "socket",
        tenant: frame.tenant,
        account: frame.account,
        receivedAt: frame.receivedAt,
        provider: {
            provider: "cloudflare",
            requestId: frame.nativeKey,
            region: "do",
            receivedAt: frame.receivedAt,
        },
        headers: {},
        body: frame.body,
        bodyHash: frame.nativeKey,
        signature: GATEWAY_SIGNATURE,
        retry: { count: 0 },
    };
    await deps.stores.raw.put(raw);
    const workId = jobMessageId(frame.rawId);
    const workPayload = encodeWorkPayload({
        rawId: frame.rawId,
        nativeKey: frame.nativeKey,
        platform: DISCORD_PLATFORM,
        tenant: frame.tenant,
    });
    const queueMessage = {
        messageId: workId,
        kind: QUEUE_MESSAGE_KIND,
        payload: workPayload,
        groupKey: `${DISCORD_PLATFORM}:${frame.account}`,
        causedByRawId: frame.rawId,
    };
    await deps.stores.delivery.prepareDelivery({
        platform: DISCORD_PLATFORM,
        tenant: frame.tenant,
        account: frame.account,
        dedupeKey: frame.nativeKey,
        rawId: frame.rawId,
        workId,
        queueMessage,
        now: frame.receivedAt,
        retentionSeconds: DELIVERY_RETENTION_SECONDS,
    });
    await deps.stores.delivery.markEnqueued({ workId, now: frame.receivedAt });
    return processOne(workPayload, deps);
}
async function processOne(payload, deps) {
    const tracer = deps.tracer ?? NoopTracer;
    const work = decodeWorkPayload(payload);
    if (work === undefined)
        return undefined;
    const workId = jobMessageId(work.rawId);
    // CLAIM WORK stage. Claim the delivery-work lease at the TOP. A duplicate Queue
    // delivery (or another worker) finds no claimable row and is skipped — this is
    // what stops a duplicate delivery from concurrently invoking the runtime. A
    // crashed consumer's lease is reaped (lease expiry) and the work re-claimed.
    const claim = await tracer.enterSpan(SPAN_CLAIM_WORK, { [ATTR_PLATFORM]: work.platform, [ATTR_TENANT]: work.tenant, [ATTR_RAW_ID]: work.rawId }, (span) => deps.stores.delivery
        .claimWork({
        workId,
        workerId: deps.workerId,
        leaseSeconds: CONSUMER_LEASE_SECONDS,
        now: deps.clock(),
    })
        .then((c) => {
        if (span.isTraced)
            span.setAttribute(ATTR_SKIPPED, c === undefined);
        return c;
    }));
    if (claim === undefined)
        return undefined;
    try {
        const result = await runClaimedWork(work, deps);
        await deps.stores.delivery.completeWork({
            workId,
            claimToken: claim.claimToken,
            now: deps.clock(),
        });
        return result;
    }
    catch (err) {
        // Re-arm the work `ready` so a Queue retry / repair scan can re-process it.
        await deps.stores.delivery.failWork({
            workId,
            claimToken: claim.claimToken,
            retryAt: deps.clock(),
            error: err instanceof Error ? err.message : String(err),
            now: deps.clock(),
        });
        throw err;
    }
}
/**
 * The body run UNDER the delivery-work lease: load raw -> normalize -> journal
 * append-once -> message dedupe claim (skip runtime + no-op record on a
 * duplicate) -> runtime.consume -> runtime record append-once -> proposals ->
 * outbox append-once. Pure over its deps; the lease + completeWork wrap it.
 */
async function runClaimedWork(work, deps) {
    const tracer = deps.tracer ?? NoopTracer;
    const eventId = eventIdFor(work.rawId);
    // NORMALIZE stage: load raw (source truth) and re-derive the normalized event in
    // the platform adapter (replay-safe: no signature re-verification, no side
    // effects). The R2/D1 raw read is CF-auto-traced; this span covers the decode.
    //
    // THE post-verify decode-failure seam: normalizeFromRaw returns a three-way
    // outcome. "undecodable" is a malformed-but-signed payload (e.g. a garbage ts).
    // We tag the span (outcome + field issues) and return an "undecodable" result so
    // the batch surfaces it — WITHOUT throwing (no 500 / no retry loop) and WITHOUT
    // fabricating a canonical event. The raw is already the durable record of the
    // bytes. "unsupported"/no-raw simply skip (return undefined).
    const normalized = await tracer.enterSpan(SPAN_NORMALIZE, { [ATTR_PLATFORM]: work.platform, [ATTR_RAW_ID]: work.rawId, [ATTR_NATIVE_KEY]: work.nativeKey }, async (span) => {
        const raw = await deps.stores.raw.get(work.rawId);
        if (raw === undefined) {
            if (span.isTraced)
                span.setAttribute(ATTR_OUTCOME, "no-raw");
            return undefined;
        }
        const outcome = normalizeFromRaw(raw, {
            tenant: work.tenant,
            rawId: work.rawId,
            receivedAt: raw.receivedAt,
            nativeKey: work.nativeKey,
        });
        if (span.isTraced)
            span.setAttribute(ATTR_OUTCOME, outcome.kind);
        if (outcome.kind === "event")
            return { raw, event: outcome.event };
        if (outcome.kind === "undecodable") {
            if (span.isTraced) {
                span.setAttribute(ATTR_DECODE_ISSUES, outcome.failure.issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; "));
            }
            return {
                kind: "undecodable",
                rawId: work.rawId,
                issues: outcome.failure.issues.map((i) => ({ path: i.path, message: i.message })),
            };
        }
        return undefined; // unsupported: no event; ack.
    });
    if (normalized === undefined)
        return undefined;
    if ("kind" in normalized)
        return normalized; // undecodable: surfaced, ack gracefully.
    const { raw, event } = normalized;
    // Journal: append-once on eventId. Skip only the append, not the rest.
    if (!(await deps.stores.journal.readEvent(eventId))) {
        await deps.stores.journal.appendEvent(buildCanonical(eventId, raw, event, work.nativeKey));
    }
    // Message-level dedupe (DISTINCT layer). On a duplicate logical message:
    // append a runtime NO-OP record (audit) and DO NOT call the runtime — so the
    // "same message arrived through two surfaces" case never double-acts.
    const messageKey = messageDedupeKeyFor(event);
    if (messageKey !== undefined) {
        // MESSAGE DEDUPE stage (the DISTINCT logical-message layer).
        const claim = await tracer.enterSpan(SPAN_MESSAGE_DEDUPE, { [ATTR_PLATFORM]: event.platform, [ATTR_TENANT]: work.tenant, [ATTR_ACCOUNT]: raw.account }, (span) => deps.stores.messageDedupe
            .claim({
            platform: event.platform,
            tenant: work.tenant,
            account: raw.account,
            key: messageKey,
            rawId: work.rawId,
            now: raw.receivedAt,
            retentionSeconds: MESSAGE_DEDUPE_RETENTION_SECONDS,
        })
            .then((c) => {
            if (span.isTraced)
                span.setAttribute(ATTR_DUPLICATE, c.duplicate);
            return c;
        }));
        if (claim.duplicate) {
            const noop = buildRecord(eventId, raw, deps.context.runtimeVersion, {
                skipped: "message-dedupe-duplicate",
                firstRawId: claim.firstRawId ?? null,
            });
            await deps.stores.journal.appendRuntimeRecord(noop);
            return { kind: "event", eventId, outboxKeys: [] };
        }
    }
    // RUNTIME stage: deterministic decision (the default consumer is deliver-only).
    const decision = await tracer.enterSpan(SPAN_RUNTIME, { [ATTR_EVENT_ID]: eventId, [ATTR_PLATFORM]: event.platform }, (span) => Promise.resolve(deps.runtime.consume(event, deps.context)).then((d) => {
        if (span.isTraced)
            span.setAttribute("gest.runtime_version", d.runtimeVersion);
        return d;
    }));
    // Runtime record: append-once on recordId.
    const record = buildRecord(eventId, raw, decision.runtimeVersion, decision.metadata);
    await deps.stores.journal.appendRuntimeRecord(record);
    // OUTBOX WRITE stage: proposals -> outbox (the ONLY side-effect path). Rows are
    // pending; nothing sent. Tenant/account/clock come from the raw delivery
    // (deterministic for replay).
    const outboxKeys = await tracer.enterSpan(SPAN_OUTBOX_WRITE, { [ATTR_EVENT_ID]: eventId, [ATTR_ACCOUNT]: raw.account }, async (span) => {
        const rows = proposalsToOutbox(decision, 
        // Phase 4: derive the row id with the SAME core helper the DX skin's
        // handles use, so a proposal's `dependsOnOutboxIds` (a handle's outboxId)
        // resolves to a real row byte-for-byte.
        (p, i) => stableOutboxIdForProposal(decision, p, i, hashJson), { tenant: work.tenant, account: raw.account, createdAt: raw.receivedAt });
        const keys = [];
        for (const row of rows) {
            await deps.stores.outbox.enqueue(row);
            keys.push(row.idempotencyKey);
        }
        if (span.isTraced)
            span.setAttribute("gest.outbox_rows", keys.length);
        return keys;
    });
    return { kind: "event", eventId, outboxKeys };
}
function buildCanonical(eventId, raw, event, nativeKey) {
    const source = {
        [event.platform]: { nativeKey, eventKind: event.kind },
    };
    return {
        eventId,
        platform: event.platform,
        rawId: event.provenance.rawId,
        nativeKey,
        decoderVersion: DECODER_VERSIONS[event.platform],
        occurredAt: event.occurredAt ?? event.receivedAt,
        tenant: raw.tenant,
        account: raw.account,
        source,
    };
}
function buildRecord(eventId, raw, runtimeVersion, decision) {
    return {
        recordId: recordIdFor(raw.rawId),
        eventId,
        runtimeVersion,
        producedAt: raw.receivedAt,
        decision,
    };
}
/**
 * Dispatch pending outbox rows. Honors the platform RATE KEY (only one in-flight
 * send per rate key per pass, preserving per-bucket ordering) and the IDEMPOTENCY
 * KEY (a row already past "pending" is never re-sent). The dispatcher records each
 * attempt and transitions state. In a replay/dry run it sends NOTHING — proven by
 * assertNoDispatchInDryRun, which throws if any send is attempted.
 */
export async function dispatchOutbox(context, stores, sender, clock, tracer = NoopTracer) {
    const all = await stores.outbox.list();
    const pending = all.filter((e) => e.state === "pending");
    // Replay safety: dry runs must never dispatch. Enforce it before any send.
    assertNoDispatchInDryRun(context, pending.map((e) => e.outboxId));
    const sent = [];
    const skipped = [];
    const rateKeysSeen = new Set();
    for (const entry of pending) {
        // One send per rate key per pass: respect the platform bucket ordering.
        if (rateKeysSeen.has(entry.rateKey)) {
            skipped.push(entry.idempotencyKey);
            continue;
        }
        rateKeysSeen.add(entry.rateKey);
        // DISPATCH CLAIM + API call stage: the outbound side-effect for one outbox row.
        await tracer.enterSpan(SPAN_DISPATCH_CLAIM, {
            [ATTR_OUTBOX_ID]: entry.outboxId,
            [ATTR_PLATFORM]: entry.platform,
            [ATTR_EFFECT_METHOD]: entry.method,
            [ATTR_RATE_KEY]: entry.rateKey,
        }, async (span) => {
            const startedAt = clock();
            try {
                const res = await sender.send(entry);
                const attempt = {
                    attempt: entry.attempts.length + 1,
                    startedAt,
                    status: res.status,
                    ...(res.responseHash === undefined ? {} : { responseHash: res.responseHash }),
                };
                await stores.outbox.recordAttempt(entry.idempotencyKey, attempt, res.status < 400 ? "sent" : "retry");
                if (span.isTraced)
                    span.setAttribute("http.response.status_code", res.status);
                if (res.status < 400)
                    sent.push(entry.idempotencyKey);
                else
                    skipped.push(entry.idempotencyKey);
            }
            catch (err) {
                const attempt = {
                    attempt: entry.attempts.length + 1,
                    startedAt,
                    error: err instanceof Error ? err.message : String(err),
                };
                await stores.outbox.recordAttempt(entry.idempotencyKey, attempt, "retry");
                if (span.isTraced)
                    span.setAttribute(ATTR_OUTCOME, "error");
                skipped.push(entry.idempotencyKey);
            }
        });
    }
    return { sent, skipped };
}
/** Convenience: hash an effect request body for an attempt response hash. */
export function effectResponseHash(value) {
    return hashJson(value);
}
//# sourceMappingURL=consumer.js.map