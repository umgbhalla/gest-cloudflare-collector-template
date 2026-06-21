import type { Tracer } from "@gest/ingest-core";
/**
 * The native-backed tracer. `enterSpan` runs the domain stage inside a native CF
 * span and lets the native runtime end it when the stage settles; `startSpan` is
 * the escape hatch for a span the caller ends by hand (a long-lived stage that
 * outlives one function — e.g. a gateway connection). The starting `attrs` are
 * applied ONLY when the span is actually traced, so attribute work is skipped when
 * tracing is off / unsampled.
 */
export declare const CloudflareTracer: Tracer;
//# sourceMappingURL=tracer.d.ts.map