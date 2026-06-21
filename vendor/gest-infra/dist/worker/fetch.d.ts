import { type InboundOutcome, type Platform, type Tracer } from "@gest/ingest-core";
import { type CfFetchRequest, type CfRequestContext } from "@gest/ingest-cloudflare";
import { type PlatformSecrets } from "../platform-ingest.js";
import type { FetchStores } from "../stores.js";
import type { CloudflareQueue } from "@gest/ingest-cloudflare";
/** Everything the ack path needs, injected so it is unit-testable offline. */
export interface FetchDeps {
    readonly stores: FetchStores;
    readonly queue: CloudflareQueue;
    readonly secrets: PlatformSecrets;
    /** Resolve the per-route secret for the guard's fail-closed check. */
    secretForPlatform(platform: Platform): string | undefined;
    /** Resolve the tenant for a routed request. */
    tenantForRequest(platform: Platform, path: string): string;
    /** Max inbound body bytes per route. */
    readonly maxBodyBytes: number;
    /** Stable rawId factory (derive from bodyHash + platform for determinism). */
    rawIdFor(platform: Platform, bodyHash: string): string;
    /**
     * Domain tracer for the ack-path stages (verify / raw capture / prepareDelivery
     * / enqueue). Defaults to the NoopTracer so offline tests run unchanged; the
     * deployed Worker injects the native CloudflareTracer.
     */
    readonly tracer?: Tracer;
}
/** A neutral, framework-free response the Worker shell turns into a Response. */
export interface AckResult {
    readonly status: number;
    readonly outcome: InboundOutcome | "rejected";
    /** Body to return (handshake echo); empty for a bare ack. */
    readonly body: string;
    /** True when a QueueMessage was enqueued for the consumer. */
    readonly enqueued: boolean;
    /** True when the raw delivery was stored (false for an unrouted/guard reject). */
    readonly rawStored: boolean;
    /** True when the delivery was a duplicate (collapsed to 200). */
    readonly duplicate: boolean;
}
/**
 * Run the ack path for a single inbound request. Pure over its deps + clock; the
 * createGest `fetch` handler supplies the real bindings (via fetchDepsFromEnv).
 */
export declare function ackPath(request: CfFetchRequest, cfCtx: CfRequestContext, deps: FetchDeps): Promise<AckResult>;
//# sourceMappingURL=fetch.d.ts.map