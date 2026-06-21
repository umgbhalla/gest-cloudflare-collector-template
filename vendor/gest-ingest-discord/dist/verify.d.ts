import { type HeaderMap, type IngestHttpRequest, type VerifyVerdict } from "@gest/ingest-core";
/** Signing scheme name recorded on every Discord signature verdict. */
export declare const DISCORD_SIGNATURE_SCHEME = "discord-ed25519";
/** Header names Discord attaches to a signed interaction delivery. */
export declare const DISCORD_SIGNATURE_HEADER = "x-signature-ed25519";
export declare const DISCORD_TIMESTAMP_HEADER = "x-signature-timestamp";
/** Inputs to verify a Discord interaction HTTP delivery. */
export interface DiscordVerifyOptions {
    /** Application hex-encoded Ed25519 public key (64 hex chars / 32 bytes). */
    readonly publicKeyHex: string;
    /**
     * Caller's current epoch seconds, for optional skew rejection. Only consulted
     * when `maxSkewSeconds` is set; supply it for deterministic tests.
     */
    readonly nowEpochSeconds?: number;
    /**
     * Optional replay window in seconds. When set, a timestamp further than this
     * from `nowEpochSeconds` yields an "expired" verdict. Off by default.
     */
    readonly maxSkewSeconds?: number;
    /** Optional key id for rotation audit (recorded, never the secret material). */
    readonly keyId?: string;
}
/** A verified result also surfaces captured native retry metadata (none for HTTP). */
export type DiscordVerification = VerifyVerdict;
/**
 * Verify a Discord interaction request over its exact bytes. Returns a structured
 * verdict; it NEVER throws on a bad signature (that is normal probe traffic) and
 * NEVER parses the body. The caller stores the verdict on the raw delivery and
 * decides what to do with a non-"verified" result.
 */
export declare function verifyDiscordRequest(request: IngestHttpRequest, opts: DiscordVerifyOptions): DiscordVerification;
/** Build the exact signed message: timestamp bytes followed by the raw body bytes. */
export declare function bindTimestamp(timestamp: string, rawBody: Uint8Array): Uint8Array;
/** Header reader kept exported so a provider adapter can pre-flight presence. */
export declare function hasDiscordSignatureHeaders(headers: HeaderMap): boolean;
//# sourceMappingURL=verify.d.ts.map