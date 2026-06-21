// @gest/infra / observability / span attribute keys
//
// The attribute-key vocabulary the infra stages attach to DOMAIN spans. Two
// namespaces, both string|number|boolean valued (the only span attribute value
// kinds CF supports):
//
//   gest.*  — Gest domain identifiers (tenant, platform, account, ids). These are
//             the high-cardinality keys that let a trace be pivoted by tenant /
//             platform / event. Computed only behind `span.isTraced` when the
//             value is not already in hand, so an untraced run pays nothing.
//
//   OTel  — OpenTelemetry semantic conventions where they exist
//             (http.response.status_code, http.route) so the spans read
//             in any OTel-aware viewer.
//
// These are plain string constants (no runtime), so importing this file is free
// and it carries no dependency on `cloudflare:workers`.
// ---------------------------------------------------------------------------
// gest.* — domain identifiers
// ---------------------------------------------------------------------------
export const ATTR_TENANT = "gest.tenant";
export const ATTR_PLATFORM = "gest.platform";
export const ATTR_ACCOUNT = "gest.account";
export const ATTR_RAW_ID = "gest.raw_id";
export const ATTR_NATIVE_KEY = "gest.native_key";
export const ATTR_EVENT_ID = "gest.event_id";
export const ATTR_OUTBOX_ID = "gest.outbox_id";
// Gest stage outcomes (low-cardinality, cheap to set).
export const ATTR_OUTCOME = "gest.outcome";
/** Field-path issues of a post-verify decode failure (malformed-but-signed). */
export const ATTR_DECODE_ISSUES = "gest.decode_issues";
export const ATTR_DUPLICATE = "gest.duplicate";
export const ATTR_ENQUEUED = "gest.enqueued";
export const ATTR_SKIPPED = "gest.skipped";
export const ATTR_EFFECT_METHOD = "gest.effect_method";
export const ATTR_RATE_KEY = "gest.rate_key";
export const ATTR_REPAIRED = "gest.repaired";
export const ATTR_GATEWAY_PHASE = "gest.gateway_phase";
// ---------------------------------------------------------------------------
// OTel semantic conventions
// ---------------------------------------------------------------------------
export const ATTR_HTTP_RESPONSE_STATUS_CODE = "http.response.status_code";
export const ATTR_HTTP_ROUTE = "http.route";
// ---------------------------------------------------------------------------
// Span names for the DOMAIN stages (stable so traces are queryable by name).
// Custom spans only for domain work — never for what CF auto-traces (fetch,
// KV/R2/DO bindings, handler lifecycles).
// ---------------------------------------------------------------------------
// Ack path (fetch).
export const SPAN_ACK = "gest.ack";
export const SPAN_VERIFY = "gest.verify";
export const SPAN_RAW_CAPTURE = "gest.raw_capture";
export const SPAN_PREPARE_DELIVERY = "gest.prepare_delivery";
export const SPAN_ENQUEUE = "gest.enqueue";
// Queue consumer.
export const SPAN_CLAIM_WORK = "gest.claim_work";
export const SPAN_NORMALIZE = "gest.normalize";
export const SPAN_MESSAGE_DEDUPE = "gest.message_dedupe";
export const SPAN_RUNTIME = "gest.runtime";
export const SPAN_OUTBOX_WRITE = "gest.outbox_write";
// Dispatch worker.
export const SPAN_DISPATCH_PASS = "gest.dispatch_pass";
export const SPAN_DISPATCH_CLAIM = "gest.dispatch_claim";
export const SPAN_REPAIR = "gest.repair";
// Gateway DO.
export const SPAN_GATEWAY_CONNECT = "gest.gateway.connect";
export const SPAN_GATEWAY_FRAME = "gest.gateway.frame";
export const SPAN_GATEWAY_TICK = "gest.gateway.tick";
export const SPAN_GATEWAY_INGEST = "gest.gateway.ingest";
//# sourceMappingURL=attributes.js.map