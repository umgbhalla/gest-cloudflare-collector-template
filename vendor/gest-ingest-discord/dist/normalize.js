// @gest/ingest-discord / normalize
//
// Map a verified Discord interaction (HTTP) or a decoded gateway event into the
// core's platform-neutral NormalizedEvent. The mapping is deterministic and total
// over the first supported set: a Discord input yields at most one normalized
// event with a closed family/kind, plus an opaque source.discord payload carrying
// the Discord-specific detail (guild/channel/thread/user/member/message/reaction/
// command/interaction metadata). Inputs we do not map yield `undefined` (the
// caller records the raw + dedupe but emits no normalized event), never a guess.
//
// No Discord field is promoted to the top level; everything Discord-specific
// lives under source.discord, which the core treats as opaque JSON.
import { familyOf, isJsonObject, occurredAtFromIso, ok, strOf, } from "@gest/ingest-core";
import {} from "./envelope.js";
import { gatewayScopeOf } from "./identity.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export const DISCORD_DECODER_VERSION = "discord-decoder-1";
/** Thread channel type codes (announcement/public/private threads). */
const THREAD_TYPES = new Set([10, 11, 12]);
function userMetaOf(value) {
    if (!isJsonObject(value))
        return undefined;
    const id = strOf(value["id"]);
    if (id === undefined)
        return undefined;
    const username = strOf(value["username"]);
    const globalName = strOf(value["global_name"]);
    return {
        id,
        ...(username === undefined ? {} : { username }),
        ...(globalName === undefined ? {} : { globalName }),
        ...(typeof value["bot"] === "boolean" ? { bot: value["bot"] } : {}),
    };
}
function memberMetaOf(value) {
    if (!isJsonObject(value))
        return undefined;
    const user = userMetaOf(value["user"]);
    const roles = Array.isArray(value["roles"])
        ? value["roles"].filter((r) => typeof r === "string")
        : undefined;
    const nick = strOf(value["nick"]);
    const joinedAt = strOf(value["joined_at"]);
    const meta = {
        ...(user === undefined ? {} : { user }),
        ...(nick === undefined ? {} : { nick }),
        ...(roles === undefined || roles.length === 0 ? {} : { roles }),
        ...(joinedAt === undefined ? {} : { joinedAt }),
    };
    return meta;
}
function channelMetaOf(value) {
    if (!isJsonObject(value))
        return undefined;
    const id = strOf(value["id"]);
    if (id === undefined)
        return undefined;
    const type = typeof value["type"] === "number" ? value["type"] : undefined;
    const name = strOf(value["name"]);
    const parentId = strOf(value["parent_id"]);
    return {
        id,
        isThread: type !== undefined && THREAD_TYPES.has(type),
        ...(type === undefined ? {} : { type }),
        ...(name === undefined ? {} : { name }),
        ...(parentId === undefined ? {} : { parentId }),
    };
}
function messageMetaOf(value) {
    if (!isJsonObject(value))
        return undefined;
    const id = strOf(value["id"]);
    if (id === undefined)
        return undefined;
    const channelId = strOf(value["channel_id"]);
    const author = userMetaOf(value["author"]);
    return {
        id,
        ...(channelId === undefined ? {} : { channelId }),
        ...(typeof value["content"] === "string" ? { content: value["content"] } : {}),
        ...(author === undefined ? {} : { author }),
    };
}
// ---------------------------------------------------------------------------
// HTTP interaction normalization.
//
// All non-PING interaction types map to the neutral app.interactive kind. The
// neutral layer stays small on purpose; the rich interaction shape (command name,
// component custom_id, modal fields, autocomplete focus) lives under
// source.discord for the runtime to branch on.
// ---------------------------------------------------------------------------
/** Command/component/modal/autocomplete detail surfaced under source.discord. */
function interactionDetailOf(interaction) {
    const raw = interaction.raw;
    const data = isJsonObject(raw["data"]) ? raw["data"] : undefined;
    const detail = {
        interactionType: interaction.type,
        interactionTypeName: interaction.typeName,
    };
    if (data !== undefined) {
        // application_command + autocomplete carry a command name/id/type.
        if (strOf(data["name"]) !== undefined)
            detail["commandName"] = strOf(data["name"]);
        if (strOf(data["id"]) !== undefined)
            detail["commandId"] = strOf(data["id"]);
        if (typeof data["type"] === "number")
            detail["commandType"] = data["type"];
        // message_component carries a custom_id + component_type.
        if (strOf(data["custom_id"]) !== undefined)
            detail["customId"] = strOf(data["custom_id"]);
        if (typeof data["component_type"] === "number")
            detail["componentType"] = data["component_type"];
        // options (command args + autocomplete focus) and components (modal fields).
        if (Array.isArray(data["options"]))
            detail["options"] = data["options"];
        if (Array.isArray(data["components"]))
            detail["components"] = data["components"];
        if (Array.isArray(data["values"]))
            detail["values"] = data["values"];
        detail["data"] = data;
    }
    return detail;
}
/** Best-effort actor (the invoking user) for an interaction. */
function interactionActorOf(interaction) {
    const raw = interaction.raw;
    // Guild interactions nest the user under member.user; DM interactions use user.
    const member = memberMetaOf(raw["member"]);
    if (member?.user !== undefined)
        return member.user;
    return userMetaOf(raw["user"]);
}
/**
 * Normalize a verified Discord interaction into a NormalizedEvent, or undefined
 * for PING (the caller answers the handshake; it is not a runtime event). All
 * other interaction types map to app.interactive with the full native detail
 * under source.discord.
 */
