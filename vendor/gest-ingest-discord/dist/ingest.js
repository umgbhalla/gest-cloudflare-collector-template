// @gest/ingest-discord / ingest
//
// The platform-adapter entry points that tie verification, envelope decoding,
// identity, and normalization together WITHOUT touching storage or a runtime.
// A provider adapter supplies the captured bytes + provider metadata; a runner
// supplies gateway frames. These functions return durable records (RawDelivery,
// native key, NormalizedEvent) for the caller to persist raw-first and process.
//
// Gest boundaries kept here:
// - HTTP path verifies the Ed25519 signature over exact bytes BEFORE parsing JSON.
// - We never dispatch or decide; we only verify + decode + normalize + key.
// - PING is surfaced as a typed handshake outcome, not auto-answered, so the
//   provider adapter owns the HTTP response (a PONG, callback type 1).
import { buildRawDelivery, normalizedEventOf, } from "@gest/ingest-core";
import { GATEWAY_OPCODES, decodeGatewayFrame, gatewayEnvelopeOf, parseInteractionBody, } from "./envelope.js";
import { gatewayDedupeKey, interactionDedupeKey } from "./identity.js";
import { normalizeDiscordGatewayEvent, normalizeDiscordInteraction, } from "./normalize.js";
import { verifyDiscordRequest } from "./verify.js";
/**
 * Ingest a Discord HTTP interaction request: verify the Ed25519 signature over
 * raw bytes, then (only on a verified signature) parse and decode the
 * interaction. Returns durable records for the caller to persist raw-first. A
 * rejected/expired/missing/unsupported signature yields a "rejected" outcome
 * whose raw delivery carries audit metadata only (no attacker-controlled body).
 *
 * PING (type 1) is returned as a typed "ping" outcome; the provider adapter
 * answers with a PONG. It is not a runtime event, so no normalized event is
 * produced.
 */
export function ingestDiscordHttp(request, provider, verifyOpts, env) {
    const verification = verifyDiscordRequest(request, verifyOpts);
    const sig = verification.signature;
    if (!verification.verified) {
        // Source-truth rule: do not persist the attacker-controlled body.
        const raw = buildRaw(request, provider, env, sig, verification.retry, undefined);
        return { kind: "rejected", raw, reason: sig.reason ?? "signature not verified" };
    }
    const bodyText = new TextDecoder().decode(request.rawBody);
    const decoded = parseInteractionBody(request.rawBody);
    if (!decoded.ok) {
        const raw = buildRaw(request, provider, env, sig, verification.retry, bodyText);
        return { kind: "ignored", raw, reason: "interaction decode failed" };
    }
    const interaction = decoded.value;
    const account = interaction.guildId ?? interaction.applicationId;
    // Secret isolation (docs/security-privacy.md): the interaction `token` is a
    // live bearer credential (~15 min) authorizing response/followup/edit calls.
    // Strip it from the durable raw body; the runtime gets it via interaction.token
    // for the short effect window, so it never needs to read it back from raw.body.
    const redactedBody = JSON.stringify({ ...interaction.raw, token: "[REDACTED]" });
    const raw = buildRaw(request, provider, env, sig, verification.retry, redactedBody, account);
    if (interaction.typeName === "ping") {
        return { kind: "ping", raw, interaction };
    }
    const nativeKey = interactionDedupeKey(interaction);
    // Ack path: a malformed-but-signed interaction (DecodeFailure) folds to "no
    // event" like an unsupported type — the raw is durable and the ack must not
    // 500. The consumer seam re-derives and surfaces the failure.
    const event = normalizedEventOf(normalizeDiscordInteraction(interaction, {
        tenant: env.tenant,
        rawId: env.rawId,
        // HTTP interaction path: the Ed25519 signature over exact bytes was verified.
        verified: true,
        signatureKind: "verified",
        receivedAt: env.receivedAt,
        nativeKey,
    }));
    if (event === undefined) {
        return { kind: "ignored", raw, reason: `unhandled interaction type "${interaction.typeName}"` };
    }
    return { kind: "interaction", raw, interaction, nativeKey, event };
}
/**
 * Decode a Discord gateway frame for a long-running runner. The gateway has no
 * per-frame HTTP signature (the websocket is authenticated at IDENTIFY time), so
 * the signature verdict for these is "not-applicable". Non-dispatch control
 * frames (HELLO/HEARTBEAT_ACK/RECONNECT/INVALID_SESSION) are returned as
 * "control" for the runner to handle (heartbeat/resume). Dispatch frames are
 * keyed and normalized; unsupported event types still produce an envelope + key.
 */
export function ingestDiscordGateway(frameInput, ctx, env) {
    const decoded = decodeGatewayFrame(frameInput);
    if (!decoded.ok) {
        return { kind: "undecodable", reason: decoded.issues.map((i) => i.message).join("; ") };
    }
    const frame = decoded.value;
    const envelope = gatewayEnvelopeOf(frame, ctx);
    if (envelope === undefined) {
        // A DISPATCH frame (op 0) that fails to build an envelope did so because its
        // payload/event-type/sequence is missing or malformed — that is a decode
        // failure, not a control frame. Only genuine non-dispatch ops are "control".
        if (frame.op === GATEWAY_OPCODES.DISPATCH) {
            return { kind: "undecodable", reason: "dispatch frame missing event type, sequence, or payload" };
        }
        return { kind: "control", frame, reason: `op ${frame.op} is not a dispatch event` };
    }
    const nativeKey = gatewayDedupeKey(envelope);
    const event = normalizedEventOf(normalizeDiscordGatewayEvent(envelope, {
        tenant: env.tenant,
        rawId: env.rawId,
        // Gateway frames carry NO per-frame signature: the websocket is authenticated
        // at IDENTIFY time (connect-time transport trust), which must NOT satisfy a
        // signature-verification gate. Mirror Slack socket: verified:false +
        // not-applicable.
        verified: false,
        signatureKind: "not-applicable",
        receivedAt: env.receivedAt,
        nativeKey,
    }));
    return event === undefined
        ? { kind: "event", frame, envelope, nativeKey }
        : { kind: "event", frame, envelope, nativeKey, event };
}
function buildRaw(request, provider, env, signature, retry, body, account) {
    // account (guild/app) is platform-derived; core owns the common shape + the
    // no-attacker-body policy. The rejected path passes body=undefined.
    return buildRawDelivery({ rawId: env.rawId, tenant: env.tenant, receivedAt: env.receivedAt, provider, headers: request.headers, bodyHash: env.bodyHash, signature, retry, ...(body === undefined ? {} : { body }) }, { platform: "discord", transport: "http", account: account ?? provider.requestId });
}
//# sourceMappingURL=ingest.js.map