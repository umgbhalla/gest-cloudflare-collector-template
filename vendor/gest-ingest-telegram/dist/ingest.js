// @gest/ingest-telegram / ingest
//
// The platform-adapter entry points that tie webhook authentication, envelope
// decoding, identity, and normalization together WITHOUT touching storage or a
// runtime. A provider adapter supplies the captured bytes + provider metadata
// (webhook); a poller supplies the getUpdates response bytes (polling). These
// functions return durable records (RawDelivery, native key, NormalizedEvent) for
// the caller to persist raw-first and process.
//
// Gest boundaries kept here:
// - Webhook path authenticates the secret-token header BEFORE parsing the body.
// - Polling path records a "not-applicable" signature (the getUpdates call was
//   authenticated by the bot token; there is no per-update authenticity material).
// - We never dispatch or decide; we only authenticate + decode + normalize + key.
// - The dedupe key is identical across webhook and polling, so the same update
//   seen via both transports collapses to one claim.
import { buildRawDelivery, normalizedEventOf, } from "@gest/ingest-core";
import { parsePollingResponse, parseWebhookUpdate, } from "./envelope.js";
import { updateDedupeKey } from "./identity.js";
import { normalizeTelegramUpdate, } from "./normalize.js";
import { TELEGRAM_SECRET_HEADER, pollingSignature, verifyTelegramWebhook, } from "./verify.js";
/**
 * Ingest a Telegram webhook request: authenticate the secret-token header, then
 * (only on a verified token) parse and decode the Update. Returns durable records
 * for the caller to persist raw-first. A non-verified token yields a "rejected"
 * outcome whose raw delivery carries audit metadata only (no attacker body).
 *
 * A decoded update whose content kind is outside the supported set yields an
 * "ignored" outcome that STILL carries the native dedupe key, so the caller can
 * record the raw + claim the key (at-least-once dedupe) without emitting an event.
 */
export function ingestTelegramWebhook(request, provider, verifyOpts, env) {
    const verification = verifyTelegramWebhook(request, verifyOpts);
    const sig = verification.signature;
    const headers = strippedHeaders(request);
    if (!verification.verified) {
        // Source-truth rule: do not persist the attacker-controlled body.
        const raw = buildRaw({ transport: "http", headers, provider, env, signature: sig, retry: verification.retry, body: undefined, account: provider.requestId });
        return { kind: "rejected", raw, reason: sig.reason ?? "secret token not verified" };
    }
    const bodyText = new TextDecoder().decode(request.rawBody);
    const decoded = parseWebhookUpdate(request.rawBody);
    if (!decoded.ok) {
        const raw = buildRaw({ transport: "http", headers, provider, env, signature: sig, retry: verification.retry, body: bodyText, account: provider.requestId });
        return { kind: "ignored", raw, reason: "update decode failed" };
    }
    const update = decoded.value;
    const raw = buildRaw({ transport: "http", headers, provider, env, signature: sig, retry: verification.retry, body: bodyText, account: env.botId });
    const nativeKey = updateDedupeKey(env.botId, update);
    // Ack path: a malformed-but-signed update (DecodeFailure) folds to "no event"
    // like an unsupported content kind — the raw is durable and the ack must not
    // 500. The consumer seam re-derives and surfaces the failure.
    const event = normalizedEventOf(normalizeTelegramUpdate(update, {
        tenant: env.tenant,
        botId: env.botId,
        rawId: env.rawId,
        // Webhook path: the secret-token header was verified over this delivery.
        verified: true,
        signatureKind: "verified",
        receivedAt: env.receivedAt,
        nativeKey,
        transport: "webhook",
    }));
    if (event === undefined) {
        return {
            kind: "ignored",
            raw,
            update,
            nativeKey,
            reason: `unhandled update content kind "${update.kind}"`,
        };
    }
    return { kind: "update", raw, update, nativeKey, event };
}
/**
 * Ingest a getUpdates polling batch. The bot owns the (authenticated) getUpdates
 * call, so the signature verdict is "not-applicable"; the body is already
 * trusted. Each Update in the batch is keyed (same rule as webhook) and
 * normalized; unsupported content kinds still produce a key for at-least-once
 * dedupe but no normalized event.
 *
 * The caller advances the getUpdates `offset` ONLY after durably recording this
 * batch's raw + keys; that, plus the bot-id+update-id dedupe key, is what makes a
 * re-fetched update collapse to one claim (at-least-once, not exactly-once).
 */
export function ingestTelegramPolling(rawBody, provider, env) {
    const sig = pollingSignature();
    const retry = { count: 0 };
    const bodyText = new TextDecoder().decode(rawBody);
    const decoded = parsePollingResponse(rawBody);
    if (!decoded.ok) {
        const raw = buildRaw({ transport: "polling", headers: {}, provider, env, signature: sig, retry, body: bodyText, account: env.botId });
        return {
            kind: "undecodable",
            raw,
            reason: decoded.issues.map((i) => i.message).join("; "),
        };
    }
    const raw = buildRaw({ transport: "polling", headers: {}, provider, env, signature: sig, retry, body: bodyText, account: env.botId });
    const updates = decoded.value.updates.map((update) => {
        const nativeKey = updateDedupeKey(env.botId, update);
        const event = normalizedEventOf(normalizeTelegramUpdate(update, {
            tenant: env.tenant,
            botId: env.botId,
            rawId: env.rawId,
            // Polling has NO per-message signature: the update is trusted only because
            // the bot pulled it over its authenticated getUpdates call (connect-time /
            // transport trust). That must NOT satisfy a signature-verification gate, so
            // we record verified:false with signatureKind:"not-applicable" — matching
            // the Slack socket and Discord gateway connect-time paths.
            verified: false,
            signatureKind: "not-applicable",
            receivedAt: env.receivedAt,
            nativeKey,
            transport: "polling",
        }));
        return event === undefined
            ? { update, nativeKey }
            : { update, nativeKey, event };
    });
    return { kind: "batch", raw, updates };
}
/**
 * One RawDelivery assembler for both transports. Callers supply the transport,
 * the (already safe) headers, and the account default; everything else is the
 * shared canonical record. SAFETY: the webhook caller strips
 * TELEGRAM_SECRET_HEADER before passing `headers` here (see strippedHeaders) —
 * the verified secret must never reach the durable raw store
 * (docs/security-privacy.md). The polling path has no request headers, so it
 * passes `{}`.
 */
function buildRaw(args) {
    // transport + account are platform-derived; core owns the common shape + the
    // no-attacker-body policy (the rejected webhook path passes body=undefined).
    return buildRawDelivery({ rawId: args.env.rawId, tenant: args.env.tenant, receivedAt: args.env.receivedAt, provider: args.provider, headers: args.headers, bodyHash: args.env.bodyHash, signature: args.signature, retry: args.retry, ...(args.body === undefined ? {} : { body: args.body }) }, { platform: "telegram", transport: args.transport, account: args.account });
}
/**
 * Strip the verified webhook secret-token header from request headers before it
 * can reach the durable raw store. Stripped for ALL verdicts — the verdict lives
 * on SignatureResult.kind, so the raw header value carries no audit value.
 */
function strippedHeaders(request) {
    const { [TELEGRAM_SECRET_HEADER]: _omit, ...safeHeaders } = request.headers;
    return safeHeaders;
}
//# sourceMappingURL=ingest.js.map