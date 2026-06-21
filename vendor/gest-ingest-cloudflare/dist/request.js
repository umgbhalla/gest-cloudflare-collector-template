// @gest/ingest-cloudflare / request
//
// Turn a Cloudflare Worker `fetch` Request into the neutral IngestHttpRequest.
//
// CRITICAL invariant (gest hard rule): this reads the body as EXACT bytes through
// the core `readBodyCapped` streaming guard (which enforces the DoS body cap mid
// read) and never parses JSON. No signature check, no JSON parse, no platform
// knowledge happens here. The platform adapter verifies and decodes downstream.
import { DEFAULT_MAX_BODY_BYTES, adaptFetchRequest, headerForEachToMap, pathAndQuery, } from "@gest/ingest-core";
export { DEFAULT_MAX_BODY_BYTES };
// Lowercase headers to a single value (last wins), per HeaderMap contract — the
// core helper verbatim; no provider-specific header handling exists.
export { headerForEachToMap as headersToMap };
export { pathAndQuery };
/** Build neutral provider metadata for a Cloudflare invocation. */
export function cloudflareProviderMeta(ctx) {
    const extra = {};
    if (ctx.colo !== undefined)
        extra["colo"] = ctx.colo;
    return {
        provider: "cloudflare",
        requestId: ctx.rayId ?? `cf_${ctx.receivedAt}`,
        receivedAt: ctx.receivedAt,
        ...(ctx.colo === undefined ? {} : { region: ctx.colo }),
        ...(ctx.deploymentId === undefined ? {} : { deploymentId: ctx.deploymentId }),
        ...(Object.keys(extra).length === 0 ? {} : { extra }),
    };
}
/**
 * Adapt a Worker fetch Request into the neutral request shape via the core
 * `adaptFetchRequest` (exact bytes through the capped guard; see the file banner).
 * Performs no verification or parsing.
 */
export function adaptCloudflareRequest(request, ctx, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {
    return adaptFetchRequest(request, cloudflareProviderMeta(ctx), maxBodyBytes);
}
//# sourceMappingURL=request.js.map