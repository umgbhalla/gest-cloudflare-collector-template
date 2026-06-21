import { type HeaderMap, type IngestHttpRequest, type RetryMeta, type VerifyVerdict } from "@gest/ingest-core";
/** Signing scheme name recorded on every Slack signature verdict. */
export declare const SLACK_SIGNATURE_SCHEME = "slack-v0";
/** Header names Slack attaches to a signed Events API delivery. */
export declare const SLACK_SIGNATURE_HEADER = "x-slack-signature";
export declare const SLACK_TIMESTAMP_HEADER = "x-slack-request-timestamp";
export declare const SLACK_RETRY_NUM_HEADER = "x-slack-retry-num";
export declare const SLACK_RETRY_REASON_HEADER = "x-slack-retry-reason";
/** Default replay window: 5 minutes either side of the request timestamp. */
export declare const DEFAULT_MAX_SKEW_SECONDS = 300;
/** Inputs to verify a Slack Events API HTTP delivery. */
export interface SlackVerifyOptions {
    /** App signing secret. Never recorded; only used to recompute the MAC. */
    readonly signingSecret: string;
    /** Caller's current epoch seconds, for deterministic skew math in tests. */
    readonly nowEpochSeconds: number;
    /** Allowed timestamp skew in seconds (default 300). */
    readonly maxSkewSeconds?: number;
    /** Optional key id for rotation audit (recorded, never the secret). */
    readonly keyId?: string;
}
/** A verified result also surfaces the captured native retry metadata. */
export type SlackVerification = VerifyVerdict;
/**
 * Verify a Slack Events API request over its exact bytes. Returns a structured
 * verdict; it NEVER throws on a bad signature (that is normal attacker traffic)
 * and NEVER parses the body. The caller stores the verdict on the raw delivery
 * and decides what to do with a non-"verified" result.
 */
export declare function verifySlackRequest(request: IngestHttpRequest, opts: SlackVerifyOptions): SlackVerification;
/** Compute the Slack `v0=` signature over the exact body bytes. */
export declare function computeSignature(signingSecret: string, timestamp: string, rawBody: Uint8Array): string;
/**
 * Capture Slack's native retry signal from headers. Slack sets
 * X-Slack-Retry-Num (1-based) and X-Slack-Retry-Reason on every redelivery; a
 * first delivery has neither, which we record as count 0.
 */
export declare function captureRetryMeta(headers: HeaderMap): RetryMeta;
//# sourceMappingURL=verify.d.ts.map