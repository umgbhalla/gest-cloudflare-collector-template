// @gest/ingest-telegram / normalize
//
// Map a decoded Telegram Update (webhook or polling — identical shape) into the
// core's platform-neutral NormalizedEvent. The mapping is deterministic and total
// over the supported content kinds: an Update yields at most one normalized event
// with a closed family/kind, plus an opaque source.telegram payload carrying the
// Telegram-specific detail (bot/chat/user/message/thread-forum-topic/callback/
// membership metadata). Content kinds we do not map yield `undefined` (the caller
// records the raw + dedupe but emits no normalized event), never a guess.
//
// No Telegram field is promoted to the top level beyond the neutral identity
// fields; everything Telegram-specific lives under source.telegram, which the
// core treats as opaque JSON.
//
// Limited history honesty: Telegram does NOT support Slack-like broad backfill.
// This adapter normalizes ONLY the updates the bot is actually delivered (subject
// to privacy mode and admin status). It never synthesizes historical events.
import { familyOf, idOf, isJsonObject, occurredAtFromEpochSeconds, ok, strOf, } from "@gest/ingest-core";
import {} from "./envelope.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export const TELEGRAM_DECODER_VERSION = "telegram-decoder-1";
function userMetaOf(value) {
    if (!isJsonObject(value))
        return undefined;
    const id = idOf(value["id"]);
    if (id === undefined)
        return undefined;
    const firstName = strOf(value["first_name"]);
    const lastName = strOf(value["last_name"]);
    const username = strOf(value["username"]);
    const languageCode = strOf(value["language_code"]);
    return {
        id,
        ...(typeof value["is_bot"] === "boolean" ? { isBot: value["is_bot"] } : {}),
        ...(firstName === undefined ? {} : { firstName }),
        ...(lastName === undefined ? {} : { lastName }),
        ...(username === undefined ? {} : { username }),
        ...(languageCode === undefined ? {} : { languageCode }),
    };
}
function chatMetaOf(value) {
    if (!isJsonObject(value))
        return undefined;
    const id = idOf(value["id"]);
    if (id === undefined)
        return undefined;
    const type = strOf(value["type"]);
    const title = strOf(value["title"]);
    const username = strOf(value["username"]);
    return {
        id,
        ...(type === undefined ? {} : { type }),
        ...(title === undefined ? {} : { title }),
        ...(username === undefined ? {} : { username }),
        ...(typeof value["is_forum"] === "boolean" ? { isForum: value["is_forum"] } : {}),
    };
}
function messageMetaOf(value) {
    if (!isJsonObject(value))
        return undefined;
    const id = idOf(value["message_id"]);
    if (id === undefined)
        return undefined;
    const chat = chatMetaOf(value["chat"]);
    const from = userMetaOf(value["from"]);
    const text = strOf(value["text"]) ?? strOf(value["caption"]);
    // Forum topic thread id: present only when the message belongs to a topic.
    const threadId = idOf(value["message_thread_id"]);
    return {
        id,
        ...(chat === undefined ? {} : { chat }),
        ...(from === undefined ? {} : { from }),
        ...(typeof value["date"] === "number" ? { date: value["date"] } : {}),
        ...(text === undefined ? {} : { text }),
        ...(threadId === undefined ? {} : { threadId }),
        ...(typeof value["edit_date"] === "number" ? { editDate: value["edit_date"] } : {}),
    };
}
function callbackMetaOf(value) {
    const id = strOf(value["id"]);
    if (id === undefined)
        return undefined;
    const from = userMetaOf(value["from"]);
    const data = strOf(value["data"]);
    const chatInstance = strOf(value["chat_instance"]);
    const message = messageMetaOf(value["message"]);
    return {
        id,
        ...(from === undefined ? {} : { from }),
        ...(data === undefined ? {} : { data }),
        ...(chatInstance === undefined ? {} : { chatInstance }),
        ...(message === undefined ? {} : { message }),
    };
}
function inlineQueryMetaOf(value) {
    const id = strOf(value["id"]);
    if (id === undefined)
        return undefined;
    const from = userMetaOf(value["from"]);
    const query = strOf(value["query"]);
    const offset = strOf(value["offset"]);
    return {
        id,
        ...(from === undefined ? {} : { from }),
        ...(query === undefined ? {} : { query }),
        ...(offset === undefined ? {} : { offset }),
    };
}
function membershipMetaOf(value) {
    const chat = chatMetaOf(value["chat"]);
    const from = userMetaOf(value["from"]);
    const oldMember = isJsonObject(value["old_chat_member"]) ? value["old_chat_member"] : undefined;
    const newMember = isJsonObject(value["new_chat_member"]) ? value["new_chat_member"] : undefined;
    const oldStatus = oldMember ? strOf(oldMember["status"]) : undefined;
    const newStatus = newMember ? strOf(newMember["status"]) : undefined;
    const oldIsMember = oldMember && typeof oldMember["is_member"] === "boolean" ? oldMember["is_member"] : undefined;
    const newIsMember = newMember && typeof newMember["is_member"] === "boolean" ? newMember["is_member"] : undefined;
    const subject = newMember ? userMetaOf(newMember["user"]) : undefined;
    const meta = {
        ...(chat === undefined ? {} : { chat }),
        ...(from === undefined ? {} : { from }),
        ...(oldStatus === undefined ? {} : { oldStatus }),
        ...(newStatus === undefined ? {} : { newStatus }),
        ...(oldIsMember === undefined ? {} : { oldIsMember }),
        ...(newIsMember === undefined ? {} : { newIsMember }),
        ...(subject === undefined ? {} : { subject }),
        ...(typeof value["date"] === "number" ? { date: value["date"] } : {}),
    };
    return meta;
}
/** Resolve membership kind from the status transition (joined/left/updated). */
function membershipKind(meta) {
    const LEFTISH = new Set(["left", "kicked"]);
    // A user is present unless their status is leftish, or they are "restricted"
    // with is_member=false (restricted-and-not-in-chat). The is_member boolean on
    // the ChatMember overrides the status string for presence.
    const present = (status, isMember) => status !== undefined &&
        !LEFTISH.has(status) &&
        !(status === "restricted" && isMember === false);
    const wasMember = present(meta?.oldStatus, meta?.oldIsMember);
    const isMember = present(meta?.newStatus, meta?.newIsMember);
    if (!wasMember && isMember)
        return "member.joined";
    if (wasMember && !isMember)
        return "member.left";
    return "member.updated";
}
/** Resolve the closed family/kind for an update content kind, or undefined. */
function mapKind(contentKind, membership) {
    let kind;
    switch (contentKind) {
        case "message":
        case "channel_post":
            kind = "message.created";
            break;
        case "edited_message":
        case "edited_channel_post":
            kind = "message.edited";
            break;
        case "callback_query":
            kind = "app.interactive";
            break;
        case "inline_query":
            kind = "app.interactive";
            break;
        case "my_chat_member":
        case "chat_member":
            kind = membershipKind(membership);
            break;
        case "poll":
            // There is no neutral poll family, and the core's system kinds
            // (rate_limited/reconnect/permission_denied) all carry specific meaning a
            // poll-state update does not match. Rather than emit a misleading kind, we
            // treat poll as an undecoded content kind: the caller records raw + dedupe
            // key (kind: "ignored") without emitting an event, matching the existing
            // unknown-update path. (No invented chat semantics.)
            return undefined;
        default:
            return undefined;
    }
    return kind === undefined ? undefined : { kind, family: familyOf(kind) };
}
// ---------------------------------------------------------------------------
// Normalization.
// ---------------------------------------------------------------------------
/** Build the opaque source.telegram payload for an update. */
function buildSource(update, ctx, parts) {
    const source = {
        transport: ctx.transport,
        botId: ctx.botId,
        updateId: update.updateId,
        contentKind: update.kind,
    };
    if (parts.chat !== undefined)
        source["chat"] = parts.chat;
    if (parts.from !== undefined)
        source["from"] = parts.from;
    if (parts.message !== undefined)
        source["message"] = parts.message;
    if (parts.callback !== undefined)
        source["callbackQuery"] = parts.callback;
    if (parts.inlineQuery !== undefined)
        source["inlineQuery"] = parts.inlineQuery;
    if (parts.membership !== undefined)
        source["membership"] = parts.membership;
    if (parts.message?.threadId !== undefined)
        source["forumTopicId"] = parts.message.threadId;
    return source;
}
/**
 * Normalize a decoded Telegram Update into a NormalizedEvent.
 *
 * Three outcomes, kept distinct (see NormalizeResult):
 *  - `undefined`     -> the content kind is outside the supported set (genuinely
 *                       unsupported; the caller records raw + dedupe, no event).
 *  - `DecodeFailure` -> a supported but malformed-but-signed update (e.g. a
 *                       garbage/out-of-range `date`).
 *  - `ok(event)`     -> the normalized event.
 *
 * The transport (webhook/polling) is recorded under source.telegram but never
 * changes the identity or normalized shape.
 */
