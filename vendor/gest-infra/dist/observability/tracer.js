// @gest/infra / observability / CloudflareTracer
//
// The infra-only implementation of the core neutral `Tracer`/`Span` boundary over
// Cloudflare's NATIVE custom-span API (`import { tracing } from "cloudflare:workers"`).
// This is the ONLY place `cloudflare:workers` tracing is named. The DOMAIN code
// (ingest-core/platform/dispatch) stays pure: it calls the neutral Tracer contract
// from @gest/ingest-core and never imports `cloudflare:workers`. Infra injects this
// CloudflareTracer in the deployed isolate; offline/tests inject the NoopTracer.
//
// STRUCTURAL TYPING (same play as env.ts): `cloudflare:workers` is a CF-runtime
// module with no compile-time types unless `@cloudflare/workers-types` is in the
// ambient lib (it is only a devDependency here). So we declare the EXACT slice of
// the native `tracing` surface we use as a structural interface and `import` the
// real module through it. The compiler typechecks against the structural shape;
// the deployed isolate supplies the real `tracing`. The import is a top-level
// `import` (CF resolves `cloudflare:workers` at deploy), so this file MUST NOT be
// loaded by the offline test runner — only the deployed Worker entry constructs a
// CloudflareTracer. Tests use NoopTracer and never touch this module.
//
// Native semantics mirrored:
//   tracing.enterSpan(name, async (span) => {...})  -> Tracer.enterSpan
//   span.setAttribute(key, value)                    -> Span.setAttribute
//   span.isTraced                                    -> Span.isTraced (gate attrs)
//   span.end()                                       -> Span.end (the wrapper ends it)
// Cost note: each native span is one event sharing the Workers Logs quota, so the
// callers gate expensive attribute computation behind `span.isTraced`.
// The CF-only `cloudflare:workers` specifier is declared ambiently in
// ./cloudflare-workers.d.ts (the base tsconfig pulls in NO @cloudflare/workers-
// types, and `cloudflare:` virtual modules do not resolve under NodeNext — the
// same offline-compile play env.ts uses for the binding shapes). At deploy the
// real module supplies a superset of the declared `tracing` slice.
import { tracing as rawTracing } from "cloudflare:workers";
const tracing = rawTracing;
// ---------------------------------------------------------------------------
// CloudflareTracer: the native-backed Tracer.
// ---------------------------------------------------------------------------
/** Adapt a native span to the neutral Span the domain code holds. */
function wrapSpan(native, attrs) {
    if (attrs !== undefined && native.isTraced) {
        for (const [k, v] of Object.entries(attrs))
            native.setAttribute(k, v);
    }
    let ended = false;
    return {
        isTraced: native.isTraced,
        setAttribute(key, value) {
            native.setAttribute(key, value);
        },
        end() {
            if (ended)
                return;
            ended = true;
            native.end?.();
        },
    };
}
/**
 * The native-backed tracer. `enterSpan` runs the domain stage inside a native CF
 * span and lets the native runtime end it when the stage settles; `startSpan` is
 * the escape hatch for a span the caller ends by hand (a long-lived stage that
 * outlives one function — e.g. a gateway connection). The starting `attrs` are
 * applied ONLY when the span is actually traced, so attribute work is skipped when
 * tracing is off / unsampled.
 */
export const CloudflareTracer = Object.freeze({
    async enterSpan(name, attrs, fn) {
        return tracing.enterSpan(name, (native) => fn(wrapSpan(native, attrs)));
    },
    startSpan(name, attrs) {
        // The native API has no synchronous "open and return" primitive; it ends a
        // span when the `enterSpan` callback settles. We open a native span and keep
        // its scope alive until the returned Span is ended by hand, so a long-lived
        // stage (the rare case the neutral contract allows) can hold a span across
        // calls. The infra stages here use `enterSpan` exclusively; this exists only
        // to satisfy the contract for a future hand-managed span.
        let resolveScope;
        let opened;
        void tracing.enterSpan(name, (native) => {
            opened = wrapSpan(native, attrs);
            return new Promise((resolve) => {
                resolveScope = resolve;
            });
        });
        const span = opened;
        if (span === undefined) {
            // The callback runs synchronously up to the returned promise, so `opened`
            // is set. Defensive fallback if a runtime ever defers it.
            return { isTraced: false, setAttribute() { }, end() { } };
        }
        const innerEnd = span.end.bind(span);
        return {
            isTraced: span.isTraced,
            setAttribute: span.setAttribute.bind(span),
            end() {
                innerEnd();
                resolveScope?.();
            },
        };
    },
});
//# sourceMappingURL=tracer.js.map