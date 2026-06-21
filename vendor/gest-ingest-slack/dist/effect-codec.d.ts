import { type DispatchDecision, type EffectCredential, type EffectHttpRequest, type EffectHttpResponse, type Outbox, type PlatformEffectCodec } from "@gest/ingest-core";
/** Slack Web API base, used unless the caller injects a test/base override. */
export declare const SLACK_API_BASE_URL = "https://slack.com/api";
/** Default per-attempt request timeout the dispatcher should honour (ms). */
export declare const SLACK_EFFECT_TIMEOUT_MS = 10000;
/** Fallback retry delay (seconds) when Slack 429s without a Retry-After header. */
export declare const SLACK_DEFAULT_RETRY_AFTER_SECONDS = 60;
/** Inputs for building a Slack Web API request from an outbox row. */
export interface BuildSlackEffectRequestInput {
    readonly outbox: Outbox;
    /**
     * The resolved credential. Slack uses a bearer bot/user token, minted OUTSIDE
     * this package by the EffectCredentialCapability from the outbox's opaque
     * `credentialRef`. We require `kind:"bearer"` and never accept a raw string.
     */
    readonly credential: EffectCredential;
    /** Override the API base (e.g. a local fake) — defaults to slack.com/api. */
    readonly baseUrl?: string;
}
/**
 * Build the Slack Web API HTTP request for an outbox row. Always a JSON POST to
 * `{baseUrl}/{method}` with a bearer auth header from the injected credential.
 * The body is the outbox's opaque `requestBody`, serialized verbatim — this
 * module never reshapes what the Slack effect encoder produced.
 *
 * Throws when the injected credential is not a bearer token: Slack effects MUST
 * carry a bearer token, and silently sending an unauthenticated request would
 * burn an attempt and look like a Slack-side auth failure. Failing here keeps
 * the credential-resolution bug visible at the boundary that owns it.
 */
export declare function buildSlackEffectRequest(input: BuildSlackEffectRequestInput): EffectHttpRequest;
/** Inputs for classifying a Slack Web API response into a DispatchDecision. */
export interface ParseSlackEffectResponseInput {
    readonly outbox: Outbox;
    readonly response: EffectHttpResponse;
    /** 1-based attempt number for this send. */
    readonly attemptNumber: number;
    /** When this attempt started (ISO-8601). */
    readonly startedAt: string;
    /** Caller's current time (ISO-8601), for notBefore math. */
    readonly now: string;
}
/** Whether a Slack `ok:false` error code should be retried (vs DLQ'd). */
export declare function isSlackRetryableError(error: string | undefined): boolean;
/**
 * Classify a Slack Web API response into a neutral DispatchDecision.
 *
 * Ordering (status first, then native body — both matter):
 *   1. HTTP 429       -> retry; notBefore from Retry-After (or default); defer
 *                        ALL rateKeys via rateLimitUpdates.
 *   2. HTTP 5xx       -> retry with exponential backoff (transient transport).
 *   3. HTTP 4xx       -> failed + dlqReason (auth/route problem; not retryable).
 *   4. HTTP 200 ok:true        -> sent.
 *   5. HTTP 200 ok:false retryable -> retry with backoff.
 *   6. HTTP 200 ok:false terminal  -> failed + dlqReason.
 * A 200 with an unparseable/empty body is treated as terminal (we cannot prove
 * success), so it DLQs rather than silently claiming `sent`.
 */
export declare function parseSlackEffectResponse(input: ParseSlackEffectResponseInput): DispatchDecision;
/**
 * The pure Slack effect codec, composing build + parse into the neutral
 * `PlatformEffectCodec` contract the dispatcher consumes. The dispatcher
 * resolves the opaque `credentialRef` to an `EffectCredential` via the injected
 * capability and hands it here; we never touch env, fetch, or token storage.
 */
export declare const SlackEffectCodec: PlatformEffectCodec;
/**
 * Test/seam helper: brand a plain string as a bearer credential. Re-exports the
 * core `asSecret` brand so callers wiring a fake transport in offline tests can
 * construct a bearer credential without reaching into core. NOT for production
 * token minting — that is the capability's job.
 */
export declare function bearerCredential(token: string): EffectCredential;
//# sourceMappingURL=effect-codec.d.ts.map