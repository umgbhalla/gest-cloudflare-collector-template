// @gest/ingest-github / capability
//
// Installation token minting is a CAPABILITY BOUNDARY (gest hard rule). The
// ingest path NEVER mints, caches, or refreshes a GitHub App installation token,
// and ingest-core has no knowledge of tokens at all. This module only declares
// the capability INTERFACE the dispatcher (the side-effect stage, outside ingest)
// must supply at send time. Encoding an effect (effects.ts) produces a tokenless
// EffectProposal; the dispatcher resolves a token via this capability just before
// the HTTP call.
//
// Why declare it here at all: so the boundary is explicit and typed, not implied.
// There is intentionally NO implementation in this package — supplying one would
// hide token refresh inside ingest, which the hard rules forbid.
/**
 * Guard a dispatch site against accidentally embedding a token in an ingest-built
 * effect proposal. Effect proposals are tokenless by contract; this throws if a
 * caller tries to smuggle a token field into a request body, keeping the
 * capability boundary honest. Pure check, no I/O.
 */
export function assertTokenlessRequestBody(requestBody) {
    if (requestBody !== null && typeof requestBody === "object" && !Array.isArray(requestBody)) {
        for (const key of Object.keys(requestBody)) {
            const k = key.toLowerCase();
            if (k === "token" || k === "authorization" || k === "access_token") {
                throw new Error(`effect request body must be tokenless (found "${key}"); ` +
                    "installation tokens are minted by the dispatcher capability, not ingest");
            }
        }
    }
}
//# sourceMappingURL=capability.js.map