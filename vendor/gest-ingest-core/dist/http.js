// @gest/ingest-core / http
//
// Neutral inbound HTTP request as a provider adapter hands it to a platform
// adapter. CRITICAL invariant: `rawBody` is the exact bytes. For signed HTTP
// platforms (Slack, GitHub) the signature is verified against these bytes BEFORE
// any JSON parse. The core never parses `rawBody` here; it only carries it.
import {} from "./platform.js";
import { readBodyCapped } from "./verify.js";
/** Default inbound body cap (1 MiB) when a provider adapter supplies none. */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
/**
 * Lowercase a Web `Headers`-style iterable to a single value per key (last
 * wins), per the HeaderMap contract. Shared neutral helper for every Web-Request
 * provider (Cloudflare, Vercel, Convex) so the lowercasing + last-wins rule has
 * one definition.
 */
export function headerForEachToMap(headers) {
    const out = {};
    headers.forEach((value, key) => {
        out[key.toLowerCase()] = value;
    });
    return out;
}
/**
 * Split a request URL into a host-stripped path and the raw query string. Neutral
 * helper shared by the Web-Request providers; never used for trust, only routing/
 * audit.
 */
export function pathAndQuery(url) {
    const q = url.indexOf("?");
    if (q < 0)
        return { path: stripOrigin(url) };
    return { path: stripOrigin(url.slice(0, q)), query: url.slice(q + 1) };
}
/**
 * Strip `scheme://host` so only the path survives. Falls back to the input when
 * there is no origin (already a path).
 */
export function stripOrigin(url) {
    const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i.exec(url);
    return m ? (m[1] ?? "/") : url;
}
/**
 * Adapt a Web `Request` into the neutral `IngestHttpRequest`, pairing it with the
 * provider-built metadata. The ONE place the fetch-edge adapt happens, so every
 * fetch provider reads the body through `readBodyCapped` (the DoS body-cap guard
 * that aborts mid-stream — a chunked/no-Content-Length oversize body cannot
 * bypass it) and never parses JSON before the platform adapter verifies. Only the
 * ProviderMeta differs per provider; the caller supplies it.
 */
export async function adaptFetchRequest(request, provider, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {
    const rawBody = await readBodyCapped(request, maxBodyBytes);
    const { path, query } = pathAndQuery(request.url);
    const http = {
        method: request.method,
        path,
        headers: headerForEachToMap(request.headers),
        rawBody,
        ...(query === undefined ? {} : { query }),
    };
    return { http, provider };
}
//# sourceMappingURL=http.js.map