export function normalizeTelegramUpdate(update, ctx) {
    const content = update.content;
    if (content === undefined || update.kind === "unknown")
        return undefined;
    // Decode the content-specific metadata up front (drives kind + source).
    const message = update.kind === "message" ||
        update.kind === "edited_message" ||
        update.kind === "channel_post" ||
        update.kind === "edited_channel_post"
        ? messageMetaOf(content)
        : undefined;
    const callback = update.kind === "callback_query" ? callbackMetaOf(content) : undefined;
    const inlineQuery = update.kind === "inline_query" ? inlineQueryMetaOf(content) : undefined;
    const membership = update.kind === "my_chat_member" || update.kind === "chat_member"
        ? membershipMetaOf(content)
        : undefined;
    const mapping = mapKind(update.kind, membership);
    if (mapping === undefined)
        return undefined;
    // Resolve the neutral scope/actor across the content shapes.
    const chat = message?.chat ??
        callback?.message?.chat ??
        membership?.chat ??
        chatMetaOf(content["chat"]);
    const actor = message?.from ??
        callback?.from ??
        inlineQuery?.from ??
        membership?.from ??
        membership?.subject;
    // Conversation scope: the chat for chat-bound events; for an inline query
    // (no chat) the querying user is the conversation scope; otherwise the bot.
    const conversation = chat?.id ?? inlineQuery?.from?.id ?? actor?.id ?? ctx.botId;
    const threadId = message?.threadId;
    const text = message?.text ?? callback?.data ?? inlineQuery?.query;
    const source = buildSource(update, ctx, {
        ...(message === undefined ? {} : { message }),
        ...(callback === undefined ? {} : { callback }),
        ...(inlineQuery === undefined ? {} : { inlineQuery }),
        ...(membership === undefined ? {} : { membership }),
        ...(chat === undefined ? {} : { chat }),
        ...(actor === undefined ? {} : { from: actor }),
    });
    const occurred = occurredAtOf(message?.date ?? membership?.date);
    if (!occurred.ok)
        return occurred;
    const occurredAt = occurred.value;
    const event = {
        eventId: eventIdOf(ctx.botId, update),
        platform: "telegram",
        family: mapping.family,
        kind: mapping.kind,
        tenant: ctx.tenant,
        account: ctx.botId,
        conversationId: conversation,
        receivedAt: ctx.receivedAt,
        provenance: {
            verified: ctx.verified,
            signatureKind: ctx.signatureKind,
            rawId: ctx.rawId,
            decoderVersion: TELEGRAM_DECODER_VERSION,
            nativeKey: ctx.nativeKey,
        },
        source: { telegram: source },
        ...(actor === undefined ? {} : { actorId: actor.id }),
        ...(threadId === undefined ? {} : { threadId }),
        ...(text === undefined ? {} : { text }),
        ...(occurredAt === undefined ? {} : { occurredAt }),
    };
    return ok(event);
}
/**
 * Stable, collision-free event id for a Telegram update. update_id is unique per
 * bot, so bot id + update id is a deterministic identity that matches the dedupe
 * key's scope (and is stable across webhook vs polling delivery of the same
 * update).
 */
function eventIdOf(botId, update) {
    return `${botId}:${update.updateId}`;
}
/**
 * Convert a Telegram unix-seconds date into an ISO timestamp via the shared
 * occurredAt policy. A present-but-out-of-range/non-finite date (which would
 * otherwise throw a RangeError from `new Date(...).toISOString()` and abort the
 * whole batch, or be silently dropped) is a malformed-but-signed payload: it
 * yields a DecodeFailure. Absent date -> ok(undefined).
 */
function occurredAtOf(unixSeconds) {
    return occurredAtFromEpochSeconds(unixSeconds, "message.date");
}
//# sourceMappingURL=normalize.js.map