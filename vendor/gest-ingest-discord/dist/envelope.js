// @gest/ingest-discord / envelope
//
// Typed Discord envelope decoders. Discord has TWO native transports:
//
//   HTTP interactions (this phase): a single POST whose body is an Interaction
//     object with a numeric `type` (1=PING, 2=APPLICATION_COMMAND,
//     3=MESSAGE_COMPONENT, 4=APPLICATION_COMMAND_AUTOCOMPLETE, 5=MODAL_SUBMIT).
//
//   Gateway (later long-running runner): a websocket stream of frames with an
//     opcode `op`, a payload `d`, a sequence `s`, and an event name `t`. We do
//     NOT connect a gateway here, but we DEFINE the envelope contracts now so a
//     runner can decode session/shard/sequence/resume metadata without provider
//     code.
//
// This module parses ALREADY-VERIFIED bytes (HTTP) or already-trusted gateway
// frames into typed records, or a structured DecodeFailure. No untyped Discord
// JSON leaves this package: callers branch on the discriminated unions below.
//
// Hard rule: for the HTTP transport, JSON.parse happens only AFTER signature
// verification. This module does not verify; the caller verifies first (see
// verify.ts) and only then hands the parsed value here.
import { asJson, decodeJsonBody, decodeNumber, fail, isJsonObject, ok, strOf, } from "@gest/ingest-core";
// ---------------------------------------------------------------------------
// HTTP interaction envelope.
// ---------------------------------------------------------------------------
/** Discord interaction type codes (Interaction.type). */
export const INTERACTION_TYPES = {
    PING: 1,
    APPLICATION_COMMAND: 2,
    MESSAGE_COMPONENT: 3,
    APPLICATION_COMMAND_AUTOCOMPLETE: 4,
    MODAL_SUBMIT: 5,
};
export function interactionTypeName(type) {
    switch (type) {
        case INTERACTION_TYPES.PING:
            return "ping";
        case INTERACTION_TYPES.APPLICATION_COMMAND:
            return "application_command";
        case INTERACTION_TYPES.MESSAGE_COMPONENT:
            return "message_component";
        case INTERACTION_TYPES.APPLICATION_COMMAND_AUTOCOMPLETE:
            return "application_command_autocomplete";
        case INTERACTION_TYPES.MODAL_SUBMIT:
            return "modal_submit";
        default:
            return "unknown";
    }
}
/**
 * Decode an already-verified interaction body. PING (type 1) is included so the
 * caller can answer the handshake; all other types decode the same way and are
 * routed by `typeName`.
 */
export const decodeDiscordInteraction = (input, path = "") => {
    const obj = asJson(input);
    if (!isJsonObject(obj)) {
        return fail(path, "expected discord interaction object");
    }
    const typeR = decodeNumber(obj["type"], `${path}.type`);
    if (!typeR.ok)
        return typeR;
    const id = strOf(obj["id"]);
    const applicationId = strOf(obj["application_id"]);
    const token = strOf(obj["token"]);
    if (id === undefined)
        return fail(`${path}.id`, "expected interaction id string");
    if (applicationId === undefined)
        return fail(`${path}.application_id`, "expected application_id string");
    // PING carries a token too; require it so a follow-up path always has one.
    if (token === undefined)
        return fail(`${path}.token`, "expected interaction token string");
    const guildId = strOf(obj["guild_id"]);
    const channelId = strOf(obj["channel_id"]);
    const value = {
        type: typeR.value,
        typeName: interactionTypeName(typeR.value),
        id,
        applicationId,
        token,
        raw: obj,
        ...(guildId === undefined ? {} : { guildId }),
        ...(channelId === undefined ? {} : { channelId }),
    };
    return ok(value);
};
/** Parse already-verified raw HTTP bytes into JSON, then decode the interaction. */
export function parseInteractionBody(rawBody) {
    return decodeJsonBody(rawBody, decodeDiscordInteraction);
}
// ---------------------------------------------------------------------------
// Gateway event envelope (CONTRACT ONLY for later long-running runner support).
//
// Discord's gateway is a websocket. A runner owns the connection; there is no
// per-frame HTTP signature (the socket is authenticated at IDENTIFY time), so
// the signature verdict for gateway events is "not-applicable". We define the
// envelope + resume metadata contracts now so a runner can decode and key
// events deterministically without any provider code.
// ---------------------------------------------------------------------------
/** Gateway opcodes we name. `0` (Dispatch) is the only one carrying events. */
export const GATEWAY_OPCODES = {
    DISPATCH: 0,
    HEARTBEAT: 1,
    IDENTIFY: 2,
    RESUME: 6,
    RECONNECT: 7,
    INVALID_SESSION: 9,
    HELLO: 10,
    HEARTBEAT_ACK: 11,
};
/** Decode a raw gateway frame (already trusted, off the socket). */
export const decodeGatewayFrame = (input, path = "") => {
    const obj = asJson(input);
    if (!isJsonObject(obj)) {
        return fail(path, "expected gateway frame object");
    }
    const opR = decodeNumber(obj["op"], `${path}.op`);
    if (!opR.ok)
        return opR;
    const value = {
        op: opR.value,
        raw: obj,
        ...(typeof obj["t"] === "string" ? { eventType: obj["t"] } : {}),
        ...(typeof obj["s"] === "number" ? { sequence: obj["s"] } : {}),
        ...(isJsonObject(obj["d"]) ? { data: obj["d"] } : {}),
    };
    return ok(value);
};
/**
 * Build a durable gateway event envelope from a decoded DISPATCH frame plus the
 * runner's session/shard context. Returns undefined for non-dispatch or
 * incomplete frames (the runner handles control frames separately). No provider
 * code: this is pure decoding the gate exercises directly on fixtures.
 */
export function gatewayEnvelopeOf(frame, ctx) {
    if (frame.op !== GATEWAY_OPCODES.DISPATCH)
        return undefined;
    if (frame.eventType === undefined || frame.sequence === undefined || frame.data === undefined) {
        return undefined;
    }
    const guildId = strOf(frame.data["guild_id"]);
    const envelope = {
        applicationId: ctx.applicationId,
        sessionId: ctx.sessionId,
        shardId: ctx.shardId,
        shardCount: ctx.shardCount,
        sequence: frame.sequence,
        eventType: frame.eventType,
        resume: ctx.resume,
        data: frame.data,
        ...(guildId === undefined ? {} : { guildId }),
    };
    return envelope;
}
//# sourceMappingURL=envelope.js.map