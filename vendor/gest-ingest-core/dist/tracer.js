// @gest/ingest-core / neutral tracing boundary (types + a no-op default)
//
// The DOMAIN code (core/platform/dispatch) emits custom spans for its own stages
// (verify, dedupe, enqueue, claimWork, normalize, outbox write, dispatch claim,
// codec, API call, gateway connect/ready/heartbeat, ...). It must stay PURE: it
// MUST NOT import `cloudflare:workers`. So the core owns ONLY this neutral
// Tracer/Span contract (the same play as RuntimeConsumer / SqlStorage). Infra
// implements it over native CF `tracing.enterSpan` (one Worker span = one event
// on the Workers Logs quota); local/tests use the NoopTracer below.
//
// Shape choice: `enterSpan(name, attrs, fn)` is the MINIMAL one that fits how CF
// native tracing is called (`tracing.enterSpan(name, async (span) => {...})`) and
// guarantees the span is always ended (the wrapper ends it). A lower-level
// `startSpan(name, attrs?) -> Span` is also exposed for the rare manual case
// (spans that outlive a single function, e.g. a gateway connection). Both yield a
// Span carrying `isTraced` so callers can skip expensive attribute computation.
//
// IMPORTANT: importing this file pulls in NO runtime and does NO I/O. It is types
// plus a frozen no-op singleton, so every offline test passes with the default
// tracer and never needs a real one.
/** The shared no-op span: never traced, every method a no-op. */
const NOOP_SPAN = Object.freeze({
    isTraced: false,
    setAttribute(_key, _value) { },
    end() { },
});
/**
 * The default tracer: does nothing, hands back the inert NOOP_SPAN, and still
 * runs `fn` so domain control flow is identical with or without real tracing.
 * `isTraced` is false everywhere, so attribute computation is skipped. This is
 * what core/platform/tests use unless infra injects a real CF-backed tracer.
 */
export const NoopTracer = Object.freeze({
    async enterSpan(_name, _attrs, fn) {
        return fn(NOOP_SPAN);
    },
    startSpan(_name, _attrs) {
        return NOOP_SPAN;
    },
});
//# sourceMappingURL=tracer.js.map