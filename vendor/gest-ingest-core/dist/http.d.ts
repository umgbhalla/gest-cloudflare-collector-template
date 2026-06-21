import { type HeaderMap, type ProviderMeta } from "./platform.js";
/** Default inbound body cap (1 MiB) when a provider adapter supplies none. */
export declare const DEFAULT_MAX_BODY_BYTES: number;
/**
 * Exact inbound HTTP request bytes plus metadata. Body is kept as bytes; the
 * core does not assume a charset or content type. A provider adapter constructs
 * this; a platform adapter verifies and decodes it.
 */
export interface IngestHttpRequest {
    readonly method: string;
    /** Request path (no host), used only for routing/audit, never for trust. */
    readonly path: string;
    readonly headers: HeaderMap;
    /** Exact request body bytes. Signature verification uses these. */
    readonly rawBody: Uint8Array;
    /** Optional query string (raw, undecoded), for polling/export transports. */
    readonly query?: string;
}
/**
 * Lowercase a Web `Headers`-style iterable to a single value per key (last
 * wins), per the HeaderMap contract. Shared neutral helper for every Web-Request
 * provider (Cloudflare, Vercel, Convex) so the lowercasing + last-wins rule has
 * one definition.
 */
export declare function headerForEachToMap(headers: {
    forEach(cb: (value: string, key: string) => void): void;
}): HeaderMap;
/**
 * Split a request URL into a host-stripped path and the raw query string. Neutral
 * helper shared by the Web-Request providers; never used for trust, only routing/
 * audit.
 */
export declare function pathAndQuery(url: string): {
    path: string;
    query?: string;
};
/**
 * Strip `scheme://host` so only the path survives. Falls back to the input when
 * there is no origin (already a path).
 */
export declare function stripOrigin(url: string): string;
/**
 * Structural view of the Web `Request` every fetch-style provider (Cloudflare
 * Worker, Vercel route handler, Convex httpAction) receives. Declared
 * structurally so no provider needs a platform `@types` dependency.
 */
export interface FetchRequestLike {
    readonly method: string;
    readonly url: string;
    readonly headers: {
        forEach(cb: (value: string, key: string) => void): void;
    };
    /** Web ReadableStream body; preferred so the cap aborts mid-stream. */
    readonly body?: ReadableStream<Uint8Array> | null;
    arrayBuffer(): Promise<ArrayBuffer>;
}
/**
 * Adapt a Web `Request` into the neutral `IngestHttpRequest`, pairing it with the
 * provider-built metadata. The ONE place the fetch-edge adapt happens, so every
 * fetch provider reads the body through `readBodyCapped` (the DoS body-cap guard
 * that aborts mid-stream — a chunked/no-Content-Length oversize body cannot
 * bypass it) and never parses JSON before the platform adapter verifies. Only the
 * ProviderMeta differs per provider; the caller supplies it.
 */
export declare function adaptFetchRequest(request: FetchRequestLike, provider: ProviderMeta, maxBodyBytes?: number): Promise<{
    http: IngestHttpRequest;
    provider: ProviderMeta;
}>;
//# sourceMappingURL=http.d.ts.map