import { type DecodeIssue } from "./decode.js";
/** Stable, switchable category for an ingest error. */
export declare const INGEST_ERROR_CODES: readonly ["decode", "signature", "storage", "rate-limited", "transient", "terminal", "contract"];
export type IngestErrorCode = (typeof INGEST_ERROR_CODES)[number];
/** Base ingest error. Retryability is explicit, not inferred from the message. */
export declare class IngestError extends Error {
    readonly code: IngestErrorCode;
    readonly retryable: boolean;
    /** Optional retry-after hint in seconds (e.g. for rate limits). */
    readonly retryAfterSeconds?: number;
    constructor(code: IngestErrorCode, message: string, options?: {
        retryable?: boolean;
        retryAfterSeconds?: number;
        cause?: unknown;
    });
}
/** Raised when a boundary record fails to decode. Carries the field issues. */
export declare class DecodeError extends IngestError {
    readonly issues: readonly DecodeIssue[];
    constructor(what: string, issues: readonly DecodeIssue[]);
}
/** Raised when a signed delivery cannot be trusted. Never retryable. */
export declare class SignatureError extends IngestError {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
/** Raised by the dispatcher on a platform rate limit. Carries retry-after. */
export declare class RateLimitError extends IngestError {
    constructor(message: string, retryAfterSeconds: number);
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
export declare class CredentialError extends IngestError {
    constructor(message: string, options?: {
        retryable?: boolean;
        cause?: unknown;
    });
}
/**
 * Helper: turn a DecodeFailure into a thrown DecodeError, or return the decoded
 * value. Lets callers enforce "no untyped record crosses this boundary".
 */
export declare function orThrow<T>(what: string, result: {
    ok: true;
    value: T;
} | {
    ok: false;
    issues: readonly DecodeIssue[];
}): T;
//# sourceMappingURL=errors.d.ts.map