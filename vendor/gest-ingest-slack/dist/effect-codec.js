// @gest/ingest-slack / effect codec (pure, I/O-free)
//
// The PURE Slack effect codec: it turns an outbox row + an injected credential
// into an HTTP request, and turns the raw HTTP response into a neutral
// DispatchDecision. It is the SLACK-SPECIFIC half of the dispatch boundary; the
// generic dispatch loop (in @gest/ingest-dispatch, wired by infra) moves the
// bytes and applies the decision.
//
// Hard rules this module keeps (gest slack-live):
// - NO I/O. No fetch, no env, no token storage, no clock. Every time value is
//   injected (`now`, `startedAt`). The credential is injected too: a bearer
//   token resolved OUTSIDE this package via the EffectCredentialCapability. We
//   never read a token from the rateKey, the credentialRef, or env.
// - HTTP status is NOT the effect result. Slack's Web API returns HTTP 200 with
//   a JSON body that may mean failure (`ok:false`). We parse the native body and
//   own the ok:false / retryable / terminal / 429+Retry-After / DLQ
//   classification. A naive `status < 400 => sent` is unsafe for Slack.
// - Only @gest/ingest-core is imported (the neutral boundary vocabulary).
//
// This composes into `SlackEffectCodec` (a `PlatformEffectCodec` for 'slack')
// so it registers in the provider-neutral dispatcher with zero Slack code in the
// loop. The same shape will host GitHub/Discord/Telegram codecs later.
import { asSecret, } from "@gest/ingest-core";
/** Slack Web API base, used unless the caller injects a test/base override. */
export const SLACK_API_BASE_URL = "https://slack.com/api";
/** Default per-attempt request timeout the dispatcher should honour (ms). */
export const SLACK_EFFECT_TIMEOUT_MS = 10_000;
/** Fallback retry delay (seconds) when Slack 429s without a Retry-After header. */
export const SLACK_DEFAULT_RETRY_AFTER_SECONDS = 60;
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
export function buildSlackEffectRequest(input) {
    if (input.credential.kind !== "bearer") {
        throw new Error(`slack effect requires a bearer credential, got "${input.credential.kind}"`);
    }
    const base = (input.baseUrl ?? SLACK_API_BASE_URL).replace(/\/+$/, "");
    const headers = [
        { name: "authorization", value: `Bearer ${input.credential.token}` },
        { name: "content-type", value: "application/json; charset=utf-8" },
    ];
    return {
        method: "POST",
        url: `${base}/${input.outbox.method}`,
        headers,
        body: JSON.stringify(input.outbox.requestBody),
        timeoutMs: SLACK_EFFECT_TIMEOUT_MS,
    };
}
/**
 * Slack `ok:false` error codes that are TRANSIENT and worth retrying. This is a
 * conservative closed set: server-side/transient conditions only. Everything
 * else on `ok:false` is treated as terminal and DLQ'd, so a permanent error
 * (bad token, missing scope, channel not found, invalid argument) fails fast
 * instead of looping. Slack's own 429 path is handled separately by status.
 */
const SLACK_RETRYABLE_ERRORS = new Set([
    "ratelimited", // body-level rate limit (defensive; usually surfaces as 429)
    "internal_error",
    "service_unavailable",
    "fatal_error",
    "request_timeout",
    "timeout_error",
    "temporarily_unavailable",
]);
/** Whether a Slack `ok:false` error code should be retried (vs DLQ'd). */
export function isSlackRetryableError(error) {
    return error !== undefined && SLACK_RETRYABLE_ERRORS.has(error);
}
/** Read the integer `Retry-After` (seconds) from response headers, if present. */
function readRetryAfterSeconds(headers) {
    for (const h of headers) {
        if (h.name.toLowerCase() === "retry-after") {
            const n = Number(h.value.trim());
            if (Number.isFinite(n) && n >= 0)
                return Math.ceil(n);
        }
    }
    return undefined;
}
/** Decode the Slack Web API JSON body; tolerant of empty/non-JSON bodies. */
function decodeSlackWebApiBody(body) {
    if (body.length === 0)
        return {};
    let text;
    try {
        text = new TextDecoder().decode(body);
    }
    catch {
        return {};
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return {};
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
    }
    const obj = parsed;
    const out = {};
    if (typeof obj["ok"] === "boolean")
        out.ok = obj["ok"];
    if (typeof obj["error"] === "string")
        out.error = obj["error"];
    if (typeof obj["retry_after"] === "number" && Number.isFinite(obj["retry_after"])) {
        out.retry_after = obj["retry_after"];
    }
    return out;
}
/** Add `seconds` to an ISO-8601 instant, returning a new ISO-8601 string. */
function addSeconds(iso, seconds) {
    return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}
