import type { Clock, ClaimedOutbox, DispatchDecision, DispatchStores, EffectCodecRegistry, EffectCredentialCapability, EffectHttpTransport } from "@gest/ingest-core";
/** Tunable dispatch policy. Sensible defaults keep callers terse. */
export interface DispatchOptions {
    /** Max rows to claim per pass. Default 32. */
    readonly limit?: number;
    /** Lease seconds for a claimed `sending` row. Default 30. */
    readonly leaseSeconds?: number;
    /** Max expired leases to reap per pass. Default same as `limit`. */
    readonly reapLimit?: number;
    /** Restrict the pass to these platforms when present. */
    readonly platforms?: ClaimReadyPlatforms;
    /** Fencing/lease owner token for this dispatcher instance. Default "dispatcher". */
    readonly owner?: string;
    /**
     * Max attempts before a `retry` verdict is escalated to the DLQ as exhausted.
     * Default 8. Terminal (`failed`) verdicts go to the DLQ immediately regardless.
     */
    readonly maxAttempts?: number;
    /**
     * When true, the loop performs NO claim and NO dispatch and returns an empty
     * result. This preserves the replay/dry-run suppression invariant: effects are
     * never sent during a dry run (mirrors core `assertNoDispatchInDryRun`).
     */
    readonly dryRun?: boolean;
}
type ClaimReadyPlatforms = NonNullable<Parameters<DispatchStores["outbox"]["claimReady"]>[0]["platforms"]>;
/** What happened to one claimed row this pass. */
export type RowOutcome = "sent" | "retry" | "failed" | "rate-blocked" | "dlq-exhausted" | "dlq-no-codec" | "dlq-terminal";
/** Per-row trace, useful for assertions and observability. */
export interface DispatchRowResult {
    readonly outboxId: string;
    readonly platform: ClaimedOutbox["platform"];
    readonly outcome: RowOutcome;
    /** The codec verdict, when the row was actually sent. */
    readonly decision?: DispatchDecision;
    /** Rate key that blocked the row, when `outcome` is "rate-blocked". */
    readonly blockedRateKey?: string;
}
/** Aggregate result of one dispatch pass. */
export interface DispatchReadyResult {
    readonly reaped: number;
    readonly claimed: number;
    readonly results: readonly DispatchRowResult[];
}
/**
 * Run one dispatch pass. Pure orchestration over injected seams: the only I/O is
 * through `stores`, `transport`, and `credentials`. Returns a per-row trace.
 */
export declare function dispatchReady(stores: DispatchStores, registry: EffectCodecRegistry, transport: EffectHttpTransport, credentials: EffectCredentialCapability, clock: Clock, options?: DispatchOptions): Promise<DispatchReadyResult>;
export {};
//# sourceMappingURL=loop.d.ts.map