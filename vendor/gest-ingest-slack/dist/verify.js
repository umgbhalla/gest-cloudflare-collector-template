// @gest/ingest-slack / verify
//
// Slack Events API request verification. CRITICAL invariant (gest hard rule): the
// signature is checked against the EXACT raw bytes BEFORE any JSON parse. Nothing
// in this module calls JSON.parse; it operates on `IngestHttpRequest.rawBody` and
// the normalized header map only. The verdict it returns is recorded on the raw
// delivery (durable source truth) so replay and audit stay honest.
//
// Slack signing scheme ("slack-v0"):
//   base   = "v0:" + X-Slack-Request-Timestamp + ":" + rawBody
//   sig    = "v0=" + hex(HMAC_SHA256(signingSecret, base))
//   header = X-Slack-Signature
//
// Replay protection: Slack recommends rejecting requests whose timestamp is more
// than 5 minutes from now. We make the skew explicit and configurable, and we
// compare the recomputed MAC in constant time.
import { createHmac } from "node:crypto";
import { isSecretMissing, rejectVerdict, timingSafeEqual, verifiedSignature, } from "@gest/ingest-core";
/** Signing scheme name recorded on every Slack signature verdict. */
export const SLACK_SIGNATURE_SCHEME = "slack-v0";
/** Header names Slack attaches to a signed Events API delivery. */
export const SLACK_SIGNATURE_HEADER = "x-slack-signature";
export const SLACK_TIMESTAMP_HEADER = "x-slack-request-timestamp";
export const SLACK_RETRY_NUM_HEADER = "x-slack-retry-num";
export const SLACK_RETRY_REASON_HEADER = "x-slack-retry-reason";
/** Default replay window: 5 minutes either side of the request timestamp. */
export const DEFAULT_MAX_SKEW_SECONDS = 300;
/**
 * Verify a Slack Events API request over its exact bytes. Returns a structured
 * verdict; it NEVER throws on a bad signature (that is normal attacker traffic)
 * and NEVER parses the body. The caller stores the verdict on the raw delivery
 * and decides what to do with a non-"verified" result.
 */
export function verifySlackRequest(request, opts) {
    const retry = captureRetryMeta(request.headers);
    // Fail closed on a missing/empty/whitespace-only signing secret. Node's
    // createHmac accepts an empty key and yields a deterministic MAC, so an empty
    // secret would let an attacker forge a "verified" verdict. The signature
    // authority must never compute an HMAC with an empty key (docs/security-privacy.md).
    if (isSecretMissing(opts.signingSecret)) {
        return reject("missing", retry, "signing secret missing or empty", opts.keyId);
    }
    const presented = request.headers[SLACK_SIGNATURE_HEADER];
    const timestamp = request.headers[SLACK_TIMESTAMP_HEADER];
    if (presented === undefined || timestamp === undefined) {
        return reject("missing", retry, "missing slack signature or timestamp header");
    }
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || !/^\d+$/.test(timestamp)) {
        return reject("rejected", retry, "timestamp header is not an integer epoch");
    }
    const maxSkew = opts.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS;
    if (Math.abs(opts.nowEpochSeconds - ts) > maxSkew) {
        return reject("expired", retry, `timestamp skew exceeds ${maxSkew}s`, opts.keyId);
    }
    const expected = computeSignature(opts.signingSecret, timestamp, request.rawBody);
    if (!timingSafeEqual(expected, presented)) {
        return reject("rejected", retry, "hmac mismatch", opts.keyId);
    }
    return {
        signature: verifiedSignature(SLACK_SIGNATURE_SCHEME, { keyId: opts.keyId }),
        retry,
        verified: true,
    };
}
/** Compute the Slack `v0=` signature over the exact body bytes. */
export function computeSignature(signingSecret, timestamp, rawBody) {
    // Stream the UTF-8 prefix then the exact body bytes into the HMAC: byte-for-byte
    // identical to hashing `v0:<ts>:` ++ rawBody, with no intermediate buffer copy.
    const mac = createHmac("sha256", signingSecret)
        .update(`v0:${timestamp}:`)
        .update(rawBody)
        .digest("hex");
    return `v0=${mac}`;
}
/**
 * Capture Slack's native retry signal from headers. Slack sets
 * X-Slack-Retry-Num (1-based) and X-Slack-Retry-Reason on every redelivery; a
 * first delivery has neither, which we record as count 0.
 */
export function captureRetryMeta(headers) {
    const numRaw = headers[SLACK_RETRY_NUM_HEADER];
    const reason = headers[SLACK_RETRY_REASON_HEADER];
    const count = numRaw !== undefined && /^\d+$/.test(numRaw) ? Number(numRaw) : 0;
    return reason === undefined ? { count } : { count, reason };
}
// Slack-local reject wrapper: binds the Slack scheme constant to core rejectVerdict
// (which owns the {verified:false} + keyId-omit shape). Narrows `kind` to the
// verdicts Slack actually produces.
function reject(kind, retry, reason, keyId) {
    return rejectVerdict(SLACK_SIGNATURE_SCHEME, retry, kind, reason, keyId);
}
//# sourceMappingURL=verify.js.map