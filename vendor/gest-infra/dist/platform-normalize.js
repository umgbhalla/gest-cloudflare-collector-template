// @gest/infra / platform-normalize
//
// The consumer-side "platform normalize" step. Given a stored RawDelivery (source
// truth, whose signature verdict was already decided + persisted on the ack path),
// re-parse the stored body and re-run the platform adapter's normalization to
// rebuild the NormalizedEvent. This is the REPLAY-SAFE path: it performs NO
// signature re-verification (the durable verdict on the raw record is authoritative
// and some adapters strip auth headers from the stored raw by contract) and NO
// side effects — it only decodes + normalizes through the platform adapters.
//
// infra is allowed to import the platform adapters here because it is the wiring
// layer. Platform decode/normalize logic still lives in the adapters; this only
// selects and calls them.
import { SLACK_DECODER_VERSION, normalizeSlackEvent, parseEventsApiBody, slackMessageDedupeKey, } from "@gest/ingest-slack";
import { GITHUB_DECODER_VERSION, deliveryIdentityOf, normalizeGithubEvent, parseGithubBody, } from "@gest/ingest-github";
import { DISCORD_DECODER_VERSION, decodeGatewayFrame, gatewayEnvelopeOf, normalizeDiscordGatewayEvent, normalizeDiscordInteraction, parseInteractionBody, } from "@gest/ingest-discord";
import { TELEGRAM_DECODER_VERSION, normalizeTelegramUpdate, parseWebhookUpdate, } from "@gest/ingest-telegram";
/** Decoder version the produced canonical event records, per platform. */
export const DECODER_VERSIONS = {
    slack: SLACK_DECODER_VERSION,
    github: GITHUB_DECODER_VERSION,
    discord: DISCORD_DECODER_VERSION,
    telegram: TELEGRAM_DECODER_VERSION,
};
const UNSUPPORTED = { kind: "unsupported" };
/** Lift a platform normalizer's three-way return into the consumer outcome. */
function outcomeOf(result) {
    if (result === undefined)
        return UNSUPPORTED;
    return result.ok ? { kind: "event", event: result.value } : { kind: "undecodable", failure: result };
}
/**
 * Rebuild the NormalizedEvent from a stored raw delivery, as a NormalizeOutcome.
 * The verdict carried onto the event provenance mirrors the raw record: verified
 * iff the stored signature kind is "verified". This performs NO signature
 * re-verification and NO side effects — replay-safe decode + normalize only.
 */
export function normalizeFromRaw(raw, ctx) {
    if (raw.body === undefined)
        return UNSUPPORTED;
    const verified = raw.signature.kind === "verified";
    const signatureKind = raw.signature.kind;
    const bytes = new TextEncoder().encode(raw.body);
    switch (raw.platform) {
        case "slack": {
            const decoded = parseEventsApiBody(bytes);
            if (!decoded.ok || decoded.value.kind !== "event_callback")
                return UNSUPPORTED;
            return outcomeOf(normalizeSlackEvent(decoded.value, {
                tenant: ctx.tenant,
                rawId: ctx.rawId,
                verified,
                signatureKind,
                receivedAt: ctx.receivedAt,
                nativeKey: ctx.nativeKey,
            }));
        }
        case "github": {
            const identity = deliveryIdentityOf(raw.headers);
            if (identity === undefined)
                return UNSUPPORTED;
            const decoded = parseGithubBody(identity.eventName, bytes);
            if (!decoded.ok)
                return UNSUPPORTED;
            return outcomeOf(normalizeGithubEvent(decoded.value, {
                tenant: ctx.tenant,
                rawId: ctx.rawId,
                verified,
                signatureKind,
                receivedAt: ctx.receivedAt,
                nativeKey: ctx.nativeKey,
                identity,
            }));
        }
        case "discord": {
            // Gateway-origin deliveries (transport "socket") carry a stored gateway
            // FRAME, not an HTTP interaction. Re-decode the frame, rebuild the session/
            // shard context from the native key (discord:gateway:{app}:{scope}:{session}:
            // {seq}:{t} — the SAME key the DO's delivery gate claimed), and normalize via
            // the SAME gateway normalizer the runner's ingest seam used. This keeps the
            // consumer path BYTE-IDENTICAL to webhooks: load raw -> normalize -> journal.
            if (raw.transport === "socket") {
                return normalizeDiscordGatewayFromRaw(bytes, ctx, verified, signatureKind);
            }
            const decoded = parseInteractionBody(bytes);
            if (!decoded.ok)
                return UNSUPPORTED;
            return outcomeOf(normalizeDiscordInteraction(decoded.value, {
                tenant: ctx.tenant,
                rawId: ctx.rawId,
                verified,
                signatureKind,
                receivedAt: ctx.receivedAt,
                nativeKey: ctx.nativeKey,
            }));
        }
        case "telegram": {
            const decoded = parseWebhookUpdate(bytes);
            if (!decoded.ok)
                return UNSUPPORTED;
            const botId = raw.account;
            return outcomeOf(normalizeTelegramUpdate(decoded.value, {
                tenant: ctx.tenant,
                botId,
                rawId: ctx.rawId,
                verified,
                signatureKind,
                receivedAt: ctx.receivedAt,
                nativeKey: ctx.nativeKey,
                transport: "webhook",
            }));
        }
    }
}
/**
 * Rebuild a NormalizedEvent from a stored gateway-origin (transport "socket")
 * Discord raw delivery. The raw body is the gateway FRAME bytes; the session/shard
 * context is recovered from the native key (which the DO derived from the runner's
 * envelope), so the rebuilt dedupe key is identical and the canonical event matches
 * the one the runner's ingest seam produced live. v1 is single-shard [0,1].
 */