export function normalizeDiscordInteraction(interaction, ctx) {
    if (interaction.typeName === "ping")
        return undefined;
    const kind = "app.interactive";
    const family = familyOf(kind);
    const account = interaction.guildId ?? interaction.applicationId;
    const conversation = interaction.channelId ?? account;
    const actor = interactionActorOf(interaction);
    const source = {
        transport: "http",
        applicationId: interaction.applicationId,
        interactionId: interaction.id,
        ...(interaction.guildId === undefined ? {} : { guildId: interaction.guildId }),
        ...(interaction.channelId === undefined ? {} : { channelId: interaction.channelId }),
        ...(actor === undefined ? {} : { user: actor }),
        ...(memberMetaOf(interaction.raw["member"]) === undefined
            ? {}
            : { member: memberMetaOf(interaction.raw["member"]) }),
        interaction: interactionDetailOf(interaction),
    };
    const event = {
        eventId: interaction.id,
        platform: "discord",
        family,
        kind,
        tenant: ctx.tenant,
        account,
        conversationId: conversation,
        receivedAt: ctx.receivedAt,
        provenance: {
            verified: ctx.verified,
            signatureKind: ctx.signatureKind,
            rawId: ctx.rawId,
            decoderVersion: DISCORD_DECODER_VERSION,
            nativeKey: ctx.nativeKey,
        },
        source: { discord: source },
        ...(actor === undefined ? {} : { actorId: actor.id }),
    };
    return ok(event);
}
/** Resolve the closed family/kind for a gateway event type, or undefined. */
function mapGatewayKind(eventType) {
    const kind = gatewayKind(eventType);
    return kind === undefined ? undefined : { kind, family: familyOf(kind) };
}
function gatewayKind(eventType) {
    switch (eventType) {
        case "MESSAGE_CREATE":
            return "message.created";
        case "MESSAGE_UPDATE":
            return "message.edited";
        case "MESSAGE_DELETE":
            return "message.deleted";
        case "MESSAGE_REACTION_ADD":
            return "reaction.added";
        case "MESSAGE_REACTION_REMOVE":
            return "reaction.removed";
        case "GUILD_MEMBER_ADD":
            return "member.joined";
        case "GUILD_MEMBER_REMOVE":
            return "member.left";
        case "GUILD_MEMBER_UPDATE":
            return "member.updated";
        case "CHANNEL_CREATE":
            return "channel.created";
        case "CHANNEL_UPDATE":
            return "channel.updated";
        case "THREAD_CREATE":
            return "thread.created";
        case "THREAD_UPDATE":
            return "thread.updated";
        default:
            return undefined;
    }
}
/**
 * Normalize a decoded gateway event envelope into a NormalizedEvent.
 *
 * Three outcomes, kept distinct (see NormalizeResult):
 *  - `undefined`     -> the event type is outside the first supported set
 *                       (genuinely unsupported; not an error).
 *  - `DecodeFailure` -> a supported but malformed-but-signed event whose native
 *                       message `timestamp` is a garbage/out-of-range ISO ts.
 *  - `ok(event)`     -> the normalized event.
 *
 * The session/shard/sequence/resume context and the native object metadata are
 * preserved opaquely under source.discord.
 */
