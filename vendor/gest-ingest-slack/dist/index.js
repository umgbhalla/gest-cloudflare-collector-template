// @gest/ingest-slack
//
// Slack platform adapter. Owns Slack's verification (raw-byte v0 HMAC, timestamp
// skew, retry header capture), native envelope decoding (Events API + Socket
// Mode), event identity/dedupe keys, authorizations + Slack Connect context,
// platform-neutral normalization, and Slack Web API effect encoding.
//
// Boundaries (gest hard rules):
// - Verifies the signature over EXACT raw bytes BEFORE parsing JSON.
// - Owns NO runtime policy: it never decides, never dispatches. It produces
//   durable records (RawDelivery, native key, NormalizedEvent) and, only when a
//   runtime explicitly asks, encodes typed effect proposals for the outbox.
// - May import @gest/ingest-core only. No provider package, no other platform
//   package, no agent runtime.
// Verification (raw bytes, signature verdict, retry headers).
export { DEFAULT_MAX_SKEW_SECONDS, SLACK_RETRY_NUM_HEADER, SLACK_RETRY_REASON_HEADER, SLACK_SIGNATURE_HEADER, SLACK_SIGNATURE_SCHEME, SLACK_TIMESTAMP_HEADER, captureRetryMeta, computeSignature, verifySlackRequest, } from "./verify.js";
// Envelope decoding (Events API + Socket Mode).
export { SOCKET_MODE_TYPES, decodeSlackAuthorization, decodeSlackEventsApiEnvelope, decodeSlackInnerEvent, decodeSocketModeEnvelope, parseEventsApiBody, } from "./envelope.js";
// Identity, dedupe keys, authorizations + Slack Connect context.
export { authContextOf, decodeSlackAuthContext, eventDedupeKey, scopeOf, selectBotAuthorization, slackMessageDedupeKey, socketCorrelation, } from "./identity.js";
// Normalization to the core's neutral event.
export { SLACK_DECODER_VERSION, normalizeSlackEvent } from "./normalize.js";
// Effect encoding (outbox effects + rate keys), runtime-requested only.
export { SLACK_EFFECT_METHODS, channelPostRateKey, encodeSlackEffect, methodRateKey, rateKeyForEffect, rateKeysForSlackEffect, } from "./effects.js";
// Uniform rich-message effect encoding: GestRichMessage -> injected renderer ->
// final native body -> EffectProposal, with a rendererVersion-bound request hash
// (replay-stable). The renderer is INJECTED; ingest-slack imports no chat-sdk.
export { SLACK_RICH_POST_METHOD, encodeSlackRichPost } from "./rich-effects.js";
// Pure effect codec (dispatch boundary): build request + parse response. I/O-free.
export { SLACK_API_BASE_URL, SLACK_DEFAULT_RETRY_AFTER_SECONDS, SLACK_EFFECT_TIMEOUT_MS, SlackEffectCodec, bearerCredential, buildSlackEffectRequest, isSlackRetryableError, parseSlackEffectResponse, } from "./effect-codec.js";
// Typed capability descriptor (effect encoders consume it; data, not policy).
export { SLACK_CAPABILITY } from "./platform-capability.js";
// End-to-end ingest entry points (HTTP + Socket Mode), storage-free.
export { ingestSlackHttp, ingestSlackSocket } from "./ingest.js";
//# sourceMappingURL=index.js.map