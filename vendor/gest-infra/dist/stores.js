// @gest/infra / stores
//
// The store surfaces the Worker stages need, expressed as small contracts so the
// real Cloudflare bindings AND the in-memory fakes satisfy the SAME types.
//
//   - RawReadStore: load a raw delivery back by id (consumer "load raw" step).
//   - The journal + outbox surfaces are small local capability interfaces over
//     core records. @gest/ingest-local implements the same shapes for tests, but
//     production infra does not depend on that reference package.
//
// infra owns these compositions; the ingest packages do not depend on infra.
export {};
//# sourceMappingURL=stores.js.map