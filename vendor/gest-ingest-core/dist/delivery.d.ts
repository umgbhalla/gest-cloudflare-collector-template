import { type Decoder } from "./decode.js";
import { type Platform } from "./platform.js";
import { type QueueMessage } from "./queue.js";
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
export declare const DELIVERY_WORK_STATES: readonly ["ready", "queued", "processing", "done", "failed"];
export type DeliveryWorkState = (typeof DELIVERY_WORK_STATES)[number];
export declare const decodeDeliveryWorkState: Decoder<DeliveryWorkState>;
/**
 * A durable delivery-work ledger row. Created atomically with the delivery
 * dedupe claim so a recoverable unit of work always exists before any ack.
 *
 * `queueMessage` is the pointer payload (workId/rawId/nativeKey, NOT the raw
 * body) the consumer is handed; it is optional on the record decoder only so the
 * minimal core fixture stays valid — a row produced by `prepareDelivery` always
 * carries it.
 */
export interface DeliveryWork {
    /** Stable work id (derived from the delivery key by the platform/infra). */
    readonly workId: string;
    readonly platform: Platform;
    readonly tenant: string;
    readonly account: string;
    /** Delivery-level dedupe key this work was claimed under. */
    readonly dedupeKey: string;
    /** Raw delivery that won the claim / source-truth pointer. */
    readonly rawId: string;
    readonly state: DeliveryWorkState;
    readonly attempts: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    /** Queue pointer the consumer processes (pointer only, never the raw body). */
    readonly queueMessage?: QueueMessage;
    /** When the row was confirmed enqueued (ISO-8601); absent while `ready`. */
    readonly enqueuedAt?: string;
    /** Earliest time the work may be (re)processed (ISO-8601). */
    readonly notBefore?: string;
    /** Last error recorded by `failWork`, for audit. */
    readonly lastError?: string;
}
export declare const decodeDeliveryWork: Decoder<DeliveryWork>;
/**
 * A delivery-work row claimed by a consumer for processing. Carries the lease
 * token the consumer must echo on completeWork/failWork (fencing) and the lease
 * expiry, so a crashed consumer's lease can be reaped and retried.
 */
export interface DeliveryWorkClaim extends DeliveryWork {
    /** Fencing token; completeWork/failWork must present it to mutate the row. */
    readonly claimToken: string;
    readonly leaseExpiresAt: string;
}
export declare const decodeDeliveryWorkClaim: Decoder<DeliveryWorkClaim>;
/**
 * Input to the atomic prepare-delivery operation: claim the delivery key AND
 * insert/ensure the work row in ONE transaction. `workId` and `queueMessage` are
 * optional only so the minimal core fixture stays valid; a live ack path always
 * supplies both. When omitted, an implementation derives `workId` from the
 * dedupe key deterministically.
 */
export interface PrepareDeliveryRequest {
    readonly platform: Platform;
    readonly tenant: string;
    readonly account: string;
    readonly dedupeKey: string;
    readonly rawId: string;
    /** Stable work id (defaults to a deterministic derivation of the dedupe key). */
    readonly workId?: string;
    /** Queue pointer payload to persist on the work row (pointer only). */
    readonly queueMessage?: QueueMessage;
    /** Caller's current time (ISO-8601). */
    readonly now: string;
    /** Delivery-dedupe retention window in seconds. */
    readonly retentionSeconds: number;
}
export declare const decodePrepareDeliveryRequest: Decoder<PrepareDeliveryRequest>;
/**
 * Result of `prepareDelivery`. `duplicate` is true when the key was already
 * claimed; in that case `work` still points at the recoverable row so a duplicate
 * can be acked with 200 safely. `acceptedForProcessing` is true only on a first
 * observation (i.e. `!duplicate`) — derive it rather than trusting a second bit.
 */