/**
 * Exponential backoff schedule for transient retries: base 2s, doubling per
 * attempt, capped at 5 minutes. Deterministic (no jitter) so replay/tests are
 * stable; the dispatcher may add jitter when it applies the decision.
 */
function exponentialBackoff(now, attemptNumber) {
    const exp = Math.max(0, attemptNumber - 1);
    const seconds = Math.min(2 ** exp * 2, 300);
    return addSeconds(now, seconds);
}
/** Build the per-attempt record carried on every decision. */
function buildAttempt(input, body, retryAfter) {
    const rateLimited = input.response.status === 429;
    return {
        attempt: input.attemptNumber,
        startedAt: input.startedAt,
        status: input.response.status,
        responseHash: input.response.bodyHash,
        ...(rateLimited ? { rateLimited: true } : {}),
        ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
        ...(body.ok === false && body.error !== undefined ? { error: body.error } : {}),
    };
}
/** Emit a rate-limit deferral for EVERY bucket the row counts against. */
function rateLimitUpdatesFor(outbox, notBefore) {
    return outbox.rateKeys.map((rateKey) => ({
        rateKey,
        notBefore,
        reason: "platform-429",
    }));
}
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
export function parseSlackEffectResponse(input) {
    const { response, now } = input;
    const headerRetryAfter = readRetryAfterSeconds(response.headers);
    const body = decodeSlackWebApiBody(response.body);
    const retryAfter = headerRetryAfter ?? body.retry_after;
    const attempt = buildAttempt(input, body, retryAfter);
    // 1. Rate limited.
    if (response.status === 429) {
        const seconds = retryAfter ?? SLACK_DEFAULT_RETRY_AFTER_SECONDS;
        const notBefore = addSeconds(now, seconds);
        return {
            attempt,
            nextState: "retry",
            notBefore,
            rateLimitUpdates: rateLimitUpdatesFor(input.outbox, notBefore),
        };
    }
    // 2. Server-side transient.
    if (response.status >= 500) {
        return {
            attempt,
            nextState: "retry",
            notBefore: exponentialBackoff(now, input.attemptNumber),
        };
    }
    // 3. Client error (auth/route) — terminal.
    if (response.status >= 400) {
        return {
            attempt,
            nextState: "failed",
            dlqReason: `slack_http_${response.status}`,
        };
    }
    // 4. Success path — but ONLY when the body confirms it.
    if (body.ok === true) {
        return { attempt, nextState: "sent" };
    }
    // 5. Native failure that is transient.
    if (body.ok === false && isSlackRetryableError(body.error)) {
        return {
            attempt,
            nextState: "retry",
            notBefore: exponentialBackoff(now, input.attemptNumber),
        };
    }
    // 6. Native failure that is terminal, OR an unparseable/ambiguous 200 body
    //    (no proof of success): DLQ rather than claim sent.
    return {
        attempt,
        nextState: "failed",
        dlqReason: `slack_${body.error ?? "unknown_error"}`,
    };
}
// ---------------------------------------------------------------------------
// SlackEffectCodec (PlatformEffectCodec composition)
// ---------------------------------------------------------------------------
/**
 * The pure Slack effect codec, composing build + parse into the neutral
 * `PlatformEffectCodec` contract the dispatcher consumes. The dispatcher
 * resolves the opaque `credentialRef` to an `EffectCredential` via the injected
 * capability and hands it here; we never touch env, fetch, or token storage.
 */
export const SlackEffectCodec = {
    platform: "slack",
    buildEffectRequest(input) {
        return buildSlackEffectRequest({
            outbox: input.outbox,
            credential: input.credential,
        });
    },
    parseEffectResponse(input) {
        return parseSlackEffectResponse(input);
    },
};
/**
 * Test/seam helper: brand a plain string as a bearer credential. Re-exports the
 * core `asSecret` brand so callers wiring a fake transport in offline tests can
 * construct a bearer credential without reaching into core. NOT for production
 * token minting — that is the capability's job.
 */
export function bearerCredential(token) {
    return { kind: "bearer", token: asSecret(token) };
}
//# sourceMappingURL=effect-codec.js.map