export function normalizeDiscordGatewayEvent(envelope, ctx) {
    const mapping = mapGatewayKind(envelope.eventType);
    if (mapping === undefined)
        return undefined;
    const account = envelope.guildId ?? envelope.applicationId;
    const data = envelope.data;
    const conversation = strOf(data["channel_id"]) ?? gatewayScopeOf(envelope);
    // Occurrence time: a message carries an ISO `timestamp` (and `edited_timestamp`
    // on edits). Validate it through the shared occurredAt policy so a signed event
    // with a garbage/far-future ts surfaces as a DecodeFailure, not a silent drop.
    const tsField = mapping.kind === "message.edited" ? "edited_timestamp" : "timestamp";
    const occurred = occurredAtFromIso(strOf(data[tsField]), `data.${tsField}`);
    if (!occurred.ok)
        return occurred;
    const occurredAt = occurred.value;
    const message = mapping.family === "message" ? messageMetaOf(data) : undefined;
    const reaction = mapping.family === "reaction" ? reactionMetaOf(data) : undefined;
    const channel = mapping.family === "channel" || mapping.family === "thread"
        ? channelMetaOf(data)
        : undefined;
    const member = memberMetaOf(data) ?? (isJsonObject(data["member"]) ? memberMetaOf(data["member"]) : undefined);
    const actor = userMetaOf(data["author"]) ?? userMetaOf(data["user"]) ?? member?.user;
    const text = typeof data["content"] === "string" ? data["content"] : undefined;
    const thread = strOf((isJsonObject(data["thread"]) ? data["thread"]["id"] : undefined))
        ?? (channel?.isThread ? channel.id : undefined);
    // For reactions the acting user is the scalar `user_id` (no author/user object,
    // and member is absent for DM reactions), so fold it into the neutral actorId.
    const actorId = reaction?.userId ?? actor?.id;
    const source = {
        transport: "gateway",
        applicationId: envelope.applicationId,
        sessionId: envelope.sessionId,
        shardId: envelope.shardId,
        shardCount: envelope.shardCount,
        sequence: envelope.sequence,
        eventType: envelope.eventType,
        resume: envelope.resume,
        ...(envelope.guildId === undefined ? {} : { guildId: envelope.guildId }),
        ...(message === undefined ? {} : { message: message }),
        ...(reaction === undefined ? {} : { reaction: reaction }),
        ...(channel === undefined ? {} : { channel: channel }),
        ...(member === undefined ? {} : { member: member }),
        data,
    };
    const event = {
        eventId: gatewayEventId(envelope),
        platform: "discord",
        family: mapping.family,
        kind: mapping.kind,
        tenant: ctx.tenant,
        account,
        conversationId: conversation,
        receivedAt: ctx.receivedAt,
        provenance: {
            verified: ctx.verified,
            signatureKind: ctx.signatureKind,
            rawId: ctx.rawId,
            decoderVersion: DISCORD_DECODER_VERSION,
            nativeKey: ctx.nativeKey,
        },
        source: { discord: source },
        ...(actorId === undefined ? {} : { actorId }),
        ...(thread === undefined ? {} : { threadId: thread }),
        ...(text === undefined ? {} : { text }),
        ...(occurredAt === undefined ? {} : { occurredAt }),
    };
    return ok(event);
}
function reactionMetaOf(data) {
    const messageId = strOf(data["message_id"]);
    if (messageId === undefined)
        return undefined;
    let emoji;
    if (isJsonObject(data["emoji"])) {
        const emojiId = strOf(data["emoji"]["id"]);
        const emojiName = strOf(data["emoji"]["name"]);
        emoji = {
            ...(emojiId === undefined ? {} : { id: emojiId }),
            ...(emojiName === undefined ? {} : { name: emojiName }),
        };
    }
    const channelId = strOf(data["channel_id"]);
    const userId = strOf(data["user_id"]);
    return {
        messageId,
        ...(channelId === undefined ? {} : { channelId }),
        ...(userId === undefined ? {} : { userId }),
        ...(emoji === undefined ? {} : { emoji }),
    };
}
/**
 * Stable event id for a gateway event. Discord objects (message/member) carry
 * native ids, but not every event type does; the deterministic, collision-free id
 * is the session + sequence pair, which the dedupe key also keys on.
 */
function gatewayEventId(envelope) {
    return `${envelope.sessionId}:${envelope.sequence}`;
}
//# sourceMappingURL=normalize.js.map