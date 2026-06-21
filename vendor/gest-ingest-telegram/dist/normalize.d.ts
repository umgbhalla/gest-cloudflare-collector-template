import { type NormalizedEvent, type NormalizeResult, type SignatureKind } from "@gest/ingest-core";
import { type TelegramUpdate } from "./envelope.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export declare const TELEGRAM_DECODER_VERSION = "telegram-decoder-1";
/** How a Telegram update physically arrived; recorded under source.telegram. */
export type TelegramTransport = "webhook" | "polling";
/** Inputs needed to place a Telegram event into the neutral tenant/account model. */
export interface TelegramNormalizeContext {
    /** Product tenant the bot install belongs to. */
    readonly tenant: string;
    /** Numeric bot id; the account scope and part of the dedupe identity. */
    readonly botId: string;
    /** Raw delivery id (durable source truth) this event came from. */
    readonly rawId: string;
    /**
     * True ONLY when the webhook's secret-token header was verified (the HTTP
     * webhook path). Polling updates carry NO per-message signature — they are
     * pulled over the bot's authenticated getUpdates call (transport trust), so
     * they MUST set `verified: false` with `signatureKind: "not-applicable"`.
     * Transport trust must not satisfy an "ignore unverified" runtime gate.
     */
    readonly verified: boolean;
    /** The signature verdict kind from the raw delivery, threaded onto provenance. */
    readonly signatureKind: SignatureKind;
    /** When the core received the delivery (ISO-8601). */
    readonly receivedAt: string;
    /** Native dedupe key the identity module computed. */
    readonly nativeKey: string;
    /** Which transport delivered this update. */
    readonly transport: TelegramTransport;
}
/** Normalized Telegram user metadata (a User object). */
export interface TelegramUserMeta {
    readonly id: string;
    readonly isBot?: boolean;
    readonly firstName?: string;
    readonly lastName?: string;
    readonly username?: string;
    readonly languageCode?: string;
}
/** Normalized Telegram chat metadata (a Chat object). */
export interface TelegramChatMeta {
    readonly id: string;
    /** "private" | "group" | "supergroup" | "channel". */
    readonly type?: string;
    readonly title?: string;
    readonly username?: string;
    /** True when this is a forum supergroup (topics enabled). */
    readonly isForum?: boolean;
}
/** Normalized Telegram message metadata (a Message object subset). */
export interface TelegramMessageMeta {
    readonly id: string;
    readonly chat?: TelegramChatMeta;
    readonly from?: TelegramUserMeta;
    readonly date?: number;
    readonly text?: string;
    /** Forum topic thread id when the message sits in a forum topic. */
    readonly threadId?: string;
    readonly editDate?: number;
}
/** Normalized Telegram callback-query metadata (an inline-button press). */
export interface TelegramCallbackMeta {
    readonly id: string;
    readonly from?: TelegramUserMeta;
    readonly data?: string;
    readonly chatInstance?: string;
    /** The message the inline keyboard was attached to, when present. */
    readonly message?: TelegramMessageMeta;
}
/** Normalized Telegram inline-query metadata. */
export interface TelegramInlineQueryMeta {
    readonly id: string;
    readonly from?: TelegramUserMeta;
    readonly query?: string;
    readonly offset?: string;
}
/** Normalized Telegram chat-member-update metadata (membership transition). */
export interface TelegramMembershipMeta {
    readonly chat?: TelegramChatMeta;
    readonly from?: TelegramUserMeta;
    readonly oldStatus?: string;
    readonly newStatus?: string;
    /**
     * `is_member` of the old/new ChatMember when present. A "restricted" or "left"
     * member object carries this boolean; a false value means the user is not in
     * the chat regardless of the status string.
     */
    readonly oldIsMember?: boolean;
    readonly newIsMember?: boolean;
    /** The user whose membership changed. */
    readonly subject?: TelegramUserMeta;
    readonly date?: number;
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
export declare function normalizeTelegramUpdate(update: TelegramUpdate, ctx: TelegramNormalizeContext): NormalizeResult<NormalizedEvent> | undefined;
//# sourceMappingURL=normalize.d.ts.map