import { type EffectProposal, type HashFn, type Json } from "@gest/ingest-core";
/** The closed set of Telegram effects this adapter can encode. */
export declare const TELEGRAM_EFFECT_METHODS: readonly ["sendMessage", "editMessageText", "answerCallbackQuery", "sendChatAction", "pinChatMessage", "unpinChatMessage"];
export type TelegramEffectMethod = (typeof TELEGRAM_EFFECT_METHODS)[number];
/** Effects that require the bot to be a chat admin (runtime must gate these). */
export declare const ADMIN_GATED_METHODS: Set<"sendMessage" | "editMessageText" | "answerCallbackQuery" | "sendChatAction" | "pinChatMessage" | "unpinChatMessage">;
/** Common context every effect needs to be addressable and rate-keyed. */
export interface TelegramEffectContext {
    /** Numeric bot id the effect is sent as; part of every rate bucket. */
    readonly botId: string;
    /**
     * Caller-stable idempotency seed. Same intent + same seed => same key, so
     * at-least-once dispatch never double-sends. Usually the causing decision id.
     */
    readonly idempotencySeed: string;
    /** Stable hash function (e.g. @gest/ingest-local hashJson). */
    readonly hash: HashFn;
    /**
     * Opaque credential/install pointer the dispatcher resolves to a bot token via
     * an injected capability (NEVER a raw token). Defaults to `telegram:bot:{botId}`.
     */
    readonly credentialRef?: string;
}
/** Post a message to a chat (optionally into a forum topic / as a reply). */
export interface SendMessageIntent {
    readonly method: "sendMessage";
    readonly chatId: string;
    readonly text: string;
    /** Forum topic thread id to post into, when targeting a topic. */
    readonly messageThreadId?: string;
    /** Id of a message to reply to, when threading a reply. */
    readonly replyToMessageId?: string;
    /** Opaque extra params (parse_mode, reply_markup, ...), passed through. */
    readonly extra?: Json;
}
/** Edit the text of an existing message the bot can edit. */
export interface EditMessageTextIntent {
    readonly method: "editMessageText";
    readonly chatId: string;
    readonly messageId: string;
    readonly text: string;
    readonly extra?: Json;
}
/** Answer an inline-button callback query (ack, optional toast/alert). */
export interface AnswerCallbackQueryIntent {
    readonly method: "answerCallbackQuery";
    readonly callbackQueryId: string;
    /** Optional toast/alert text shown to the user. */
    readonly text?: string;
    /** When true, show as a modal alert rather than a toast. */
    readonly showAlert?: boolean;
    readonly extra?: Json;
}
/** Send a chat action (typing, upload_photo, ...) to a chat. */
export interface SendChatActionIntent {
    readonly method: "sendChatAction";
    readonly chatId: string;
    /** e.g. "typing", "upload_photo", "record_voice". */
    readonly action: string;
    readonly messageThreadId?: string;
}
/** Pin a message in a chat (admin-gated). */
export interface PinChatMessageIntent {
    readonly method: "pinChatMessage";
    readonly chatId: string;
    readonly messageId: string;
    /** When true, do not notify members of the pin. */
    readonly disableNotification?: boolean;
}
/** Unpin a specific message, or the most recent pin when messageId is omitted. */
export interface UnpinChatMessageIntent {
    readonly method: "unpinChatMessage";
    readonly chatId: string;
    readonly messageId?: string;
}
export type TelegramEffectIntent = SendMessageIntent | EditMessageTextIntent | AnswerCallbackQueryIntent | SendChatActionIntent | PinChatMessageIntent | UnpinChatMessageIntent;
/**
 * Rate key for a Telegram effect. Chat-bound methods bucket per chat (Telegram
 * throttles per chat); answerCallbackQuery has no chat in the intent, so it
 * buckets per callback query id (each callback is answered at most once anyway):
 *   telegram:{bot_id}:{method}:{chat_or_callback}
 */
export declare function rateKeyForEffect(botId: string, intent: TelegramEffectIntent): string;
/**
 * Encode an explicit, runtime-requested Telegram effect into an EffectProposal.
 * The idempotency key binds the method + request body + seed, so retries of the
 * same intent collapse while a different intent gets a distinct key. The proposal
 * is NOT dispatched here; the runtime feeds it to the core's outbox.
 *
 * `adminGated` is surfaced (not enforced) so an outbox worker can fail a pin/unpin
 * with a clean permission verdict instead of a generic error when the bot is not
 * an admin. The runtime still owns the decision to request the effect.
 */
export declare function encodeTelegramEffect(intent: TelegramEffectIntent, ctx: TelegramEffectContext): EffectProposal;
/** True when an effect method requires the bot to be a chat admin. */
export declare function isAdminGated(method: TelegramEffectMethod): boolean;
//# sourceMappingURL=effects.d.ts.map