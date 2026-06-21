// @gest/infra / platform-ingest
//
// The ONE place infra legitimately names BOTH the provider adapter
// (@gest/ingest-cloudflare, via the neutral IngestHttpRequest it produced) and the
// platform adapters (slack/github/discord/telegram). It dispatches a routed
// request to the correct platform verifier+ingest entry point and collapses the
// platform-specific outcome unions into ONE neutral shape the fetch handler and
// consumer share.
//
// Hard rules kept:
// - Platform decode/verify stays in the platform adapters; this only selects and
//   calls them. No signature math, no JSON parse happens here.
// - Verify-before-parse: each adapter verifies over the exact bytes before parsing;
//   a rejected verdict yields a raw record with NO body (source-truth rule).
// - No runtime decision, no dispatch here.
import { ingestSlackHttp } from "@gest/ingest-slack";
import { ingestGithubHttp } from "@gest/ingest-github";
import { ingestDiscordHttp } from "@gest/ingest-discord";
import { TELEGRAM_SECRET_HEADER, ingestTelegramWebhook, } from "@gest/ingest-telegram";
/**
 * Run the routed platform's verifier + ingest. Throws a deployment-config error
 * (not a silent trust) when a required secret is missing — the fetch guard already
 * fail-closes on a missing secret BEFORE this is called, so reaching here without
 * one is a wiring bug.
 */
export function platformIngest(platform, request, provider, secrets, env) {
    switch (platform) {
        case "slack":
            return slack(request, provider, secrets, env);
        case "github":
            return github(request, provider, secrets, env);
        case "discord":
            return discord(request, provider, secrets, env);
        case "telegram":
            return telegram(request, provider, secrets, env);
    }
}
function require_(value, what) {
    if (value === undefined || value.trim().length === 0) {
        throw new Error(`infra wiring: missing ${what} for a routed secured request`);
    }
    return value;
}
function slack(request, provider, secrets, env) {
    const out = ingestSlackHttp(request, provider, {
        signingSecret: require_(secrets.slackSigningSecret, "slack signing secret"),
        nowEpochSeconds: secrets.nowEpochSeconds,
        ...(secrets.slackMaxSkewSeconds === undefined ? {} : { maxSkewSeconds: secrets.slackMaxSkewSeconds }),
    }, env);
    switch (out.kind) {
        case "rejected":
            return { verified: false, raw: out.raw, reason: out.reason };
        case "url_verification":
            return { verified: true, handshake: true, raw: out.raw, responseBody: out.challenge };
        case "ignored":
            // Verified but unmodelled: capture raw, no work. Use a raw-derived key so the
            // ack path still collapses redeliveries.
            return { verified: true, handshake: false, raw: out.raw, nativeKey: `slack:raw:${out.raw.bodyHash}` };
        case "event":
            return out.event === undefined
                ? { verified: true, handshake: false, raw: out.raw, nativeKey: out.nativeKey }
                : { verified: true, handshake: false, raw: out.raw, nativeKey: out.nativeKey, event: out.event };
    }
}
function github(request, provider, secrets, env) {
    const out = ingestGithubHttp(request, provider, { webhookSecret: require_(secrets.githubWebhookSecret, "github webhook secret") }, env);
    switch (out.kind) {
        case "rejected":
            return { verified: false, raw: out.raw, reason: out.reason };
        case "ping":
            return {
                verified: true,
                handshake: true,
                raw: out.raw,
                ...(out.zen === undefined ? {} : { responseBody: out.zen }),
            };
        case "ignored":
            return { verified: true, handshake: false, raw: out.raw, nativeKey: `github:raw:${out.raw.bodyHash}` };
        case "event":
            return out.event === undefined
                ? { verified: true, handshake: false, raw: out.raw, nativeKey: out.nativeKey }
                : { verified: true, handshake: false, raw: out.raw, nativeKey: out.nativeKey, event: out.event };
    }
}
function discord(request, provider, secrets, env) {
    const out = ingestDiscordHttp(request, provider, {
        publicKeyHex: require_(secrets.discordPublicKeyHex, "discord public key"),
        ...(secrets.nowEpochSeconds === undefined ? {} : { nowEpochSeconds: secrets.nowEpochSeconds }),
    }, env);
    switch (out.kind) {
        case "rejected":
            return { verified: false, raw: out.raw, reason: out.reason };
        case "ping":
            // Discord PONG is callback type 1; the provider serializes the response.
            return { verified: true, handshake: true, raw: out.raw, responseBody: JSON.stringify({ type: 1 }) };
        case "ignored":
            return { verified: true, handshake: false, raw: out.raw, nativeKey: `discord:raw:${out.raw.bodyHash}` };
        case "interaction":
            return { verified: true, handshake: false, raw: out.raw, nativeKey: out.nativeKey, event: out.event };
    }
}
function telegram(request, provider, secrets, env) {
    const botId = require_(secrets.telegramBotId, "telegram bot id");
    const out = ingestTelegramWebhook(request, provider, { ...(secrets.telegramSecretToken === undefined ? {} : { secretToken: secrets.telegramSecretToken }) }, { ...env, botId });
    switch (out.kind) {
        case "rejected":
            return { verified: false, raw: out.raw, reason: out.reason };
        case "ignored":
            return {
                verified: true,
                handshake: false,
                raw: out.raw,
                nativeKey: out.nativeKey ?? `telegram:raw:${out.raw.bodyHash}`,
            };
        case "update":
            return { verified: true, handshake: false, raw: out.raw, nativeKey: out.nativeKey, event: out.event };
    }
}
/** Re-export the telegram secret header so the guard can recognize it if needed. */
export { TELEGRAM_SECRET_HEADER };
//# sourceMappingURL=platform-ingest.js.map