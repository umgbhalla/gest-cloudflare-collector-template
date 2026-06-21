/** Span attribute values, matching native CF span semantics. */
export type SpanAttributeValue = string | number | boolean;
/** A flat attribute bag for a span (OTel conventions + cloudflare.* + gest.*). */
export type SpanAttributes = Readonly<Record<string, SpanAttributeValue>>;
/**
 * A single domain span. Mirrors the native CF Span surface the core actually
 * uses: set an attribute, end the span, and an `isTraced` flag to gate expensive
 * attribute computation when tracing is off / not sampled.
 */
export interface Span {
    /** True when this span is actually being recorded; false for the no-op. */
    readonly isTraced: boolean;
    /** Attach one attribute. Values are string | number | boolean. */
    setAttribute(key: string, value: SpanAttributeValue): void;
    /** Close the span. Idempotent; safe to call once the stage settles. */
    end(): void;
}
/**
 * The neutral tracer the core/platform call. `enterSpan` is the primary entry:
 * it opens a span, runs `fn(span)`, and ALWAYS ends the span (even on throw), so
 * domain code never leaks an open span. `startSpan` is the escape hatch for the
 * rare span that outlives one function and is ended by hand.
 */
export interface Tracer {
    /**
     * Run `fn` inside a span named `name` with optional starting `attrs`. The span
     * is ended after `fn` settles (resolve OR reject). Returns whatever `fn`
     * returns. This is the shape infra wires straight onto CF `tracing.enterSpan`.
     */
    enterSpan<T>(name: string, attrs: SpanAttributes | undefined, fn: (span: Span) => T | Promise<T>): Promise<T>;
    /** Open a span the caller ends manually (long-lived stages, e.g. a gateway). */
    startSpan(name: string, attrs?: SpanAttributes): Span;
}
/**
 * The default tracer: does nothing, hands back the inert NOOP_SPAN, and still
 * runs `fn` so domain control flow is identical with or without real tracing.
 * `isTraced` is false everywhere, so attribute computation is skipped. This is
 * what core/platform/tests use unless infra injects a real CF-backed tracer.
 */
export declare const NoopTracer: Tracer;
//# sourceMappingURL=tracer.d.ts.map