// @gest/ingest-cloudflare
//
// Cloudflare provider adapter. Boring by mandate: it maps host-native surfaces
// (Worker `fetch`, Queue consumer, Durable Object lane, D1/R2 raw store) onto the
// neutral @gest/ingest-core contracts and exposes raw bytes + headers + provider
// metadata BEFORE any platform decode.
//
// Hard boundaries (enforced by the dependency-graph test):
// - imports ONLY @gest/ingest-core (no platform package, no other provider, no
//   agent runtime).
// - never parses JSON before signature verification (it reads exact bytes and
//   stops); never runs a runtime consumer in the ack path; carries no platform
//   or runtime policy.
export { DEFAULT_MAX_BODY_BYTES, adaptCloudflareRequest, cloudflareProviderMeta, headersToMap, pathAndQuery, } from "./request.js";
export { guardInbound } from "./guard.js";
export { decodeBatch } from "./consumer.js";
//# sourceMappingURL=index.js.map