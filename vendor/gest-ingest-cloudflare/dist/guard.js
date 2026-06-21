// @gest/ingest-cloudflare / inbound guard
//
// The HTTP-edge guard a Worker runs BEFORE handing bytes to a platform adapter.
// It is boring: it carries no platform knowledge and parses no JSON. It enforces
// the security rails the gest research mandates at the provider boundary, using
// the neutral primitives from @gest/ingest-core:
//
//   - content-length cap evaluated BEFORE the body is read (413, DoS guard).
//   - fail-closed on missing/empty secret AT HANDLER TIME (403), not config time.
//   - loopback-only guard for an INSECURE (no-auth) route.
//   - optional CIDR source allowlist.
//
// The guard returns a neutral InboundOutcome the Worker maps to a status code via
// `statusForOutcome`. Distinct codes, never a collapsed 400. The platform adapter
// still owns verification (401), parsing (400), and dedupe (200) downstream; this
// guard covers only the pre-read edge checks.
import { contentLengthExceeds, ipInAllowlist, isLoopbackHost, isSecretMissing, } from "@gest/ingest-core";
/**
 * Run the pre-read edge guard. Returns `"accepted"` when the request may proceed
 * to the body read + platform verification, or a distinct rejecting outcome. The
 * order matches the canonical inbound contract for the checks this edge owns:
 * missing-secret -> payload-too-large. The loopback/CIDR rails reject as
 * `not-found` (we do not reveal the route exists to a disallowed source).
 */
export function guardInbound(input) {
    // INSECURE routes are only allowed on loopback; anywhere else they do not exist.
    if (input.insecureRoute === true) {
        const host = input.sourceHost ?? "";
        if (!isLoopbackHost(host))
            return "not-found";
    }
    else if (isSecretMissing(input.secret)) {
        // Fail closed at handler time when a secured route has no usable secret.
        return "missing-secret";
    }
    // Optional CIDR source allowlist (a webhook that publishes source ranges).
    if (input.allowedCidrs !== undefined && input.allowedCidrs.length > 0) {
        const ip = input.sourceIp ?? input.headers["cf-connecting-ip"] ?? "";
        if (!ipInAllowlist(ip, input.allowedCidrs))
            return "not-found";
    }
    // Content-Length cap BEFORE the body is read.
    if (contentLengthExceeds(input.headers, input.maxBodyBytes))
        return "payload-too-large";
    return "accepted";
}
//# sourceMappingURL=guard.js.map