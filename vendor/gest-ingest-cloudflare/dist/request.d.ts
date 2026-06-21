import { DEFAULT_MAX_BODY_BYTES, type FetchRequestLike, type IngestHttpRequest, type ProviderMeta, headerForEachToMap, pathAndQuery } from "@gest/ingest-core";
export { DEFAULT_MAX_BODY_BYTES };
export { headerForEachToMap as headersToMap };
/**
 * Minimal structural view of the Web `Request` a Worker `fetch` handler gets.
 * Declared structurally so this package needs no `@cloudflare/workers-types`
 * dependency and stays boring.
 */
export type CfFetchRequest = FetchRequestLike;
/**
 * Cloudflare request context fields a Worker exposes (`request.cf`, the
 * colo/region, and the per-request ray id from `cf-ray`). All optional; none are
 * interpreted, they are recorded as provider metadata only.
 */
export interface CfRequestContext {
    /** Receive timestamp (ISO-8601); the caller supplies a clock for determinism. */
    readonly receivedAt: string;
    /** Cloudflare ray id; used as the host request id when present. */
    readonly rayId?: string;
    /** Colo / region code from `request.cf.colo`, recorded verbatim. */
    readonly colo?: string;
    /** Worker deployment/version id, when the binding exposes one. */
    readonly deploymentId?: string;
}
export { pathAndQuery };
/** Build neutral provider metadata for a Cloudflare invocation. */
export declare function cloudflareProviderMeta(ctx: CfRequestContext): ProviderMeta;
/**
 * Adapt a Worker fetch Request into the neutral request shape via the core
 * `adaptFetchRequest` (exact bytes through the capped guard; see the file banner).
 * Performs no verification or parsing.
 */
export declare function adaptCloudflareRequest(request: CfFetchRequest, ctx: CfRequestContext, maxBodyBytes?: number): Promise<{
    http: IngestHttpRequest;
    provider: ProviderMeta;
}>;
//# sourceMappingURL=request.d.ts.map