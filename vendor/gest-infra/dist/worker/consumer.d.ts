import { type Json, type Outbox, type ReplayContext, type RuntimeConsumer, type Tracer } from "@gest/ingest-core";
import { type CfMessageBatch } from "@gest/ingest-cloudflare";
import type { ConsumerStores } from "../stores.js";
/** A post-verify decode failure surfaced by the consumer (malformed-but-signed). */
export interface UndecodableDelivery {
    readonly rawId: string;
    readonly issues: readonly {
        readonly path: string;
        readonly message: string;
    }[];
}
/** Outcome of processing one consumer batch. */
export interface ProcessOutcome {
    readonly events: readonly string[];
    readonly outboxKeys: readonly string[];
    /** Count of QUEUE-level poison messages (payload that no longer decodes). */
    readonly undecodable: number;
    /**
     * POST-VERIFY decode failures: deliveries that verified + stored but whose
     * payload is malformed (e.g. a garbage ts). The raw stayed durable; the runtime
     * never ran; no outbox row was produced; no 500 was raised. This is the
     * observable surface of the decode-failure seam — the failure is never a silent
     * vanish.
     */
    readonly undecodableDeliveries: readonly UndecodableDelivery[];
    readonly skipped: number;
}
/** Deps the consumer + dispatcher need, injected for offline tests. */
export interface ConsumerDeps {
    readonly stores: ConsumerStores;
    readonly runtime: RuntimeConsumer;
    /** Replay context; live processing uses reason="live", dryRun=false. */
    readonly context: ReplayContext;
    /** Wall clock for the consumer's delivery-work lease (ISO-8601). */
    readonly clock: () => string;
    /** This consumer instance's id (lease owner). */
    readonly workerId: string;
    /**
     * Domain tracer for the consumer stages (claimWork / normalize / message-dedupe
     * / runtime / outbox write). Defaults to the NoopTracer for offline tests; the
     * deployed Worker injects the native CloudflareTracer.
     */
    readonly tracer?: Tracer;
}
/**
 * Process a decoded Queue consumer batch. Acks each message after its artifacts are
 * durable; retries it on a transient failure. NO dispatch happens here — proposals
 * land in the outbox as pending rows; dispatchOutbox sends them.
 */
export declare function processBatch(batch: CfMessageBatch, deps: ConsumerDeps): Promise<ProcessOutcome>;
/** A platform effect sender. Returns a native-ish status + response hash. */
export interface EffectSender {
    send(entry: Outbox): Promise<{
        readonly status: number;
        readonly responseHash?: string;
    }>;
}
export interface DispatchOutcome {
    readonly sent: readonly string[];
    readonly skipped: readonly string[];
}
/**
 * Dispatch pending outbox rows. Honors the platform RATE KEY (only one in-flight
 * send per rate key per pass, preserving per-bucket ordering) and the IDEMPOTENCY
 * KEY (a row already past "pending" is never re-sent). The dispatcher records each
 * attempt and transitions state. In a replay/dry run it sends NOTHING — proven by
 * assertNoDispatchInDryRun, which throws if any send is attempted.
 */
export declare function dispatchOutbox(context: ReplayContext, stores: ConsumerStores, sender: EffectSender, clock: () => string, tracer?: Tracer): Promise<DispatchOutcome>;
/** Convenience: hash an effect request body for an attempt response hash. */
export declare function effectResponseHash(value: Json): string;
//# sourceMappingURL=consumer.d.ts.map