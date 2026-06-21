// @gest/ingest-telegram
//
// Telegram Bot API platform adapter. Owns Telegram's webhook authentication
// (secret-token header, constant-time compare), native envelope decoding (the
// Update object, over webhook AND polling transports), event identity/dedupe
// keys (bot id + update id), platform-neutral normalization, and Telegram API
// effect encoding.
//
// Boundaries (gest hard rules):
// - Authenticates the webhook secret-token header BEFORE parsing the body.
// - Owns NO runtime policy: it never decides, never dispatches. It produces
//   durable records (RawDelivery, native key, NormalizedEvent) and, only when a
//   runtime explicitly asks, encodes typed effect proposals for the outbox.
// - Keeps limited history visibility explicit: it normalizes only delivered
//   updates and never synthesizes Slack-like history backfill.
// - May import @gest/ingest-core only. No provider package, no other platform
//   package, no agent runtime.
// Webhook authentication (secret-token verdict) + polling signature verdict.
export { TELEGRAM_SECRET_HEADER, TELEGRAM_SIGNATURE_SCHEME, hasTelegramSecretHeader, pollingSignature, verifyTelegramWebhook, } from "./verify.js";
// Envelope decoding (Update object; webhook body + polling response).
export { UPDATE_CONTENT_FIELDS, decodeTelegramPollingResponse, decodeTelegramUpdate, parsePollingResponse, parseWebhookUpdate, } from "./envelope.js";
// Identity, dedupe keys.
export { updateDedupeKey } from "./identity.js";
// Normalization to the core's neutral event.
export { TELEGRAM_DECODER_VERSION, normalizeTelegramUpdate, } from "./normalize.js";
// Effect encoding (outbox effects + rate keys), runtime-requested only.
export { ADMIN_GATED_METHODS, TELEGRAM_EFFECT_METHODS, encodeTelegramEffect, isAdminGated, rateKeyForEffect, } from "./effects.js";
// Typed capability descriptor (effect encoders consume it; data, not policy).
export { TELEGRAM_CAPABILITY } from "./platform-capability.js";
// End-to-end ingest entry points (webhook + polling), storage-free.
export { ingestTelegramPolling, ingestTelegramWebhook, } from "./ingest.js";
//# sourceMappingURL=index.js.map