import { type Decoder } from "./decode.js";
/** Platforms the core must remain portable across from the first commit. */
export declare const PLATFORMS: readonly ["slack", "discord", "telegram", "github"];
export type Platform = (typeof PLATFORMS)[number];
/** How a delivery physically arrived. Verification differs per transport. */
export declare const TRANSPORTS: readonly ["http", "socket", "polling", "export"];
export type Transport = (typeof TRANSPORTS)[number];
/** Cloud/runtime hosts a provider adapter may run on. Neutral metadata only. */
export declare const PROVIDERS: readonly ["cloudflare", "vercel", "lambda", "convex", "node", "unknown"];
export type Provider = (typeof PROVIDERS)[number];
/**
 * Provider-supplied request/invocation metadata. Boring by mandate: it never
 * carries platform or runtime policy, only "where/when did this byte stream
 * arrive". `region` and `deploymentId` are optional because not every host has
 * them. `extra` is an opaque bag for host-specific identifiers.
 */
export interface ProviderMeta {
    readonly provider: Provider;
    /** Request or invocation id assigned by the host. */
    readonly requestId: string;
    /** Host receive timestamp (ISO-8601). */
    readonly receivedAt: string;
    readonly region?: string;
    readonly deploymentId?: string;
    /** Opaque host-specific identifiers, never interpreted by the core. */
    readonly extra?: Readonly<Record<string, string>>;
}
/**
 * Normalized HTTP header map: lowercased keys to the last value. Provider
 * adapters normalize raw headers into this before handing them to a platform
 * adapter. Multi-value headers are joined by the provider adapter if needed.
 */
export type HeaderMap = Readonly<Record<string, string>>;
export declare const decodePlatform: Decoder<Platform>;
export declare const decodeTransport: Decoder<Transport>;
export declare const decodeProvider: Decoder<Provider>;
export declare const decodeHeaderMap: Decoder<HeaderMap>;
export declare const decodeProviderMeta: Decoder<ProviderMeta>;
//# sourceMappingURL=platform.d.ts.map