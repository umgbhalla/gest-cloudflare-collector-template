// @gest/ingest-github
//
// GitHub platform adapter. Owns GitHub's verification (X-Hub-Signature-256 over
// exact raw bytes), native envelope decoding (header-supplied event name +
// payload), event identity/dedupe (delivery id), platform-neutral normalization
// under source.github, and GitHub API effect encoding for the outbox.
//
// Boundaries (gest hard rules):
// - Verifies the signature over EXACT raw bytes BEFORE parsing JSON.
// - Owns NO runtime policy: it never decides, never dispatches. It produces
//   durable records (RawDelivery, native key, NormalizedEvent) and, only when a
//   runtime explicitly asks, encodes typed effect proposals for the outbox.
// - Installation token minting is a CAPABILITY BOUNDARY: this package declares the
//   capability interface (capability.ts) but never mints/refreshes a token, and
//   ingest-core has no token knowledge at all.
// - May import @gest/ingest-core only. No provider package, no other platform
//   package, no agent runtime.
// Verification (raw bytes, signature verdict).
export { GITHUB_DELIVERY_HEADER, GITHUB_EVENT_HEADER, GITHUB_HOOK_ID_HEADER, GITHUB_INSTALLATION_TARGET_ID_HEADER, GITHUB_INSTALLATION_TARGET_TYPE_HEADER, GITHUB_SIGNATURE_HEADER, GITHUB_SIGNATURE_SCHEME, captureRetryMeta, computeSignature, verifyGithubRequest, } from "./verify.js";
// Envelope decoding + cross-cutting metadata extraction.
export { GITHUB_EVENTS, decodeGithubEnvelope, installationOf, isGithubEvent, organizationOf, parseGithubBody, repositoryOf, senderOf, } from "./envelope.js";
// Identity + dedupe keys.
export { appOrHookId, deliveryContentKey, deliveryDedupeKey, deliveryIdentityOf, } from "./identity.js";
// Normalization to the core's neutral event.
export { GITHUB_DECODER_VERSION, normalizeGithubEvent } from "./normalize.js";
// Effect encoding (outbox effects + rate keys), runtime-requested only.
export { GITHUB_EFFECT_METHODS, contentRateKey, encodeGithubEffect, methodRateKey, rateKeyForEffect, } from "./effects.js";
// Installation token capability boundary (declared, never implemented in ingest).
export { assertTokenlessRequestBody } from "./capability.js";
// Typed platform messaging capability descriptor (distinct from the token
// capability above; effect encoders consume it; data, not policy).
export { GITHUB_CAPABILITY } from "./platform-capability.js";
// End-to-end ingest entry point (HTTP), storage-free, token-free.
export { ingestGithubHttp } from "./ingest.js";
//# sourceMappingURL=index.js.map