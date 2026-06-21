// @gest/ingest-telegram / envelope
//
// Typed Telegram Bot API Update decoders. Telegram has ONE native envelope shape
// — the Update object — delivered over TWO transports:
//
//   Webhook (HTTP): Telegram POSTs a single Update object as the request body.
//     Parsed only AFTER the secret-token header is authenticated (see verify.ts).
//
//   Polling: the bot calls getUpdates and receives `{ ok: true, result: [Update] }`.
//     Each element of `result` is the SAME Update object shape as a webhook body.
//
// Both transports therefore decode to the identical `TelegramUpdate` record. The
// only difference is identity/authenticity, handled in verify.ts + identity.ts.
//
// An Update carries exactly one populated content field besides `update_id`
// (message, edited_message, channel_post, edited_channel_post, callback_query,
// inline_query, poll, my_chat_member, chat_member, ...). We discover which one is
// present and surface it as a typed `kind` plus the opaque payload object; the
// full Update stays under `raw` for source.telegram.
//
// This module parses ALREADY-AUTHENTICATED bytes (webhook) or already-trusted
// polling results into typed records, or a structured DecodeFailure. No untyped
// Telegram JSON leaves this package: callers branch on the discriminated unions.
import { asJson, decodeJsonBody, decodeNumber, fail, isJsonObject, ok, } from "@gest/ingest-core";
/**
 * The Update content fields this adapter decodes, in priority order. The first
 * present field wins (an Update has exactly one populated besides update_id).
 * "edited_channel_post" is included as a feasible decode; it normalizes like an
 * edited message in a channel.
 */
export const UPDATE_CONTENT_FIELDS = [
    "message",
    "edited_message",
    "channel_post",
    "edited_channel_post",
    "callback_query",
    "inline_query",
    "my_chat_member",
    "chat_member",
    "poll",
];
/** Find the first populated, recognized content field on an Update object. */
function discoverContent(obj) {
    for (const fieldName of UPDATE_CONTENT_FIELDS) {
        const value = obj[fieldName];
        if (isJsonObject(value)) {
            return { kind: fieldName, content: value };
        }
    }
    return { kind: "unknown" };
}
/**
 * Decode a single Telegram Update object (webhook body or one polling result
 * element). Requires a numeric `update_id`; everything else is discovered.
 */
export const decodeTelegramUpdate = (input, path = "") => {
    const obj = asJson(input);
    if (!isJsonObject(obj)) {
        return fail(path, "expected telegram update object");
    }
    const idR = decodeNumber(obj["update_id"], `${path}.update_id`);
    if (!idR.ok)
        return idR;
    const { kind, content } = discoverContent(obj);
    const value = {
        updateId: idR.value,
        kind,
        raw: obj,
        ...(content === undefined ? {} : { content }),
    };
    return ok(value);
};
/** Parse already-authenticated raw webhook bytes into JSON, then decode it. */
export function parseWebhookUpdate(rawBody) {
    return decodeJsonBody(rawBody, decodeTelegramUpdate);
}
/**
 * Decode a getUpdates polling response envelope. Each element of `result` is
 * decoded as an Update; a malformed element fails the whole decode (the poller
 * received a corrupt batch). The bot owns the getUpdates call, so the bytes are
 * already trusted — there is no per-update authenticity check here.
 */
export const decodeTelegramPollingResponse = (input, path = "") => {
    const obj = asJson(input);
    if (!isJsonObject(obj)) {
        return fail(path, "expected getUpdates response object");
    }
    const okFlag = obj["ok"];
    if (typeof okFlag !== "boolean") {
        return fail(`${path}.ok`, "expected boolean ok");
    }
    const result = obj["result"];
    if (!Array.isArray(result)) {
        return fail(`${path}.result`, "expected result array");
    }
    const updates = [];
    for (let i = 0; i < result.length; i++) {
        const decoded = decodeTelegramUpdate(result[i], `${path}.result[${i}]`);
        if (!decoded.ok)
            return decoded;
        updates.push(decoded.value);
    }
    return ok({ ok: okFlag, updates });
};
/** Parse already-trusted polling response bytes into JSON, then decode it. */
export function parsePollingResponse(rawBody) {
    return decodeJsonBody(rawBody, decodeTelegramPollingResponse);
}
//# sourceMappingURL=envelope.js.map