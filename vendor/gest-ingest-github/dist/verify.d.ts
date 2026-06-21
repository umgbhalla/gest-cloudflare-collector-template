import { type HeaderMap, type IngestHttpRequest, type RetryMeta, type VerifyVerdict } from "@gest/ingest-core";
/** Signing scheme name recorded on every GitHub signature verdict. */
export declare const GITHUB_SIGNATURE_SCHEME = "github-sha256";
/** Header names GitHub attaches to a webhook delivery. */
export declare const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";
export declare const GITHUB_EVENT_HEADER = "x-github-event";
export declare const GITHUB_DELIVERY_HEADER = "x-github-delivery";
export declare const GITHUB_HOOK_ID_HEADER = "x-github-hook-id";
export declare const GITHUB_INSTALLATION_TARGET_ID_HEADER = "x-github-hook-installation-target-id";
export declare const GITHUB_INSTALLATION_TARGET_TYPE_HEADER = "x-github-hook-installation-target-type";
/** Inputs to verify a GitHub webhook HTTP delivery. */
export interface GithubVerifyOptions {
    /** Per-hook/app webhook secret. Never recorded; only used to recompute the MAC. */
    readonly webhookSecret: string;
    /**
     * Additional still-acceptable secrets during an overlapping rotation. GitHub
     * sends ONE signature, but during a secret rotation the delivery may have been
     * signed with either the new or the previous secret; we accept a match against
     * any. (This generalizes to the Svix-style multi-candidate contract: a single
     * GitHub signature is one candidate tested against multiple acceptable secrets.)
     */
    readonly previousSecrets?: readonly string[];
    /** Optional key id for rotation audit (recorded, never the secret). */
    readonly keyId?: string;
}
/** A verified result also surfaces the captured native redelivery metadata. */
export type GithubVerification = VerifyVerdict;
/**
 * Verify a GitHub webhook request over its exact bytes. Returns a structured
 * verdict; it NEVER throws on a bad signature and NEVER parses the body. The
 * caller stores the verdict on the raw delivery and decides what to do with a
 * non-"verified" result.
 */
export declare function verifyGithubRequest(request: IngestHttpRequest, opts: GithubVerifyOptions): GithubVerification;
/** Compute the GitHub `sha256=` signature over the exact body bytes. */
export declare function computeSignature(webhookSecret: string, rawBody: Uint8Array): string;
/**
 * Capture GitHub's per-attempt retry metadata from the inbound webhook headers.
 *
 * GitHub conveys NO redelivery/retry signal on the inbound webhook: every delivery
 * (first delivery, automatic retry, and manual redelivery) arrives with a NEW
 * X-GitHub-Delivery GUID and NO redelivery-flag header. The only place a delivery's
 * redelivery status is exposed is the REST "hook deliveries" API (the `guid` and
 * `redelivery` fields), which is a repair-time concern, not an inbound header.
 *
 * Therefore the inbound path can never honestly populate a retry count, and this
 * always returns { count: 0 }. Redelivery detection lives in the dedupe layer: a
 * redelivery of identical bytes collapses on the content-derived native key (see
 * identity.ts), not on a fabricated header.
 */
export declare function captureRetryMeta(_headers: HeaderMap): RetryMeta;
//# sourceMappingURL=verify.d.ts.map