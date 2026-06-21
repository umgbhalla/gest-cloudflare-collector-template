// @gest/ingest-core / errors
//
// Provider-neutral error taxonomy for the ingest pipeline. These are structured,
// inspectable errors a provider/platform/runtime adapter can raise and the core
// can classify (e.g. retryable vs terminal) without knowing any platform. No
// platform/provider/runtime specifics leak in here.
import {} from "./decode.js";
/** Stable, switchable category for an ingest error. */
export const INGEST_ERROR_CODES = [
    /** A boundary record failed to decode (malformed raw/dedupe/outbox/replay). */
    "decode",
    /** Signature verification failed or could not be performed. */
    "signature",
    /** A required capability (raw/dedupe/queue/journal/outbox) failed. */
    "storage",
    /** Downstream platform rate limit; carries retry-after when known. */
    "rate-limited",
    /** A transient failure that is safe to retry. */
    "transient",
    /** A permanent failure that must not be retried. */
    "terminal",
    /** Caller violated a contract (bad arguments, illegal state). */
    "contract",
];
/** Base ingest error. Retryability is explicit, not inferred from the message. */
export class IngestError extends Error {
    code;
    retryable;
    /** Optional retry-after hint in seconds (e.g. for rate limits). */
    retryAfterSeconds;
    constructor(code, message, options) {
        super(message, options?.cause === undefined ? undefined : { cause: options.cause });
        this.name = "IngestError";
        this.code = code;
        this.retryable = options?.retryable ?? defaultRetryable(code);
        if (options?.retryAfterSeconds !== undefined) {
            this.retryAfterSeconds = options.retryAfterSeconds;
        }
    }
}
/** Raised when a boundary record fails to decode. Carries the field issues. */
export class DecodeError extends IngestError {
    issues;
    constructor(what, issues) {
        super("decode", `failed to decode ${what}: ${summarize(issues)}`, { retryable: false });
        this.name = "DecodeError";
        this.issues = issues;
    }
}
/** Raised when a signed delivery cannot be trusted. Never retryable. */
export class SignatureError extends IngestError {
    constructor(message, options) {
        super("signature", message, { retryable: false, cause: options?.cause });
        this.name = "SignatureError";
    }
}
/** Raised by the dispatcher on a platform rate limit. Carries retry-after. */
export class RateLimitError extends IngestError {
    constructor(message, retryAfterSeconds) {
        super("rate-limited", message, { retryable: true, retryAfterSeconds });
        this.name = "RateLimitError";
    }
}
/**
 * The documented error mode of an `EffectCredentialCapability.resolveEffectCredential`:
 * the resolver could not produce a usable credential. `retryable` is the ONLY
 * thing the dispatcher needs to route the row — a transient failure (token
 * service blipped, network) retries with backoff; a terminal failure (revoked,
 * not-found, deauthorized install) goes straight to the DLQ on the first pass,
 * never burning N attempts. Defaults to terminal (`code:"terminal"`,
 * `retryable:false`): a credential the resolver can't classify is treated as
 * fail-closed, not retried forever.
 */
export class CredentialError extends IngestError {
    constructor(message, options) {
        const retryable = options?.retryable ?? false;
        super(retryable ? "transient" : "terminal", message, {
            retryable,
            ...(options?.cause === undefined ? {} : { cause: options.cause }),
        });
        this.name = "CredentialError";
    }
}
function defaultRetryable(code) {
    switch (code) {
        case "rate-limited":
        case "transient":
        case "storage":
            return true;
        case "decode":
        case "signature":
        case "terminal":
        case "contract":
            return false;
    }
}
function summarize(issues) {
    if (issues.length === 0)
        return "no issues reported";
    return issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; ");
}
/**
 * Helper: turn a DecodeFailure into a thrown DecodeError, or return the decoded
 * value. Lets callers enforce "no untyped record crosses this boundary".
 */
export function orThrow(what, result) {
    if (result.ok)
        return result.value;
    throw new DecodeError(what, result.issues);
}
//# sourceMappingURL=errors.js.map