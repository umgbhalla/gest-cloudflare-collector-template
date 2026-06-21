import { type NormalizedEvent, type NormalizeResult, type SignatureKind } from "@gest/ingest-core";
import { type DiscordInteraction, type GatewayEventEnvelope } from "./envelope.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export declare const DISCORD_DECODER_VERSION = "discord-decoder-1";
/** Inputs needed to place a Discord event into the neutral tenant/account model. */
export interface DiscordNormalizeContext {
    /** Product tenant the install belongs to. */
    readonly tenant: string;
    /** Raw delivery id (durable source truth) this event came from. */
    readonly rawId: string;
    /**
     * True ONLY when the raw delivery's Ed25519 signature was cryptographically
     * verified (the HTTP interaction path). Gateway frames carry NO per-frame
     * signature (the websocket is authenticated at IDENTIFY time), so they MUST set
     * `verified: false` with `signatureKind: "not-applicable"`. Connect-time
     * transport trust is not signature verification and must not satisfy an "ignore
     * unverified" runtime gate.
     */
    readonly verified: boolean;
    /** The signature verdict kind from the raw delivery, threaded onto provenance. */
    readonly signatureKind: SignatureKind;
    /** When the core received the delivery (ISO-8601). */
    readonly receivedAt: string;
    /** Native dedupe key the identity module computed. */
    readonly nativeKey: string;
}
/** Normalized Discord user metadata. */
export interface DiscordUserMeta {
    readonly id: string;
    readonly username?: string;
    readonly globalName?: string;
    readonly bot?: boolean;
}
/** Normalized Discord guild member metadata (a user within a guild). */
export interface DiscordMemberMeta {
    readonly user?: DiscordUserMeta;
    readonly nick?: string;
    readonly roles?: readonly string[];
    readonly joinedAt?: string;
}
/** Normalized Discord channel/thread metadata. */
export interface DiscordChannelMeta {
    readonly id: string;
    readonly type?: number;
    readonly name?: string;
    readonly parentId?: string;
    /** True when the channel type is a thread (10/11/12). */
    readonly isThread: boolean;
}
/** Normalized Discord message metadata. */
export interface DiscordMessageMeta {
    readonly id: string;
    readonly channelId?: string;
    readonly content?: string;
    readonly author?: DiscordUserMeta;
}
/** Normalized Discord reaction metadata. */
export interface DiscordReactionMeta {
    readonly messageId: string;
    readonly channelId?: string;
    readonly userId?: string;
    readonly emoji?: {
        readonly id?: string;
        readonly name?: string;
    };
}
/**
 * Normalize a verified Discord interaction into a NormalizedEvent, or undefined
 * for PING (the caller answers the handshake; it is not a runtime event). All
 * other interaction types map to app.interactive with the full native detail
 * under source.discord.
 */
export declare function normalizeDiscordInteraction(interaction: DiscordInteraction, ctx: DiscordNormalizeContext): NormalizeResult<NormalizedEvent> | undefined;
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
export declare function normalizeDiscordGatewayEvent(envelope: GatewayEventEnvelope, ctx: DiscordNormalizeContext): NormalizeResult<NormalizedEvent> | undefined;
//# sourceMappingURL=normalize.d.ts.map