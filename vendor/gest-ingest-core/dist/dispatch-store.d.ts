import type { Outbox, OutboxAttempt } from "./outbox.js";
import type { Platform } from "./platform.js";
import type { EffectCredentialCapability, EffectHttpTransport, PlatformEffectCodec, RateLimitUpdate } from "./dispatch.js";
/**
 * Injected wall clock. The loop reads time once per pass start and threads that
 * instant everywhere, so dispatch math is deterministic and the loop performs no
 * ambient I/O. Returns an ISO-8601 timestamp.
 */
export interface Clock {
    now(): string;
}
/** Input to atomically claim ready outbox rows. */
export interface ClaimReadyOutbox {
    /** Caller's current time (ISO-8601). */
    readonly now: string;
    /** Maximum number of rows to claim this pass. */
    readonly limit: number;
    /** Lease duration in seconds attached to each claimed row. */
    readonly leaseSeconds: number;
    /** Restrict the claim to these platforms when present. */
    readonly platforms?: readonly Platform[];
    /** Fencing/lease owner token the store attaches to claimed rows. */
    readonly owner: string;
}
/**
 * A `pending|retry` row transitioned to `sending` under a lease. Carries the
 * fencing token the dispatcher must echo back on `recordDispatchDecision`, the
 * attempt number for this send, and the explicit rate buckets to gate on.
 */
export interface ClaimedOutbox extends Outbox {
    readonly leaseId: string;
    readonly leaseExpiresAt: string;
    /** 1-based attempt number for the send the dispatcher is about to make. */
    readonly attemptNumber: number;
}
/** Apply one codec verdict to a claimed row, verifying the fencing token. */
export interface RecordDispatchDecision {
    readonly outboxId: string;
    /** Lease/fencing token from the claim; a stale token must be rejected. */
    readonly leaseId: string;
    readonly attempt: OutboxAttempt;
    readonly nextState: "sent" | "retry" | "failed";
    /** Earliest retry time (ISO-8601) for a `retry` transition. */
    readonly notBefore?: string;
    /** DLQ classification when `nextState` is "failed". */
    readonly dlqReason?: string;
    readonly now: string;
}
/** Input to release expired `sending` leases back to `retry`. */
export interface ReapOutboxLeases {
    /** Caller's current time (ISO-8601). */
    readonly now: string;
    /** Maximum number of leases to reap this pass. */
    readonly limit: number;
}
/**
 * The durable outbox the dispatcher drives. All three methods MUST be atomic
 * with respect to concurrent dispatchers: a row is claimed by exactly one
 * lease, a stale lease cannot record a decision, and a reaped row returns to
 * `retry` so a healthy dispatcher can pick it up again.
 */
export interface OutboxDispatchStore {
    /**
     * Atomically claim ready rows: `pending|retry` whose `notBefore` (if any) has
     * passed, ordered deterministically, transitioned to `sending` with a fresh
     * lease. Must not return a row that is already `sending` under a live lease.
     *
     * A row carrying `dependsOnOutboxIds` is NOT ready until EVERY listed id has
     * reached terminal `sent`; an unmet dependency holds the row back (it is not
     * claimed, dispatched, or DLQ'd by this gate). This enforces the Phase-4
     * `.after(...)` sequencing as a claim-time predicate, never a fabricated id.
     */
    claimReady(input: ClaimReadyOutbox): Promise<readonly ClaimedOutbox[]>;
    /**
     * Record one attempt and transition the row, verifying `leaseId`. A mismatched
     * or expired lease MUST NOT mutate the row (returns silently / rejects the
     * stale writer). `sent`/`failed` are terminal; `retry` re-arms with `notBefore`.
     */
    recordDispatchDecision(input: RecordDispatchDecision): Promise<void>;
    /** Release expired `sending` leases back to `retry`; returns the count reaped. */
    reapExpiredLeases(input: ReapOutboxLeases): Promise<number>;
}
/** Result of checking whether all of a row's rate buckets are available. */
export interface RateLimitCheck {
    readonly allowed: boolean;
    /** Earliest time the blocked bucket frees up (ISO-8601), when blocked. */
    readonly blockedUntil?: string;
    /** Which rate key blocked the row, when blocked. */
    readonly blockedRateKey?: string;
}
/**
 * Shared rate-bucket state. The loop checks ALL of a row's `rateKeys` before
 * sending and applies any `RateLimitUpdate`s a codec emits (e.g. on a 429).
 */
export interface RateLimitStore {
    /** True only when every rate key is currently available. */
    check(input: {
        readonly rateKeys: readonly string[];
        readonly now: string;
    }): Promise<RateLimitCheck>;
    /** Defer a single bucket until `update.notBefore`. */
    update(input: RateLimitUpdate): Promise<void>;
}
/** A row routed out of the live path after a terminal/exhausted verdict. */
export interface DlqEntry {
    readonly outbox: Outbox;
    readonly reason: string;
    /** The final attempt that produced the terminal verdict. */
    readonly attempt: OutboxAttempt;
    readonly recordedAt: string;
}
/** Sink for exhausted/terminal rows. Provider wires the durable implementation. */
export interface DispatchDlq {
    put(entry: DlqEntry): Promise<void>;
}
/** The durable surfaces the dispatch loop needs, injected as one bundle. */
export interface DispatchStores {
    readonly outbox: OutboxDispatchStore;
    readonly rate: RateLimitStore;
    readonly dlq: DispatchDlq;
}
/**
 * Platform-codec registry, keyed by platform. The CALLER registers codecs
 * (e.g. `{ slack: slackEffectCodec }`); the loop is platform-agnostic and never
 * imports a platform package. A row whose platform has no registered codec is
 * routed to the DLQ rather than silently dropped.
 */
export type EffectCodecRegistry = Partial<Record<Platform, PlatformEffectCodec>>;
export type { EffectCredentialCapability, EffectHttpTransport };
//# sourceMappingURL=dispatch-store.d.ts.map