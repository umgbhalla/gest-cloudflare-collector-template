import { type Decoder } from "./decode.js";
import { type HeaderMap, type Platform, type ProviderMeta, type Transport } from "./platform.js";
/**
 * Verdict of a signed-platform signature check. The platform adapter owns the
 * algorithm; the core only records the verdict so replay and audit are honest.
 */
export declare const SIGNATURE_KINDS: readonly ["verified", "rejected", "missing", "expired", "unsupported", "not-applicable"];
export type SignatureKind = (typeof SIGNATURE_KINDS)[number];
/**
 * Where a delivery's envelope sits relative to signature verification. Most
 * signed HTTP platforms (Slack/GitHub/Discord/Telegram) are "verify-then-decode":
 * the signature is over the exact transport bytes, verified before any parse.
 * Some platforms (WeCom AES-128-CBC+SHA1, QQBot AES-256-GCM, WeChat AES-128-ECB)
 * are "decrypt-then-verify": the transport carries an ENCRYPTED envelope and the
 * platform adapter must decode it before/around verification. The core records
 * which shape applied so replay and audit stay honest; it owns NEITHER algorithm.
 */
export declare const ENVELOPE_DECODE_MODES: readonly ["verify-then-decode", "decrypt-then-verify"];
export type EnvelopeDecodeMode = (typeof ENVELOPE_DECODE_MODES)[number];
/**
 * Audit record of a platform-owned envelope decode step. This lives in the
 * PLATFORM layer; the core only records that a step happened and its outcome, so
 * an encrypted platform's replay is honest. The ENCRYPTED bytes remain the
 * durable raw truth (RawDelivery.body); the decoded plaintext is NEVER stored on
 * the raw record. `cryptoScheme` names the platform's algorithm (e.g.
 * "wecom-aes-128-cbc", "qqbot-aes-256-gcm") for audit, never a key.
 */
export interface EnvelopeDecode {
    readonly mode: EnvelopeDecodeMode;
    /** True when the platform's decode step succeeded. */
    readonly decoded: boolean;
    /** Platform crypto scheme name, for audit. Never a key or plaintext. */
    readonly cryptoScheme?: string;
    /** Reason a decode failed, for security audit. */
    readonly reason?: string;
}
/** Result of verifying (or failing to verify) a delivery's authenticity. */
export interface SignatureResult {
    readonly kind: SignatureKind;
    /** Signing scheme name owned by the platform adapter, e.g. "slack-v0". */
    readonly scheme?: string;
    /** Key id / secret reference used, for rotation audit. Never the secret. */
    readonly keyId?: string;
    /** Reason for a non-verified verdict, for security audit. */
    readonly reason?: string;
    /**
     * Number of candidate signatures presented (Svix-style space-separated
     * rotation: any one valid candidate verifies). 1 for single-signature schemes.
     * Recorded for rotation audit so replay shows the multi-sig path was taken.
     */
    readonly candidatesPresented?: number;
    /**
     * Index (0-based) of the candidate that verified, when `kind === "verified"`
     * and more than one candidate was presented. Lets audit pin which rotation key
     * matched without storing the signatures themselves.
     */
    readonly candidateMatched?: number;
    /**
     * Platform-owned envelope decode audit, present ONLY for decrypt-then-verify
     * platforms. Absent for the verify-then-decode default (Slack/GitHub/etc.).
     */
    readonly envelope?: EnvelopeDecode;
}
/**
 * Native retry signal the platform attached to a redelivery. Captured so dedupe
 * and replay can distinguish first delivery from platform-driven retries.
 */
export interface RetryMeta {
    /** Native retry count if the platform sends one (e.g. Slack X-Slack-Retry-Num). */
    readonly count: number;
    /** Native retry reason string if present. */
    readonly reason?: string;
}
/**
 * Durable raw delivery record. `bodyHash` is a stable hash of the exact bytes.
 * `body` may be absent (e.g. stored as a blob elsewhere, or omitted for rejected
 * signatures) but `bodyHash` is always present for audit/replay correlation.
 */
