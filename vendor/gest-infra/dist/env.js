// @gest/infra / env
//
// Structural shapes for the Cloudflare runtime primitives this Worker binds to.
// We declare them structurally (rather than depend on @cloudflare/workers-types
// at compile time) so the wiring typechecks offline with no ambient workers lib
// and the same code runs against the real bindings in a deployed isolate. The
// fakes in src/bindings/fake.ts satisfy the SAME structural shapes, so tests and
// production share one type surface.
//
// infra is the ONLY layer that may name both the provider adapter
// (@gest/ingest-cloudflare) and the platform adapters together. These env shapes
// are deployment glue; they carry no platform or runtime policy.
export {};
//# sourceMappingURL=env.js.map