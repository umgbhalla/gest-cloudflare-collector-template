import { type Decoder, type JsonObject } from "@gest/ingest-core";
/**
 * The Update content fields this adapter decodes, in priority order. The first
 * present field wins (an Update has exactly one populated besides update_id).
 * "edited_channel_post" is included as a feasible decode; it normalizes like an
 * edited message in a channel.
 */
export declare const UPDATE_CONTENT_FIELDS: readonly ["message", "edited_message", "channel_post", "edited_channel_post", "callback_query", "inline_query", "my_chat_member", "chat_member", "poll"];
export type UpdateContentField = (typeof UPDATE_CONTENT_FIELDS)[number];
/** Friendly content kind resolved from the populated Update field. */
export type UpdateContentKind = UpdateContentField | "unknown";
/**
 * A decoded Telegram Update. We surface the dedupe-critical `updateId`, the
 * discovered content `kind`, and the populated content object; the full Update is
 * kept opaque under `raw` for source.telegram. Other fields (chat, from, message
 * ids) are read out of `content`/`raw` by normalize.ts.
 */
export interface TelegramUpdate {
    /** Native update id; the per-bot dedupe identity. */
    readonly updateId: number;
    /** Which content field is populated (or "unknown" if none recognized). */
    readonly kind: UpdateContentKind;
    /** The populated content object (message/callback_query/...), or undefined. */
    readonly content?: JsonObject;
    /** The full Update object, kept opaque for source.telegram. */
    readonly raw: JsonObject;
}
/** The getUpdates polling response envelope: `{ ok, result: [Update] }`. */
export interface TelegramPollingResponse {
    readonly ok: boolean;
    readonly updates: readonly TelegramUpdate[];
}
/**
 * Decode a single Telegram Update object (webhook body or one polling result
 * element). Requires a numeric `update_id`; everything else is discovered.
 */
export declare const decodeTelegramUpdate: Decoder<TelegramUpdate>;
/** Parse already-authenticated raw webhook bytes into JSON, then decode it. */
export declare function parseWebhookUpdate(rawBody: Uint8Array): ReturnType<Decoder<TelegramUpdate>>;
/**
 * Decode a getUpdates polling response envelope. Each element of `result` is
 * decoded as an Update; a malformed element fails the whole decode (the poller
 * received a corrupt batch). The bot owns the getUpdates call, so the bytes are
 * already trusted — there is no per-update authenticity check here.
 */
export declare const decodeTelegramPollingResponse: Decoder<TelegramPollingResponse>;
/** Parse already-trusted polling response bytes into JSON, then decode it. */
export declare function parsePollingResponse(rawBody: Uint8Array): ReturnType<Decoder<TelegramPollingResponse>>;
//# sourceMappingURL=envelope.d.ts.map