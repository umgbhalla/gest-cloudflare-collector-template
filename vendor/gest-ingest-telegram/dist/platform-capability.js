// @gest/ingest-telegram / platform capability descriptor
//
// The typed capability descriptor for Telegram's Bot API messaging surface. Pure
// DATA an effect encoder reads to split/escape outbound text. CRITICAL (gest
// research): Telegram limits a message to 4096 characters measured in UTF-16 code
// UNITS — an emoji costs 2 — so an encoder must measure with that unit, not
// `Array.from(text).length`. Telegram uses MarkdownV2 (aggressive escaping).
// Webhook auth is a secret-token header over exact transport bytes
// (verify-then-decode), so no envelope decode step is involved.
/** Telegram's capability descriptor. */
export const TELEGRAM_CAPABILITY = {
    platform: "telegram",
    supportsCodeBlocks: true,
    // Forum topics + reply threading.
    supportsThreading: true,
    supportsEdits: true,
    supportsReactions: true,
    // Telegram has no per-user-ephemeral message; answerCallbackQuery toasts are not
    // a persisted ephemeral message.
    supportsEphemeral: false,
    maxTextLength: 4_096,
    lengthUnit: "utf16-code-units",
    markdownFlavor: "markdown-v2",
    media: [
        { kind: "image" },
        { kind: "video" },
        { kind: "audio" },
        { kind: "file" },
    ],
};
//# sourceMappingURL=platform-capability.js.map