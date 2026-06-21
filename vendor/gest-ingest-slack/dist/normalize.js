// @gest/ingest-slack / normalize
//
// Map a verified Slack event_callback into the core's platform-neutral
// NormalizedEvent. The mapping is deterministic and total over the first
// supported events (docs/platforms/slack.md): a Slack inner event always yields
// at most one normalized event with a closed family/kind, plus an opaque
// source.slack payload carrying the Slack-specific detail. Events we do not map
// yield `undefined` (the caller records the raw + dedupe but emits no normalized
// event), never a guess.
//
// No Slack field is promoted to the top level; everything Slack-specific lives
// under source.slack, which the core treats as opaque JSON.
import { familyOf, occurredAtFromEpochSeconds, ok, } from "@gest/ingest-core";
import { authContextOf, scopeOf, selectBotAuthorization } from "./identity.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export const SLACK_DECODER_VERSION = "slack-decoder-1";
/**
 * The channel kind a Slack channel-lifecycle signal maps to, defined in ONE
 * place so the two paths that observe it — a `message` subtype
 * (channel_archive/channel_unarchive) and a top-level event of the same name —
 * cannot drift apart.
 */
const CHANNEL_KIND = {
    channel_created: "channel.created",
    channel_rename: "channel.updated",
    channel_archive: "channel.archived",
    channel_unarchive: "channel.updated",
};
/** Resolve a `message` event's subtype to its kind, or undefined. */
function messageKind(subtype) {
    switch (subtype) {
        case undefined:
        case "bot_message":
        case "thread_broadcast":
            return "message.created";
        case "message_changed":
            return "message.edited";
        case "message_deleted":
            return "message.deleted";
        case "channel_archive":
        case "channel_unarchive":
            return CHANNEL_KIND[subtype];
        default:
            return undefined;
    }
}
function resolveKind(inner) {
    switch (inner.type) {
        case "app_mention":
            return "app.mentioned";
        case "message":
            return messageKind(inner.subtype);
        case "reaction_added":
            return "reaction.added";
        case "reaction_removed":
            return "reaction.removed";
        case "member_joined_channel":
            return "member.joined";
        case "member_left_channel":
            return "member.left";
        case "channel_created":
        case "channel_rename":
        case "channel_archive":
        case "channel_unarchive":
            return CHANNEL_KIND[inner.type];
        default:
            return undefined;
    }
}
/** Extract the conversation (channel) id the event belongs to, if any. */
function conversationOf(inner) {
    const r = inner.raw;
    // reaction events nest the channel under item.channel
    const item = r["item"];
    if (item && typeof item === "object" && !Array.isArray(item)) {
        const ch = item["channel"];
        if (typeof ch === "string")
            return ch;
    }
    for (const key of ["channel", "channel_id"]) {
        const v = r[key];
        if (typeof v === "string")
            return v;
    }
    // channel_created/channel_rename nest the channel object
    const channel = r["channel"];
    if (channel && typeof channel === "object" && !Array.isArray(channel)) {
        const id = channel["id"];
        if (typeof id === "string")
            return id;
    }
    return undefined;
}
/** Extract the actor (user or bot) id, if any. */
function actorOf(inner) {
    const r = inner.raw;
    for (const key of ["user", "bot_id"]) {
        const v = r[key];
        if (typeof v === "string")
            return v;
    }
    // message_changed/message_deleted carry the author under message/previous_message
    for (const key of ["message", "previous_message"]) {
        const m = r[key];
        if (m && typeof m === "object" && !Array.isArray(m)) {
            const u = m["user"];
            if (typeof u === "string")
                return u;
        }
    }
    return undefined;
}
/**
 * True when the event originated from this app's own bot, so a runtime can drop
 * self-originated messages and avoid an echo/loop. We treat it as self when the
 * actor is the selected bot authorization's user id, or when a bot_message's
 * bot_id/app_id matches the selected authorization (a bot_message has no `user`,
 * so its actor is the bot_id). Returns false when no bot authorization is known.
 */