export interface RawDelivery {
    readonly rawId: string;
    readonly platform: Platform;
    readonly transport: Transport;
    /** Product tenant. */
    readonly tenant: string;
    /** Platform account/workspace/guild/bot install scope. */
    readonly account: string;
    readonly receivedAt: string;
    readonly provider: ProviderMeta;
    readonly headers: HeaderMap;
    /** Exact bytes, hex/base64 at rest; optional when stored out-of-row. */
    readonly body?: string;
    readonly bodyHash: string;
    readonly signature: SignatureResult;
    readonly retry: RetryMeta;
    /** Platform install/team/guild/bot reference when known. */
    readonly installRef?: string;
}
export declare const decodeSignatureKind: Decoder<SignatureKind>;
export declare const decodeEnvelopeDecodeMode: Decoder<EnvelopeDecodeMode>;
export declare const decodeEnvelopeDecode: Decoder<EnvelopeDecode>;
export declare const decodeSignatureResult: Decoder<SignatureResult>;
export declare const decodeRetryMeta: Decoder<RetryMeta>;
export declare const decodeRawDelivery: Decoder<RawDelivery>;
/**
 * Provider-neutral inputs every platform's raw assembly shares: the durable id,
 * receive time, captured provider metadata + headers, the exact-body hash, the
 * signature verdict + native retry meta, and the candidate body bytes (text). The
 * PLATFORM supplies {@link RawDeliveryPlatformFields} (platform, transport,
 * account, installRef) which it alone derives — this base owns NONE of those.
 */
export interface RawDeliveryBase {
    readonly rawId: string;
    readonly tenant: string;
    readonly receivedAt: string;
    readonly provider: ProviderMeta;
    readonly headers: HeaderMap;
    readonly bodyHash: string;
    readonly signature: SignatureResult;
    readonly retry: RetryMeta;
    /**
     * Candidate body bytes (already decoded to text). Persisted ONLY when the
     * signature verdict permits it (see {@link buildRawDelivery}); a rejected /
     * expired / missing / unsupported verdict drops it so an attacker-controlled
     * body is never stored. `undefined` means "no body to consider".
     */
    readonly body?: string;
}
/**
 * Platform-owned raw fields. The platform adapter derives each of these from its
 * verified envelope / transport (account scope, socket-vs-http, install ref); the
 * core never computes them. Kept separate from {@link RawDeliveryBase} so the
 * raw-first/no-attacker-body policy can live in core WITHOUT the core touching
 * platform identity.
 */
export interface RawDeliveryPlatformFields {
    readonly platform: Platform;
    readonly transport: Transport;
    /** Platform account/workspace/guild/bot install scope (platform-derived). */
    readonly account: string;
    /** Platform install/team/guild/bot reference when known (platform-derived). */
    readonly installRef?: string;
}
/**
 * Assemble a durable {@link RawDelivery} from provider-neutral base inputs and the
 * platform-derived identity fields. This is the ONE place the common raw shape,
 * the signature/retry/provider threading, and the "no attacker-controlled body on
 * a non-verified verdict" policy live, so every platform adapter records raw the
 * same way. The body is included ONLY when the verdict is body-persisting AND a
 * body was supplied; otherwise the row carries audit metadata + bodyHash only.
 */
export declare function buildRawDelivery(base: RawDeliveryBase, platformFields: RawDeliveryPlatformFields): RawDelivery;
/** Output of inserting a raw delivery into the raw store. */
export interface RawInsertResult {
    readonly rawId: string;
    /** False when an identical delivery was already stored (idempotent insert). */
    readonly inserted: boolean;
    readonly insertedAt: string;
}
export declare const decodeRawInsertResult: Decoder<RawInsertResult>;
//# sourceMappingURL=raw.d.ts.map