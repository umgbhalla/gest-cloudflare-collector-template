import { type Decoder } from "./decode.js";
import { type Platform } from "./platform.js";
import { type Outbox, type OutboxAttempt } from "./outbox.js";
/**
 * An in-memory secret (e.g. a resolved bearer token). Branded so it cannot be
 * accidentally produced from a plain string: only a credential resolver mints
 * one. It MUST NOT be persisted, logged, or written to an outbox row.
 */
export type SecretString = string & {
    readonly __secret: unique symbol;
};
/** Mark a plain string as a secret. Use only inside a credential resolver. */
export declare function asSecret(value: string): SecretString;
/** A single HTTP header name/value pair (ordered list preserves duplicates). */
export interface HeaderPair {
    readonly name: string;
    readonly value: string;
}
export declare const decodeHeaderPair: Decoder<HeaderPair>;
/**
 * The capability a credential a platform effect needs. Mirrors the GitHub
 * installation-token pattern: the kind names HOW a credential is applied, not
 * the secret itself.
 */
export declare const EFFECT_CREDENTIAL_KINDS: readonly ["bearer", "headers", "none"];
export type EffectCredentialKind = (typeof EFFECT_CREDENTIAL_KINDS)[number];
/**
 * A resolved credential, valid in-memory at dispatch time only. The token/header
 * material is `SecretString` and never reaches a durable record.
 */
export type EffectCredential = {
    readonly kind: "bearer";
    readonly token: SecretString;
    readonly expiresAt?: string;
} | {
    readonly kind: "headers";
    readonly headers: readonly HeaderPair[];
    readonly expiresAt?: string;
} | {
    readonly kind: "none";
};
/**
 * What a dispatcher asks for when it needs to send an effect. Carries the opaque
 * `credentialRef` from the outbox plus enough routing context for the resolver
 * to mint/fetch the right token. No secret is present on the request.
 */
export interface EffectCredentialRequest {
    readonly platform: Platform;
    readonly tenant: string;
    readonly account: string;
    /** Opaque credential/install pointer from the outbox row. */
    readonly credentialRef: string;
    readonly method: string;
    readonly destination: string;
    /** Caller's current time (ISO-8601). */
    readonly now: string;
}
/**
 * The injected capability that turns an opaque `credentialRef` into a live
 * credential. Implemented OUTSIDE core/platform packages (in infra), the same
 * way GitHub installation-token minting is a capability, not baked logic.
 *
 * Error mode (part of this contract): when no usable credential can be produced,
 * the resolver THROWS. A transient failure (token service blip, network) SHOULD
 * throw `CredentialError(msg, { retryable: true })` so the dispatcher retries
 * with backoff; a terminal failure (revoked / not-found / deauthorized install)
 * SHOULD throw `CredentialError(msg)` (terminal) so the dispatcher routes the
 * row to the DLQ on the FIRST pass. Any other throw is treated as terminal
 * (fail-closed): a credential failure the dispatcher cannot classify is sent to
 * the DLQ rather than retried forever.
 */
export interface EffectCredentialCapability {
    resolveEffectCredential(input: EffectCredentialRequest): Promise<EffectCredential>;
}
export declare const EFFECT_HTTP_METHODS: readonly ["GET", "POST", "PUT", "PATCH", "DELETE"];
export type EffectHttpMethod = (typeof EFFECT_HTTP_METHODS)[number];
/**
 * A platform-built HTTP request the dispatcher will send verbatim. Produced by a
 * pure `PlatformEffectCodec.buildEffectRequest`; the core never constructs one.
 */
export interface EffectHttpRequest {
    readonly method: EffectHttpMethod;
    readonly url: string;
    readonly headers: readonly HeaderPair[];
    readonly body?: Uint8Array | string;
    readonly timeoutMs?: number;
}
/**
 * The raw HTTP response bytes the transport observed. `bodyHash` is a stable
 * hash of `body` for replay/audit; the codec parses `body` (it owns native-body
 * meaning — HTTP status alone is not the result).
 */
export interface EffectHttpResponse {
    readonly status: number;
    readonly headers: readonly HeaderPair[];
    readonly body: Uint8Array;
    readonly bodyHash: string;
    /** When the response was observed (ISO-8601). */
    readonly receivedAt: string;
}
/**
 * The injected I/O boundary. The ONLY place that actually performs network I/O.
 * Implemented in infra (e.g. a Cloudflare fetch wrapper); core/platform never do.
 */
export interface EffectHttpTransport {
    send(request: EffectHttpRequest): Promise<EffectHttpResponse>;
}
/** Reason a rate bucket was throttled, for audit and backoff policy. */
export declare const RATE_LIMIT_REASONS: readonly ["platform-429", "local-throttle", "transient-backoff"];
export type RateLimitReason = (typeof RATE_LIMIT_REASONS)[number];
/**
 * Instruction to defer a rate bucket until `notBefore`. A platform codec emits
 * these (e.g. on a 429) so the dispatcher can update shared rate state.
 */
export interface RateLimitUpdate {
    readonly rateKey: string;
    /** Earliest time the bucket may be used again (ISO-8601). */
    readonly notBefore: string;
    readonly reason: RateLimitReason;
}
export declare const decodeRateLimitUpdate: Decoder<RateLimitUpdate>;
/** Terminal-or-retry verdict a codec assigns to a row after one attempt. */
export declare const DISPATCH_NEXT_STATES: readonly ["sent", "retry", "failed"];
export type DispatchNextState = (typeof DISPATCH_NEXT_STATES)[number];
/**
 * The platform codec's verdict for one dispatch attempt. The dispatcher applies
 * it: record `attempt`, transition to `nextState`, honour `notBefore`, push the
 * row to the DLQ when `dlqReason` is set, and apply any `rateLimitUpdates`.
 */
export interface DispatchDecision {
    readonly attempt: OutboxAttempt;
    readonly nextState: DispatchNextState;
    /** Earliest retry time (ISO-8601) when `nextState` is "retry". */
    readonly notBefore?: string;
    /** DLQ classification when `nextState` is "failed". */
    readonly dlqReason?: string;
    /** Rate buckets to defer as a result of this attempt. */
    readonly rateLimitUpdates?: readonly RateLimitUpdate[];
}
export declare const decodeDispatchDecision: Decoder<DispatchDecision>;
/**
 * The pure, I/O-free contract a platform package implements. It turns an outbox
 * row + resolved credential into an HTTP request, and turns the raw response
 * into a `DispatchDecision`. It owns native-body interpretation; it never calls
 * fetch, reads env, or stores tokens.
 */
export interface PlatformEffectCodec {
    readonly platform: Platform;
    buildEffectRequest(input: {
        readonly outbox: Outbox;
        readonly credential: EffectCredential;
        readonly now: string;
    }): EffectHttpRequest;
    parseEffectResponse(input: {
        readonly outbox: Outbox;
        readonly response: EffectHttpResponse;
        readonly attemptNumber: number;
        readonly startedAt: string;
        readonly now: string;
    }): DispatchDecision;
}
export declare const decodeEffectHttpResponseMeta: Decoder<{
    readonly status: number;
    readonly headers: readonly HeaderPair[];
    readonly bodyHash: string;
    readonly receivedAt: string;
}>;
//# sourceMappingURL=dispatch.d.ts.map