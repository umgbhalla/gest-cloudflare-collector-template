import type { TelegramUpdate } from "./envelope.js";
/**
 * Native dedupe key for a Telegram update:
 *   telegram:update:{bot_id}:{update_id}
 *
 * `botId` is the numeric bot id (the integer prefix of the bot token, or the
 * id from getMe). The provider/runner supplies it; Telegram does not put it in
 * the Update body, so the caller must pass the bot identity explicitly.
 */
export declare function updateDedupeKey(botId: string, update: TelegramUpdate): string;
//# sourceMappingURL=identity.d.ts.map