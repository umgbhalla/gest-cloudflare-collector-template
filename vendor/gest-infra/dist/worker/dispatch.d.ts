import { type DispatchOptions, type DispatchReadyResult, type DispatchStores, type EffectCodecRegistry } from "@gest/ingest-dispatch";
import { type Clock, type DeliveryGateStore, type EffectCredentialCapability, type EffectHttpTransport, type Tracer } from "@gest/ingest-core";
import type { CloudflareQueue } from "@gest/ingest-cloudflare";
/** The codec registry for the vertical slice — Slack only, but extensible. */
export declare const SLACK_CODEC_REGISTRY: EffectCodecRegistry;
/** Everything the dispatch stage needs, injected so it runs offline against fakes. */
export interface DispatchDeps {
    readonly stores: DispatchStores;
    readonly delivery: DeliveryGateStore;
    readonly queue: CloudflareQueue;
    readonly transport: EffectHttpTransport;
    readonly credentials: EffectCredentialCapability;
    readonly clock: Clock;
    /** Codec registry; defaults to Slack-only. */
    readonly registry?: EffectCodecRegistry;
    /** Dispatch loop tuning (limit/lease/maxAttempts/dryRun...). */
    readonly options?: DispatchOptions;
    /** Max repairable delivery_work rows to re-enqueue per pass. Default 32. */
    readonly repairLimit?: number;
    /**
     * Domain tracer for the dispatch + repair stages. The dispatch loop internals
     * (claim/codec/API call) live in the pure @gest/ingest-dispatch package and are
     * not instrumented from there (it must not import cloudflare:workers); infra
     * wraps the pass + the repair scan here. Defaults to the NoopTracer.
     */
    readonly tracer?: Tracer;
}
/** Outcome of one dispatch+repair pass. */
export interface DispatchPassResult {
    readonly dispatch: DispatchReadyResult;
    /** Number of repairable delivery_work rows re-enqueued this pass. */
    readonly repaired: number;
}
/**
 * Re-enqueue delivery_work rows that need a fresh queue pointer. Idempotent:
 * markEnqueued flips ready->queued, queued rows stay queued, and expired
 * processing rows are re-claimable only after their lease expires.
 */
export declare function repairUnenqueued(deps: DispatchDeps): Promise<number>;
/**
 * Run one dispatch pass + the repair scan. This is the body a scheduled trigger
 * (cron) or a dispatch-queue consumer invokes. Dry-run suppression is preserved:
 * with `options.dryRun`, the loop claims nothing and sends nothing.
 */
export declare function dispatchPass(deps: DispatchDeps): Promise<DispatchPassResult>;
//# sourceMappingURL=dispatch.d.ts.map