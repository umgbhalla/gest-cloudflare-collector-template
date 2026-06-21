// @gest/ingest-telegram / effects
//
// Telegram outbox effect encoding. A runtime consumer composes effect intents;
// this module turns an explicit, runtime-requested intent into a typed
// EffectProposal the core records in the outbox (the ONLY side-effect path). Hard
// rule: effects are encoded ONLY when the runtime explicitly requests them. This
// module never invents an effect from an inbound update; it just shapes what the
// runtime asked for into the core contract, with stable idempotency keys and
// platform rate keys.
//
// Supported effects (and ONLY these — the safe, well-understood Bot API methods):
//   - sendMessage          (post a message to a chat / forum topic)
//   - editMessageText      (edit the text of a message the bot can edit)
//   - answerCallbackQuery  (ack/notify an inline-button press)
//   - sendChatAction       (typing/upload status indicator)
//   - pinChatMessage       (pin, guarded: requires admin; runtime owns the check)
//   - unpinChatMessage     (unpin a specific message or the most recent)
//
// pin/unpin are included because they are recoverable and idempotent in effect,
// but they require the bot to be an admin. This encoder does NOT assert admin
// status (it cannot know it); the runtime owns that decision. We mark them so an
// outbox worker can surface a permission_denied cleanly instead of guessing.
//
// Rate keys are explicit and platform-owned (gest hard rule). Telegram rate-limits
// per chat for sends (~1 msg/sec/chat, ~30 msg/sec global, bursts to groups
// limited to ~20/min). We bucket per bot + method + chat so a worker can throttle
// per chat; the global ceiling is the worker's concern, not the encoder's.
import { isJsonObject } from "@gest/ingest-core";
/** The closed set of Telegram effects this adapter can encode. */
export const TELEGRAM_EFFECT_METHODS = [
    "sendMessage",
    "editMessageText",
    "answerCallbackQuery",
    "sendChatAction",
    "pinChatMessage",
    "unpinChatMessage",
];
/** Effects that require the bot to be a chat admin (runtime must gate these). */
export const ADMIN_GATED_METHODS = new Set([
    "pinChatMessage",
    "unpinChatMessage",
]);
/**
 * Rate key for a Telegram effect. Chat-bound methods bucket per chat (Telegram
 * throttles per chat); answerCallbackQuery has no chat in the intent, so it
 * buckets per callback query id (each callback is answered at most once anyway):
 *   telegram:{bot_id}:{method}:{chat_or_callback}
 */
export function rateKeyForEffect(botId, intent) {
    const target = intent.method === "answerCallbackQuery" ? intent.callbackQueryId : intent.chatId;
    return `telegram:${botId}:${intent.method}:${target}`;
}
/** The destination an effect targets (chat id, or the callback query id). */
function destinationOf(intent) {
    return intent.method === "answerCallbackQuery" ? intent.callbackQueryId : intent.chatId;
}
/**
 * Spread opaque pass-through params as REAL top-level Bot API fields. Telegram's
 * methods have no `extra` parameter, so the bag must be merged at the top level
 * (parse_mode, reply_markup, entities, link_preview_options, ...). Non-object
 * extra (primitive/array/null) is dropped rather than nested. Explicit named
 * params always win on collision (they are spread AFTER the bag).
 */
const spreadExtra = (extra) => extra !== undefined && isJsonObject(extra) ? extra : {};
/** Build the typed Telegram request body for an intent (opaque to the core). */
function requestBodyOf(intent) {
    switch (intent.method) {
        case "sendMessage":
            return {
                ...spreadExtra(intent.extra),
                chat_id: intent.chatId,
                text: intent.text,
                ...(intent.messageThreadId === undefined
                    ? {}
                    : { message_thread_id: intent.messageThreadId }),
                ...(intent.replyToMessageId === undefined
                    ? {}
                    : { reply_to_message_id: intent.replyToMessageId }),
            };
        case "editMessageText":
            return {
                ...spreadExtra(intent.extra),
                chat_id: intent.chatId,
                message_id: intent.messageId,
                text: intent.text,
            };
        case "answerCallbackQuery":
            return {
                ...spreadExtra(intent.extra),
                callback_query_id: intent.callbackQueryId,
                ...(intent.text === undefined ? {} : { text: intent.text }),
                ...(intent.showAlert === undefined ? {} : { show_alert: intent.showAlert }),
            };
        case "sendChatAction":
            return {
                chat_id: intent.chatId,
                action: intent.action,
                ...(intent.messageThreadId === undefined
                    ? {}
                    : { message_thread_id: intent.messageThreadId }),
            };
        case "pinChatMessage":
            return {
                chat_id: intent.chatId,
                message_id: intent.messageId,
                ...(intent.disableNotification === undefined
                    ? {}
                    : { disable_notification: intent.disableNotification }),
            };
        case "unpinChatMessage":
            return {
                chat_id: intent.chatId,
                ...(intent.messageId === undefined ? {} : { message_id: intent.messageId }),
            };
    }
}
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
export function encodeTelegramEffect(intent, ctx) {
    const requestBody = requestBodyOf(intent);
    const requestHash = ctx.hash(requestBody);
    const idempotencyKey = ctx.hash({
        seed: ctx.idempotencySeed,
        method: intent.method,
        destination: destinationOf(intent),
        requestHash,
    });
    const rateKey = rateKeyForEffect(ctx.botId, intent);
    const proposal = {
        platform: "telegram",
        method: intent.method,
        destination: destinationOf(intent),
        idempotencyKey,
        rateKey,
        rateKeys: [rateKey],
        credentialRef: ctx.credentialRef ?? `telegram:bot:${ctx.botId}`,
        requestHash,
        requestBody,
    };
    return proposal;
}
/** True when an effect method requires the bot to be a chat admin. */
export function isAdminGated(method) {
    return ADMIN_GATED_METHODS.has(method);
}
//# sourceMappingURL=effects.js.map