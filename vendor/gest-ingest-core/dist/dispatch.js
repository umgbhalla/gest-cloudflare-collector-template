// @gest/ingest-core / dispatch boundary vocabulary
//
// Stable, provider-neutral vocabulary for the effect-dispatch boundary. This is
// the seam between the (pure) platform effect codecs and the (generic) dispatch
// loop that lives in @gest/ingest-dispatch and is wired by infra/.
//
// Hard rules this file keeps:
// - Types + decoders ONLY. No fetch, no Slack, no Cloudflare, no env. The core
//   never sends an effect; it only names the shapes a dispatcher and a platform
//   codec exchange.
// - Credentials are a CAPABILITY boundary. The core declares the credential
//   request/response shapes and the resolver interface; it never mints, caches,
//   parses, or stores a token. A token is a `SecretString` carried in-memory at
//   dispatch time only, resolved from an opaque `credentialRef` on the outbox.
// - HTTP status alone is NOT the effect result. The platform codec owns the
//   native-body interpretation (e.g. Slack 200 + ok:false). The dispatcher only
//   moves bytes; the codec returns a `DispatchDecision`.
import { decodeArray, decodeEnum, decodeIsoTimestamp, decodeNonEmptyString, decodeNonNegativeInt, decodeObject, decodeString, field, optionalField, } from "./decode.js";
import {} from "./platform.js";
import { decodeOutboxAttempt } from "./outbox.js";
/** Mark a plain string as a secret. Use only inside a credential resolver. */
export function asSecret(value) {
    return value;
}
export const decodeHeaderPair = decodeObject({
    name: field(decodeNonEmptyString),
    value: field(decodeString),
});
// ---------------------------------------------------------------------------
// Credentials (capability boundary)
// ---------------------------------------------------------------------------
/**
 * The capability a credential a platform effect needs. Mirrors the GitHub
 * installation-token pattern: the kind names HOW a credential is applied, not
 * the secret itself.
 */
export const EFFECT_CREDENTIAL_KINDS = ["bearer", "headers", "none"];
// ---------------------------------------------------------------------------
// HTTP effect transport
// ---------------------------------------------------------------------------
export const EFFECT_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
// ---------------------------------------------------------------------------
// Dispatch decision (codec output)
// ---------------------------------------------------------------------------
/** Reason a rate bucket was throttled, for audit and backoff policy. */
export const RATE_LIMIT_REASONS = ["platform-429", "local-throttle", "transient-backoff"];
export const decodeRateLimitUpdate = decodeObject({
    rateKey: field(decodeNonEmptyString),
    notBefore: field(decodeIsoTimestamp),
    reason: field(decodeEnum(RATE_LIMIT_REASONS)),
});
/** Terminal-or-retry verdict a codec assigns to a row after one attempt. */
export const DISPATCH_NEXT_STATES = ["sent", "retry", "failed"];
export const decodeDispatchDecision = decodeObject({
    attempt: field(decodeOutboxAttempt),
    nextState: field(decodeEnum(DISPATCH_NEXT_STATES)),
    notBefore: optionalField(decodeIsoTimestamp),
    dlqReason: optionalField(decodeNonEmptyString),
    rateLimitUpdates: optionalField(decodeArray(decodeRateLimitUpdate)),
});
// Decoders for the wire-observable HTTP records. Byte bodies are not JSON, so a
// caller decodes the metadata and supplies bytes separately; these decoders
// validate the structural envelope used in fixtures and ledgers.
export const decodeEffectHttpResponseMeta = decodeObject({
    status: field(decodeNonNegativeInt),
    headers: field(decodeArray(decodeHeaderPair)),
    bodyHash: field(decodeNonEmptyString),
    receivedAt: field(decodeIsoTimestamp),
});
//# sourceMappingURL=dispatch.js.map