// @gest/ingest-core / delivery gate + message-level dedupe
//
// Two provider-neutral contracts that sit on the inbound ack path, BELOW the
// delivery-level DedupeClaim (see ./dedupe.ts) and ABOVE the runtime/outbox.
//
// 1. DeliveryGateStore — the durable delivery-work ledger. The Oracle review
//    (docs/research/oracle-slack-live-dispatch.md, Decision B) requires the
//    delivery dedupe CLAIM and the delivery_work LEDGER INSERT to be ONE atomic
//    transaction. Without it, a crash after the dedupe claim but before the work
//    is enqueued permanently suppresses a platform retry and loses the event. So
//    the gate exposes a single `prepareDelivery` that, atomically: claims the
//    delivery key AND inserts a recoverable work row. A duplicate may return 200
//    to the platform ONLY after a recoverable work row already exists.
//
//    This file owns only the CONTRACT + decoders. The atomic D1 transaction and
//    `raw.put` INSERT-OR-IGNORE live in infra; core stays I/O-free.
//
// 2. MessageDedupeStore — the message-level dedupe layer. Distinct from the
//    delivery-level DedupeClaim: a redelivery of the same webhook and a re-send
//    of the same logical message are different events with independent keys and
//    TTLs (gest research §"Idempotency = multi-layer, not single"). The platform
//    adapter derives the message key (e.g. WhatsApp `wamid`, `message_id`); core
//    never derives it.
import { decodeBoolean, decodeEnum, decodeIsoTimestamp, decodeNonEmptyString, decodeNonNegativeInt, decodeObject, field, ok, optionalField, } from "./decode.js";
import { decodeClaimBase, decodeDedupeBase } from "./dedupe-shared.js";
import { decodePlatform } from "./platform.js";
import { decodeQueueMessage } from "./queue.js";
// ---------------------------------------------------------------------------
// Delivery-work ledger
// ---------------------------------------------------------------------------
/**
 * Lifecycle of a durable delivery-work row (aligned to the Oracle review,
 * docs/research/oracle-slack-live-dispatch.md §"Add a delivery work ledger"):
 *
 *   ready      — durable, recoverable; may or may not have been queued yet. This
 *                is the state a row sits in immediately after the atomic
 *                prepare-delivery commit, BEFORE the Queue send is confirmed.
 *   queued     — a Queue send returned success at least once (markEnqueued).
 *   processing — a consumer holds the lease and is running the delivery.
 *   done       — the delivery was fully handled (completeWork).
 *   failed     — terminal give-up after exhausted/terminal failure (failWork).
 *
 * A row in ANY state proves the delivery is recoverable, which is the
 * precondition for acking a duplicate with 200. The crucial state is `ready`:
 * it is the recovery point for "dedupe claimed, Queue send not confirmed" — a
 * repair scan (listUnenqueued) re-enqueues it so the event is never lost.
 * `queued` and expired `processing` rows are also repairable: re-enqueuing
 * their durable queue pointer is safe because claimWork fences the runtime with
 * a lease, and it recovers a consumer that died after confirming enqueue or
 * while holding a processing lease.
 *
 * RECONCILIATION NOTE: the prior vocabulary was ["queued","processing","done",
 * "dead"]. The Oracle's ledger needs an explicit pre-queue `ready` state and a
 * terminal `failed`; `dead` is renamed `failed` to match the Oracle's
 * DeliveryWorkState. `queued` is retained (the existing core decoder fixture
 * uses it), so no passing test breaks.
 */
export const DELIVERY_WORK_STATES = ["ready", "queued", "processing", "done", "failed"];
export const decodeDeliveryWorkState = decodeEnum(DELIVERY_WORK_STATES);
export const decodeDeliveryWork = decodeObject({
    workId: field(decodeNonEmptyString),
    platform: field(decodePlatform),
    tenant: field(decodeNonEmptyString),
    account: field(decodeNonEmptyString),
    dedupeKey: field(decodeNonEmptyString),
    rawId: field(decodeNonEmptyString),
    state: field(decodeDeliveryWorkState),
    attempts: field(decodeNonNegativeInt),
    createdAt: field(decodeIsoTimestamp),
    updatedAt: field(decodeIsoTimestamp),
    queueMessage: optionalField(decodeQueueMessage),
    enqueuedAt: optionalField(decodeIsoTimestamp),
    notBefore: optionalField(decodeIsoTimestamp),
    lastError: optionalField(decodeNonEmptyString),
});
export const decodeDeliveryWorkClaim = decodeObject({
    workId: field(decodeNonEmptyString),
    platform: field(decodePlatform),
    tenant: field(decodeNonEmptyString),
    account: field(decodeNonEmptyString),
    dedupeKey: field(decodeNonEmptyString),
    rawId: field(decodeNonEmptyString),
    state: field(decodeDeliveryWorkState),
    attempts: field(decodeNonNegativeInt),
    createdAt: field(decodeIsoTimestamp),
    updatedAt: field(decodeIsoTimestamp),
    queueMessage: optionalField(decodeQueueMessage),
    enqueuedAt: optionalField(decodeIsoTimestamp),
    notBefore: optionalField(decodeIsoTimestamp),
    lastError: optionalField(decodeNonEmptyString),
    claimToken: field(decodeNonEmptyString),
    leaseExpiresAt: field(decodeIsoTimestamp),
});
export const decodePrepareDeliveryRequest = decodeObject({
    platform: field(decodePlatform),
    tenant: field(decodeNonEmptyString),
    account: field(decodeNonEmptyString),
    dedupeKey: field(decodeNonEmptyString),
    rawId: field(decodeNonEmptyString),
    workId: optionalField(decodeNonEmptyString),
    queueMessage: optionalField(decodeQueueMessage),
    now: field(decodeIsoTimestamp),
    retentionSeconds: field(decodeNonNegativeInt),
});
// `shouldEnqueue` is optional on the decoder (defaulting to `!duplicate` when
// absent) so the minimal pre-existing core fixture stays valid; a live store
// always sets it explicitly.
export const decodePrepareDeliveryResult = (input, path = "") => {
    const base = decodeObject({
        duplicate: field(decodeBoolean),
        work: field(decodeDeliveryWork),
        shouldEnqueue: optionalField(decodeBoolean),
    })(input, path);
    if (!base.ok)
        return base;
    const v = base.value;
    return ok({ ...v, shouldEnqueue: v.shouldEnqueue ?? !v.duplicate });
};
/** True when prepare-delivery was a first observation (work is new). */
export function acceptedForProcessing(result) {
    return !result.duplicate;
}
export const decodeMessageDedupeRequest = decodeObject({
    platform: field(decodePlatform),
    tenant: field(decodeNonEmptyString),
    account: field(decodeNonEmptyString),
    ...decodeDedupeBase,
});
export const decodeMessageDedupeClaim = decodeObject({
    ...decodeClaimBase,
});
/** True when a message-dedupe claim was a first observation. */
export function messageWasClaimed(claim) {
    return !claim.duplicate;
}
//# sourceMappingURL=delivery.js.map