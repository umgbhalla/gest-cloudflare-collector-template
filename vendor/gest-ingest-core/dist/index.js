// @gest/ingest-core
//
// Provider-neutral durability, dedupe, outbox, and replay contracts.
//
// Invariants this package keeps (see docs/implementation-contract.md and
// docs/specs/api-contracts.md):
// - Owns neutral contracts only: raw capture, dedupe, queue, lane lease,
//   journal, outbox, replay, provider metadata, runtime-consumer boundary, and
//   error taxonomy.
// - Must not import any platform package (slack/discord/telegram/github), any
//   provider package (cloudflare/vercel/lambda/convex), or any agent runtime
//   (ep-effect/AxAgent/Claude/OpenAI/etc.). The only imports are relative
//   modules within this package and Node/TS built-ins.
// - Every public boundary record has a runtime decoder. No untyped protocol JSON
//   crosses a package boundary: callers decode unknown input into these typed
//   records (or a structured DecodeFailure) at the edge.
// JSON value model (the only opaque cross-boundary value) + canonical readers
// every platform adapter uses to pull optional typed fields out of opaque JSON.
export { asJson, boolOf, canonicalJson, idOf, isJsonNumber, isJsonObject, numOf, objOf, pick, strOf, } from "./json.js";
export { hashBytes, hashJson, hashString } from "./hash.js";
// Decoder toolkit.
export { decodeArray, decodeBoolean, decodeEnum, decodeIsoTimestamp, decodeJsonBody, decodeNonEmptyString, decodeNonEmptyStringArray, decodeNonNegativeInt, decodeNumber, decodeObject, decodeRecord, decodeString, decodeTagged, fail, failMany, field, normalizedEventOf, occurredAtFromEpochSeconds, occurredAtFromIso, ok, optionalField, MAX_OCCURRED_EPOCH_SECONDS, MIN_OCCURRED_EPOCH_SECONDS, } from "./decode.js";
// Platform / transport / provider identity + metadata.
export { PLATFORMS, PROVIDERS, TRANSPORTS, decodeHeaderMap, decodePlatform, decodeProvider, decodeProviderMeta, decodeTransport, } from "./platform.js";
// Inbound HTTP request (exact bytes; verify-before-parse) + neutral Web-Request
// adapter helpers shared by the Web-Request providers.
export { DEFAULT_MAX_BODY_BYTES, adaptFetchRequest, headerForEachToMap, pathAndQuery, stripOrigin, } from "./http.js";
// Raw delivery (durable source truth) + signature/retry verdicts + envelope decode.
export { ENVELOPE_DECODE_MODES, SIGNATURE_KINDS, buildRawDelivery, decodeEnvelopeDecode, decodeEnvelopeDecodeMode, decodeRawDelivery, decodeRawInsertResult, decodeRetryMeta, decodeSignatureKind, decodeSignatureResult, } from "./raw.js";
// Platform capability descriptor (effect encoders consume it; data, not policy).
export { LENGTH_UNITS, MARKDOWN_FLAVORS, decodeMediaSupport, decodePlatformCapability, fitsLength, measureLength, } from "./capability.js";
// Verification primitives: constant-time compare, multi-candidate signatures,
// inbound status-code contract, content-length cap, loopback + CIDR guards.
export { INBOUND_OUTCOMES, INBOUND_STATUS, PayloadTooLargeError, contentLengthExceeds, decideInbound, decodeInboundOutcome, failedSignature, ipInAllowlist, isLoopbackHost, isSecretMissing, readBodyCapped, rejectVerdict, splitSignatureCandidates, statusForOutcome, timingSafeEqual, verifiedSignature, verifyCandidates, } from "./verify.js";
// Dedupe.
export { decodeDedupeClaim, decodeDedupeRequest, wasClaimed } from "./dedupe.js";
// Queue + lane lease.
export { decodeJsonPayload, decodeLaneLease, decodeQueueMessage, } from "./queue.js";
// Provider-neutral runtime interfaces: one SqlStorage-style storage and the lane
// attempt-marker single-flight semantics.
export { decodeAttemptMarker, isMarkerFresh, reconcileMarkers, } from "./interfaces.js";
// Event journal + runtime-consumer boundary.
export { decodeCanonicalEvent, decodeRuntimeRecord, } from "./journal.js";
// Normalized event (runtime-facing) + family/kind vocabulary + source namespaces.
export { EVENT_FAMILIES, EVENT_KINDS, decodeEventFamily, decodeEventKind, decodeEventProvenance, decodeNormalizedEvent, decodeNormalizedEvents, familyOf, } from "./event.js";
// Runtime consumer boundary: normalized event + replay context -> decision +
// typed effect proposals. Proposals reach side effects only via the outbox.
export { REPLAY_REASONS, assertNoDispatchInDryRun, decodeEffectProposal, decodeReplayContext, decodeReplayReason, decodeRuntimeDecision, proposalsToOutbox, } from "./runtime.js";
// Outbox (the only side-effect path).
export { OUTBOX_STATES, decodeOutbox, decodeOutboxAttempt, decodeOutboxState, } from "./outbox.js";
// Stable outbox id (Phase 4): the single deterministic id function shared by
// `proposalsToOutbox` and the DX skin's effect handles, so a handle's `outboxId`
// is byte-identical to the durable row it sequences after.
export { stableOutboxId, stableOutboxIdForProposal } from "./outbox-id.js";
// Effect-dispatch boundary vocabulary (types + decoders only; no I/O). The seam
// between pure platform effect codecs and the generic dispatch loop.
export { DISPATCH_NEXT_STATES, EFFECT_CREDENTIAL_KINDS, EFFECT_HTTP_METHODS, RATE_LIMIT_REASONS, asSecret, decodeDispatchDecision, decodeEffectHttpResponseMeta, decodeHeaderPair, decodeRateLimitUpdate, } from "./dispatch.js";
// Delivery gate (durable work ledger; atomic claim+insert) + message-level
// dedupe (a distinct layer from delivery-level dedupe).
export { DELIVERY_WORK_STATES, acceptedForProcessing, decodeDeliveryWork, decodeDeliveryWorkClaim, decodeDeliveryWorkState, decodeMessageDedupeClaim, decodeMessageDedupeRequest, decodePrepareDeliveryRequest, decodePrepareDeliveryResult, messageWasClaimed, } from "./delivery.js";
// Uniform outbound surface: one authored GestRichMessage (text | markdown | card
// | blocks) + the pure, version-pinned PlatformMessageRenderer contract that fans
// it out to native per-platform request bodies. Pure types + decoders only; the
// renderers themselves live in the optional @gest/render-* bridge packages.
export { GEST_CARD_NODE_KINDS, GEST_MESSAGE_KINDS, decodeGestCard, decodeGestCardNode, decodeGestRichMessage, decodeRenderedPlatformBody, } from "./message.js";
// Replay API.
export { REPLAY_MODES, decodeReplayError, decodeReplayMode, decodeReplayReport, decodeReplayRequest, } from "./replay.js";
// Neutral tracing boundary: a Tracer/Span contract domain code calls for custom
// DOMAIN spans, plus a NoopTracer default so core/platform/tests need no real
// tracer. Infra implements it over native `cloudflare:workers` tracing; this file
// imports nothing platform/provider/cloudflare and does no I/O.
export { NoopTracer } from "./tracer.js";
// Error taxonomy.
export { INGEST_ERROR_CODES, CredentialError, DecodeError, IngestError, RateLimitError, SignatureError, orThrow, } from "./errors.js";
//# sourceMappingURL=index.js.map