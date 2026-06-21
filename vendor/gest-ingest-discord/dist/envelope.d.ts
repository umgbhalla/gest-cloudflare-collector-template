import { type Decoder, type JsonObject } from "@gest/ingest-core";
/** Discord interaction type codes (Interaction.type). */
export declare const INTERACTION_TYPES: {
    readonly PING: 1;
    readonly APPLICATION_COMMAND: 2;
    readonly MESSAGE_COMPONENT: 3;
    readonly APPLICATION_COMMAND_AUTOCOMPLETE: 4;
    readonly MODAL_SUBMIT: 5;
};
/** Human-readable name for an interaction type code. */
export type InteractionTypeName = "ping" | "application_command" | "message_component" | "application_command_autocomplete" | "modal_submit" | "unknown";
export declare function interactionTypeName(type: number): InteractionTypeName;
/**
 * A decoded Discord interaction. The full object is kept opaque under `raw`; we
 * surface only the fields the adapter keys, normalizes, or routes on. Everything
 * else (data, message, member, etc.) is read out of `raw` by normalize.ts.
 */
export interface DiscordInteraction {
    /** Native numeric interaction type. */
    readonly type: number;
    /** Friendly type name resolved from `type`. */
    readonly typeName: InteractionTypeName;
    /** Interaction id; the dedupe identity for an interaction. */
    readonly id: string;
    /** Application id this interaction targets. */
    readonly applicationId: string;
    /** One-time interaction token used to respond / follow up. */
    readonly token: string;
    /** Guild id when the interaction happened in a guild (absent for DMs). */
    readonly guildId?: string;
    /** Channel id when present. */
    readonly channelId?: string;
    /** The full interaction object, kept opaque for source.discord. */
    readonly raw: JsonObject;
}
/**
 * Decode an already-verified interaction body. PING (type 1) is included so the
 * caller can answer the handshake; all other types decode the same way and are
 * routed by `typeName`.
 */
export declare const decodeDiscordInteraction: Decoder<DiscordInteraction>;
/** Parse already-verified raw HTTP bytes into JSON, then decode the interaction. */
export declare function parseInteractionBody(rawBody: Uint8Array): ReturnType<Decoder<DiscordInteraction>>;
/** Gateway opcodes we name. `0` (Dispatch) is the only one carrying events. */
export declare const GATEWAY_OPCODES: {
    readonly DISPATCH: 0;
    readonly HEARTBEAT: 1;
    readonly IDENTIFY: 2;
    readonly RESUME: 6;
    readonly RECONNECT: 7;
    readonly INVALID_SESSION: 9;
    readonly HELLO: 10;
    readonly HEARTBEAT_ACK: 11;
};
/**
 * Resume metadata a runner must persist to reconnect a session. Discord supplies
 * a `session_id` and a `resume_gateway_url` in the READY dispatch; the last seen
 * sequence is the cursor a RESUME replays from. Captured so reconnect/resume is a
 * durable contract, not provider-specific glue.
 */
export interface GatewayResumeMeta {
    readonly sessionId: string;
    /** URL Discord returns for resuming this specific session. */
    readonly resumeGatewayUrl?: string;
    /** Last sequence number the runner observed (the RESUME cursor). */
    readonly lastSequence?: number;
}
/**
 * A single gateway frame as a runner reads it off the socket. Only DISPATCH
 * frames (op 0) carry a named event `t`, a sequence `s`, and a payload `d`.
 * Non-dispatch control frames (HELLO/HEARTBEAT_ACK/RECONNECT/INVALID_SESSION)
 * decode with `eventType`/`sequence` absent.
 */
export interface GatewayFrame {
    readonly op: number;
    /** Event name for DISPATCH frames, e.g. "MESSAGE_CREATE", "READY". */
    readonly eventType?: string;
    /** Monotonic sequence for DISPATCH frames; the heartbeat/resume cursor. */
    readonly sequence?: number;
    /** The dispatch payload `d`, kept opaque for normalization. */
    readonly data?: JsonObject;
    /** The raw frame, kept opaque for audit. */
    readonly raw: JsonObject;
}
/**
 * The durable gateway event envelope: a decoded DISPATCH frame plus the session
 * and shard context a runner attaches. This is the long-running-runner analogue
 * of an HTTP RawDelivery's envelope. It is fully decodable WITHOUT provider code
 * (the gate decodes fixtures of this shape directly).
 */
export interface GatewayEventEnvelope {
    /** Application (bot) id this event stream belongs to. */
    readonly applicationId: string;
    /** Gateway session id the frame arrived on. */
    readonly sessionId: string;
    /**
     * Shard id this connection serves. Discord shards by
     * (guild_id >> 22) % shard_count; the runner knows its shard, so it is part of
     * the envelope, not the frame.
     */
    readonly shardId: number;
    /** Total shard count for the connection, recorded for audit/rebalancing. */
    readonly shardCount: number;
    /** Sequence number from the DISPATCH frame. */
    readonly sequence: number;
    /** Event name from the DISPATCH frame, e.g. "MESSAGE_CREATE". */
    readonly eventType: string;
    /** Guild id when the event is guild-scoped (absent for DM events). */
    readonly guildId?: string;
    /** Resume metadata the runner carries for reconnect. */
    readonly resume: GatewayResumeMeta;
    /** The dispatch payload `d`, kept opaque for normalization. */
    readonly data: JsonObject;
}
/** Decode a raw gateway frame (already trusted, off the socket). */
export declare const decodeGatewayFrame: Decoder<GatewayFrame>;
/** Inputs a runner supplies to build an envelope from a DISPATCH frame. */
export interface GatewayContext {
    readonly applicationId: string;
    readonly sessionId: string;
    readonly shardId: number;
    readonly shardCount: number;
    readonly resume: GatewayResumeMeta;
}
/**
 * Build a durable gateway event envelope from a decoded DISPATCH frame plus the
 * runner's session/shard context. Returns undefined for non-dispatch or
 * incomplete frames (the runner handles control frames separately). No provider
 * code: this is pure decoding the gate exercises directly on fixtures.
 */
export declare function gatewayEnvelopeOf(frame: GatewayFrame, ctx: GatewayContext): GatewayEventEnvelope | undefined;
//# sourceMappingURL=envelope.d.ts.map