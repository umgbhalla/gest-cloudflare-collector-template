// @gest/ingest-telegram / identity
//
// Event identity and dedupe keying. The core never derives a native key (that is
// a platform concern); this module owns the Telegram key rule and exposes it as a
// string the core's dedupe store claims.
//
// One key rule (per docs/platforms/telegram.md), shared by BOTH transports:
//
//   telegram:update:{bot_id}:{update_id}
//
// Telegram guarantees update_id is monotonically increasing and unique per bot.
// A webhook that times out is re-POSTed with the SAME update_id; a getUpdates
// call that is not acknowledged (no `offset` advance) re-returns the SAME
// update_id. Folding bot id + update_id therefore collapses BOTH a webhook
// redelivery AND a polling re-fetch to a single claim, while distinct updates
// never collide. The transport is deliberately NOT part of the key: the same
// update seen once via webhook and once via polling must dedupe to one event.
/**
 * Native dedupe key for a Telegram update:
 *   telegram:update:{bot_id}:{update_id}
 *
 * `botId` is the numeric bot id (the integer prefix of the bot token, or the
 * id from getMe). The provider/runner supplies it; Telegram does not put it in
 * the Update body, so the caller must pass the bot identity explicitly.
 */
export function updateDedupeKey(botId, update) {
    return `telegram:update:${botId}:${update.updateId}`;
}
//# sourceMappingURL=identity.js.map