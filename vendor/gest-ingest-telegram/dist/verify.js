// @gest/ingest-telegram / verify
//
// Telegram webhook authentication. Telegram is NOT an HMAC-signed-body platform
// like Slack or GitHub: the Bot API does not sign the request body. Instead, when
// a bot owner registers a webhook with `setWebhook(secret_token=...)`, Telegram
// echoes that exact secret in the `X-Telegram-Bot-Api-Secret-Token` header on
// every webhook delivery. Authenticity is therefore a constant-time equality
// check of that header against the configured secret.
//
// Even though there is no body signature, we keep the gest discipline: the secret
// token is checked BEFORE the body is parsed (see ingest.ts). A failed check
// yields a non-verified verdict and the attacker-controlled body is not stored.
//
// Polling has no per-update authenticity header (the bot pulled the update over
// an authenticated getUpdates call), so its signature verdict is
// "not-applicable" and verification is handled in the polling path, not here.
import { rejectVerdict, timingSafeEqual, verifiedSignature, } from "@gest/ingest-core";
/** Scheme name recorded on every Telegram webhook verdict. */
export const TELEGRAM_SIGNATURE_SCHEME = "telegram-secret-token";
/** Header Telegram echoes the configured webhook secret token in. */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";
/**
 * Authenticate a Telegram webhook request by comparing the secret-token header
 * to the configured secret in constant time. NEVER throws on a mismatch (that is
 * normal probe traffic) and NEVER parses the body. The caller records the verdict
 * on the raw delivery and decides what to do with a non-"verified" result.
 *
 * Verdicts:
 *   - unsupported: no secret configured (webhook registered without one).
 *   - missing:     secret configured but header absent.
 *   - rejected:    header present but does not match the configured secret.
 *   - verified:    header matches the configured secret.
 */
export function verifyTelegramWebhook(request, opts) {
    const retry = { count: 0 };
    if (opts.secretToken === undefined || opts.secretToken.length === 0) {
        return reject("unsupported", retry, "no webhook secret token configured; cannot authenticate delivery", opts.keyId);
    }
    const presented = request.headers[TELEGRAM_SECRET_HEADER];
    if (presented === undefined) {
        return reject("missing", retry, "missing telegram secret token header", opts.keyId);
    }
    if (!timingSafeEqual(presented, opts.secretToken)) {
        return reject("rejected", retry, "secret token mismatch", opts.keyId);
    }
    return {
        signature: verifiedSignature(TELEGRAM_SIGNATURE_SCHEME, { keyId: opts.keyId }),
        retry,
        verified: true,
    };
}
/**
 * The signature verdict for a polling update. The update was pulled over an
 * authenticated getUpdates call (bot token in the URL), so there is no per-update
 * authenticity material to check at this layer: the verdict is "not-applicable".
 */
export function pollingSignature() {
    return { kind: "not-applicable", scheme: TELEGRAM_SIGNATURE_SCHEME };
}
// Telegram-local reject wrapper over core rejectVerdict (binds the Telegram scheme).
function reject(kind, retry, reason, keyId) {
    return rejectVerdict(TELEGRAM_SIGNATURE_SCHEME, retry, kind, reason, keyId);
}
/** Header reader kept exported so a provider adapter can pre-flight presence. */
export function hasTelegramSecretHeader(headers) {
    return headers[TELEGRAM_SECRET_HEADER] !== undefined;
}
//# sourceMappingURL=verify.js.map