export interface PrepareDeliveryResult {
    readonly duplicate: boolean;
    /** The recoverable work row (newly inserted or the pre-existing one). */
    readonly work: DeliveryWork;
    /**
     * True when the caller should (re)enqueue the work's queue message: either a
     * first observation, or a DUPLICATE whose work row has not yet reached a
     * `queued`/`processing`/`done` state (the crash-recovery repair path). Derive
     * it rather than re-deriving from `duplicate` at every call site.
     */
    readonly shouldEnqueue: boolean;
}
export declare const decodePrepareDeliveryResult: Decoder<PrepareDeliveryResult>;
/** True when prepare-delivery was a first observation (work is new). */
export declare function acceptedForProcessing(result: PrepareDeliveryResult): boolean;
/** Input to claim a delivery-work row for processing under a lease. */
export interface ClaimDeliveryWork {
    readonly workId: string;
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
}
/** Input to complete a claimed delivery-work row (lease-checked). */
export interface CompleteDeliveryWork {
    readonly workId: string;
    readonly claimToken: string;
    readonly now: string;
}
/** Input to fail a claimed delivery-work row (lease-checked). */
export interface FailDeliveryWork {
    readonly workId: string;
    readonly claimToken: string;
    /** When the row may be retried (ISO-8601); absent for a terminal failure. */
    readonly retryAt?: string;
    /** True for a terminal give-up (-> `failed`); false re-arms `ready`. */
    readonly terminal?: boolean;
    readonly error: string;
    readonly now: string;
}
/**
 * The durable delivery gate (Oracle review, Decision B). `prepareDelivery` MUST
 * perform the dedupe claim AND the work-ledger insert in ONE transaction
 * (atomicity rule): it must NEVER report `duplicate` without a recoverable work
 * row. The lifecycle methods give the consumer at-least-once processing with a
 * lease so duplicate Queue deliveries cannot double-invoke the runtime:
 *
 *   - markEnqueued     — record that the Queue send was confirmed (`ready`->`queued`).
 *   - listUnenqueued   — rows still `ready` (never confirmed queued).
 *   - listRepairable   — scheduled repair rows: `ready`, `queued`, or expired
 *                        `processing`.
 *   - claimWork        — atomically lease a `ready`/`queued`/expired `processing`
 *                        row for processing.
 *   - completeWork     — lease-checked terminal success (-> `done`).
 *   - failWork         — lease-checked retry/terminal failure.
 *
 * Implemented in @gest/ingest-local (memory + fs reference) for offline proofs,
 * and in infra against D1 for production; core owns the contract only.
 */
export interface DeliveryGateStore {
    prepareDelivery(input: PrepareDeliveryRequest): Promise<PrepareDeliveryResult>;
    /** Confirm the Queue send for a work row (`ready` -> `queued`). Idempotent. */
    markEnqueued(input: {
        readonly workId: string;
        readonly now: string;
    }): Promise<void>;
    /** Rows that are still `ready` (recoverable but never confirmed queued). */
    listUnenqueued(input: {
        readonly now: string;
        readonly limit: number;
    }): Promise<readonly DeliveryWork[]>;
    /**
     * Rows whose durable queue pointer should be re-enqueued by a repair scan:
     * never-confirmed `ready`, confirmed-but-unclaimed `queued`, or `processing`
     * rows whose lease has expired. Re-enqueue is intentionally at-least-once; the
     * `claimWork` lease is the runtime fence.
     */
    listRepairable(input: {
        readonly now: string;
        readonly limit: number;
    }): Promise<readonly DeliveryWork[]>;
    /**
     * Atomically lease a claimable (`ready`/`queued`, or expired `processing`) work
     * row for processing. Returns `undefined` when no claimable row exists, a
     * retry delay has not elapsed, or another worker already holds a live lease —
     * this is what prevents a duplicate Queue delivery from concurrently invoking
     * the runtime.
     */
    claimWork(input: ClaimDeliveryWork): Promise<DeliveryWorkClaim | undefined>;
    /** Lease-checked success: transition `processing` -> `done`. */
    completeWork(input: CompleteDeliveryWork): Promise<void>;
    /** Lease-checked failure: re-arm `ready` (with `retryAt`) or terminal `failed`. */
    failWork(input: FailDeliveryWork): Promise<void>;
}
/**
 * A claim request for the MESSAGE-level dedupe layer. Keyed by a platform's
 * logical message id (e.g. WhatsApp `wamid`, `message_id`) with a SHORTER
 * window than delivery-level dedupe. The platform adapter derives `key`.
 */
export interface MessageDedupeRequest {
    readonly platform: Platform;
    readonly tenant: string;
    readonly account: string;
    /** Platform-owned logical message id. */
    readonly key: string;
    /** Raw delivery this message arrived on. */
    readonly rawId: string;
    readonly now: string;
    /** Message-dedupe retention window in seconds (typically shorter, ~5m). */
    readonly retentionSeconds: number;
}
export declare const decodeMessageDedupeRequest: Decoder<MessageDedupeRequest>;
/** Result of a message-level dedupe claim. */
export interface MessageDedupeClaim {
    readonly key: string;
    readonly duplicate: boolean;
    readonly firstRawId?: string;
    readonly claimedAt?: string;
}
export declare const decodeMessageDedupeClaim: Decoder<MessageDedupeClaim>;
/** True when a message-dedupe claim was a first observation. */
export declare function messageWasClaimed(claim: MessageDedupeClaim): boolean;
/**
 * The message-level dedupe store. A SEPARATE seam from the delivery-level
 * dedupe (see ./dedupe.ts); keys and TTLs are independent and MUST NOT be
 * merged. Implemented in infra; core owns the contract only.
 */
export interface MessageDedupeStore {
    claim(input: MessageDedupeRequest): Promise<MessageDedupeClaim>;
}
//# sourceMappingURL=delivery.d.ts.map