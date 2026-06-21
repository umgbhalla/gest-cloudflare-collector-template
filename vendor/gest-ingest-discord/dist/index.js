// @gest/ingest-discord
//
// Discord platform adapter. Owns Discord's verification (raw-byte Ed25519 over
// timestamp+body, optional skew), native envelope decoding (HTTP interactions now;
// gateway event envelope CONTRACTS for a later long-running runner), event
// identity/dedupe keys, platform-neutral normalization, and Discord API effect
// encoding.
//
// Boundaries (gest hard rules):
// - Verifies the signature over EXACT raw bytes BEFORE parsing JSON.
// - Owns NO runtime policy: it never decides, never dispatches. It produces
//   durable records (RawDelivery, native key, NormalizedEvent) and, only when a
//   runtime explicitly asks, encodes typed effect proposals for the outbox.
// - May import @gest/ingest-core only. No provider package, no other platform
//   package, no agent runtime.
// Verification (raw bytes, Ed25519 verdict, timestamp binding).
export { DISCORD_SIGNATURE_HEADER, DISCORD_SIGNATURE_SCHEME, DISCORD_TIMESTAMP_HEADER, bindTimestamp, hasDiscordSignatureHeaders, verifyDiscordRequest, } from "./verify.js";
// Envelope decoding (HTTP interactions + gateway event contracts).
export { GATEWAY_OPCODES, INTERACTION_TYPES, decodeDiscordInteraction, decodeGatewayFrame, gatewayEnvelopeOf, interactionTypeName, parseInteractionBody, } from "./envelope.js";
// Identity, dedupe keys.
export { gatewayDedupeKey, gatewayScopeOf, interactionDedupeKey, } from "./identity.js";
// Normalization to the core's neutral event.
export { DISCORD_DECODER_VERSION, normalizeDiscordGatewayEvent, normalizeDiscordInteraction, } from "./normalize.js";
// Effect encoding (outbox effects + rate keys), runtime-requested only.
export { CALLBACK_TYPES, DISCORD_EFFECT_METHODS, channelRateKey, encodeDiscordEffect, interactionRateKey, rateKeyForEffect, } from "./effects.js";
// Typed capability descriptor (effect encoders consume it; data, not policy).
export { DISCORD_CAPABILITY } from "./platform-capability.js";
// End-to-end ingest entry points (HTTP interactions + gateway), storage-free.
export { ingestDiscordGateway, ingestDiscordHttp } from "./ingest.js";
// Pure gateway state machine (injectable-socket; no socket/clock/storage).
export { DISCORD_DEFAULT_INTENTS, DISCORD_V1_SHARD, FATAL_CLOSE_CODES, FRESH_SESSION_CLOSE_CODES, RESUMABLE_CLOSE_CODES, initialSessionState, onClose, onConnect, onFrame, onTick, } from "./gateway-runner.js";
//# sourceMappingURL=index.js.map