function isFromSelf(envelope, actor, botAuth) {
    if (botAuth === undefined)
        return false;
    if (actor !== undefined && actor === botAuth.user_id)
        return true;
    if (envelope.event.subtype === "bot_message") {
        const appId = envelope.event.raw["app_id"];
        if (typeof appId === "string" && appId === envelope.api_app_id)
            return true;
    }
    return false;
}
/** Extract the thread ts when the event sits in a thread. */
function threadOf(inner) {
    const v = inner.raw["thread_ts"];
    return typeof v === "string" ? v : undefined;
}
/** Extract plain text when the event carries it. */
function textOf(inner) {
    const direct = inner.raw["text"];
    if (typeof direct === "string")
        return direct;
    const m = inner.raw["message"];
    if (m && typeof m === "object" && !Array.isArray(m)) {
        const t = m["text"];
        if (typeof t === "string")
            return t;
    }
    return undefined;
}
/**
 * Convert a Slack ts ("1718755200.000200") into an ISO timestamp via the shared
 * occurredAt policy. A hostile/garbage Slack ts (real-CF chaos saw "occurred_at =
 * 7413-07-21") is a malformed-but-signed payload: it yields a DecodeFailure with
 * the offending field path, not a silently dropped timestamp. The bounds + failure
 * shape live in @gest/ingest-core (occurredAtFromEpochSeconds) so every platform
 * shares one policy.
 */
function occurredAtOf(envelope) {
    const ts = envelope.event.event_ts ?? envelope.event.ts;
    const path = ts !== undefined ? "event.event_ts" : "event_time";
    const epoch = ts !== undefined ? Number(ts.split(".")[0]) : envelope.event_time;
    return occurredAtFromEpochSeconds(epoch, path);
}
/**
 * Normalize a Slack event_callback into a NormalizedEvent.
 *
 * Three outcomes, kept distinct (see NormalizeResult):
 *  - `undefined`        -> the inner event is OUTSIDE the first supported set
 *                          (genuinely unsupported; not an error).
 *  - `DecodeFailure`    -> the event IS supported but the signed payload is
 *                          malformed (e.g. a garbage/out-of-range ts). The caller
 *                          turns this into a graceful, observable outcome.
 *  - `ok(event)`        -> the normalized event.
 *
 * The Slack-specific detail is preserved opaquely under source.slack (auth
 * context + inner event + identity).
 */
export function normalizeSlackEvent(envelope, ctx) {
    const kind = resolveKind(envelope.event);
    if (kind === undefined)
        return undefined;
    const account = scopeOf(envelope);
    const conversation = conversationOf(envelope.event) ?? account;
    const actor = actorOf(envelope.event);
    const thread = threadOf(envelope.event);
    const text = textOf(envelope.event);
    const occurred = occurredAtOf(envelope);
    if (!occurred.ok)
        return occurred;
    const occurredAt = occurred.value;
    // Self/own-app detection (docs/platforms/slack.md "app mention and self id
    // detection"). A runtime that posts and re-ingests its own output needs a
    // captured marker to drop self-originated messages without re-deriving
    // identity — otherwise bot_message normalizes to a bare message.created and
    // creates an echo/loop hazard. We resolve the app's bot from the delivery's
    // authorizations and flag fromSelf when the actor is that bot user, or when a
    // bot_message's bot_id/app_id matches the selected authorization's app.
    const botAuth = selectBotAuthorization(authContextOf(envelope));
    const selfBotUserId = botAuth?.user_id;
    const fromSelf = isFromSelf(envelope, actor, botAuth);
    const source = {
        apiAppId: envelope.api_app_id,
        eventId: envelope.event_id,
        eventType: envelope.event.type,
        ...(envelope.event.subtype === undefined ? {} : { subtype: envelope.event.subtype }),
        scope: account,
        authContext: authContextOf(envelope),
        fromSelf,
        ...(selfBotUserId === undefined ? {} : { selfBotUserId }),
        event: envelope.event.raw,
    };
    const event = {
        eventId: envelope.event_id,
        platform: "slack",
        family: familyOf(kind),
        kind,
        tenant: ctx.tenant,
        account,
        conversationId: conversation,
        receivedAt: ctx.receivedAt,
        provenance: {
            verified: ctx.verified,
            signatureKind: ctx.signatureKind,
            rawId: ctx.rawId,
            decoderVersion: SLACK_DECODER_VERSION,
            nativeKey: ctx.nativeKey,
        },
        source: { slack: source },
        ...(actor === undefined ? {} : { actorId: actor }),
        ...(thread === undefined ? {} : { threadId: thread }),
        ...(text === undefined ? {} : { text }),
        ...(occurredAt === undefined ? {} : { occurredAt }),
    };
    return ok(event);
}
//# sourceMappingURL=normalize.js.map