function normalizeDiscordGatewayFromRaw(bytes, ctx, verified, signatureKind) {
    const parsed = gatewayKeyParts(ctx.nativeKey);
    if (parsed === undefined)
        return UNSUPPORTED;
    let frameInput;
    try {
        frameInput = JSON.parse(new TextDecoder().decode(bytes));
    }
    catch {
        return UNSUPPORTED;
    }
    const decoded = decodeGatewayFrame(frameInput);
    if (!decoded.ok)
        return UNSUPPORTED;
    const gatewayCtx = {
        applicationId: parsed.applicationId,
        sessionId: parsed.sessionId,
        shardId: 0,
        shardCount: 1,
        resume: { sessionId: parsed.sessionId, lastSequence: parsed.sequence },
    };
    const envelope = gatewayEnvelopeOf(decoded.value, gatewayCtx);
    if (envelope === undefined)
        return UNSUPPORTED;
    return outcomeOf(normalizeDiscordGatewayEvent(envelope, {
        tenant: ctx.tenant,
        rawId: ctx.rawId,
        verified,
        signatureKind,
        receivedAt: ctx.receivedAt,
        nativeKey: ctx.nativeKey,
    }));
}
/**
 * Parse the gateway native key
 *   discord:gateway:{applicationId}:{scope}:{sessionId}:{sequence}:{eventType}
 * back into the fields the envelope rebuild needs. Returns undefined for any key
 * that is not a well-formed gateway key.
 */
function gatewayKeyParts(nativeKey) {
    const parts = nativeKey.split(":");
    // ["discord","gateway",app,scope,session,seq,eventType] — eventType has no colon.
    if (parts.length !== 7 || parts[0] !== "discord" || parts[1] !== "gateway")
        return undefined;
    const applicationId = parts[2];
    const sessionId = parts[4];
    const sequence = Number(parts[5]);
    if (applicationId === undefined || sessionId === undefined || !Number.isFinite(sequence)) {
        return undefined;
    }
    return { applicationId, sessionId, sequence };
}
/**
 * Derive the OPTIONAL message-level dedupe key for a normalized event, dispatched
 * per platform. This is the DISTINCT message-dedupe layer (separate keys + TTL
 * from delivery-level dedupe); the platform adapter owns the derivation. For the
 * Slack vertical slice only Slack is wired; the other platforms return undefined
 * (no message dedupe) until they are slotted in — with no dispatcher changes.
 */
export function messageDedupeKeyFor(event) {
    switch (event.platform) {
        case "slack":
            return slackMessageDedupeKey(event);
        default:
            return undefined;
    }
}
//# sourceMappingURL=platform-normalize.js.map