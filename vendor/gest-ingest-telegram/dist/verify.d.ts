import { type HeaderMap, type IngestHttpRequest, type SignatureResult, type VerifyVerdict } from "@gest/ingest-core";
/** Scheme name recorded on every Telegram webhook verdict. */
export declare const TELEGRAM_SIGNATURE_SCHEME = "telegram-secret-token";
/** Header Telegram echoes the configured webhook secret token in. */
export declare const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";
/** Inputs to authenticate a Telegram webhook delivery. */
export interface TelegramVerifyOptions {
    /**
     * The secret token configured via setWebhook(secret_token). When undefined the
     * webhook was registered WITHOUT a secret; Telegram sends no header and the
     * verdict is "unsupported" (the bot owner opted out of authenticity). A runner
     * SHOULD configure a secret; this adapter never silently trusts an unsecured
     * webhook as "verified".
     */
    readonly secretToken?: string;
    /** Optional secret reference for rotation audit (recorded, never the secret). */
    readonly keyId?: string;
}
/** A verdict plus captured native retry metadata (Telegram sends none on HTTP). */
export type TelegramVerification = VerifyVerdict;
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
export declare function verifyTelegramWebhook(request: IngestHttpRequest, opts: TelegramVerifyOptions): TelegramVerification;
/**
 * The signature verdict for a polling update. The update was pulled over an
 * authenticated getUpdates call (bot token in the URL), so there is no per-update
 * authenticity material to check at this layer: the verdict is "not-applicable".
 */
export declare function pollingSignature(): SignatureResult;
/** Header reader kept exported so a provider adapter can pre-flight presence. */
export declare function hasTelegramSecretHeader(headers: HeaderMap): boolean;
//# sourceMappingURL=verify.d.ts.map