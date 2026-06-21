import { type Decoder, type JsonObject } from "@gest/ingest-core";
/** Slack authorization entry (who the app is acting as for this delivery). */
export interface SlackAuthorization {
    readonly enterprise_id?: string;
    readonly team_id?: string;
    readonly user_id: string;
    readonly is_bot: boolean;
    readonly is_enterprise_install?: boolean;
}
export declare const decodeSlackAuthorization: Decoder<SlackAuthorization>;
/** The inner Slack event object. Kept as opaque JSON plus the fields we key on. */
export interface SlackInnerEvent {
    /** Inner event type, e.g. "message", "app_mention", "reaction_added". */
    readonly type: string;
    /** Message subtype, e.g. "message_changed", "message_deleted". */
    readonly subtype?: string;
    /** Slack event timestamp ("ts") when present. */
    readonly ts?: string;
    /** Event time inside the inner event when Slack supplies it. */
    readonly event_ts?: string;
    /** The full inner event, kept opaque for source[platform]. */
    readonly raw: JsonObject;
}
export declare const decodeSlackInnerEvent: Decoder<SlackInnerEvent>;
/** URL verification challenge (Events API setup handshake). */
export interface SlackUrlVerification {
    readonly kind: "url_verification";
    readonly challenge: string;
    readonly token?: string;
}
/** A normal Events API event callback. */
export interface SlackEventCallback {
    readonly kind: "event_callback";
    readonly api_app_id: string;
    readonly team_id?: string;
    readonly enterprise_id?: string;
    /** Slack Connect / shared-channel context team. */
    readonly context_team_id?: string;
    readonly context_enterprise_id?: string;
    readonly event_id: string;
    readonly event_time: number;
    readonly authorizations?: readonly SlackAuthorization[];
    readonly is_ext_shared_channel?: boolean;
    readonly event: SlackInnerEvent;
}
/** Anything else Slack may POST (rate-limit notices, etc.) kept opaque. */
export interface SlackUnknownEnvelope {
    readonly kind: "unknown";
    readonly type: string;
    readonly raw: JsonObject;
}
export type SlackEventsApiEnvelope = SlackUrlVerification | SlackEventCallback | SlackUnknownEnvelope;
/**
 * Decode an Events API outer envelope (the already-parsed verified body). Returns
 * a discriminated union so callers handle url_verification, event_callback, and
 * unknown explicitly. Unknown outer types are preserved opaquely, never dropped.
 */
export declare const decodeSlackEventsApiEnvelope: Decoder<SlackEventsApiEnvelope>;
/** Socket Mode frame types we handle as a runner input. */
export declare const SOCKET_MODE_TYPES: readonly ["hello", "events_api", "interactive", "slash_commands", "disconnect"];
export type SocketModeType = (typeof SOCKET_MODE_TYPES)[number];
/** A decoded Socket Mode frame. `payload` is the inner Events API body. */
export interface SocketModeEnvelope {
    readonly type: string;
    /** Present on frames that must be acked (events_api/interactive/slash). */
    readonly envelope_id?: string;
    /** True when Slack will retry if this envelope is not acked. */
    readonly accepts_response_payload?: boolean;
    /** Native retry attempt info Slack carries on socket redeliveries. */
    readonly retry_attempt?: number;
    readonly retry_reason?: string;
    /** The wrapped Events API envelope, for type === "events_api". */
    readonly payload?: SlackEventsApiEnvelope;
    /** The raw frame, kept opaque for audit. */
    readonly raw: JsonObject;
}
/**
 * Decode a Socket Mode frame. For "events_api" frames the inner payload is parsed
 * into the same `SlackEventsApiEnvelope` union the HTTP path uses, so downstream
 * normalization is transport-independent. Frames without a payload (hello,
 * disconnect) decode with `payload` absent.
 */
export declare const decodeSocketModeEnvelope: Decoder<SocketModeEnvelope>;
/** Parse already-verified raw HTTP bytes into JSON, then decode the envelope. */
export declare function parseEventsApiBody(rawBody: Uint8Array): ReturnType<Decoder<SlackEventsApiEnvelope>>;
//# sourceMappingURL=envelope.d.ts.map