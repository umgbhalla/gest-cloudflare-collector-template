// @gest/ingest-dispatch / store + registry contracts
//
// The provider-neutral dispatch-store contracts the generic loop drives now live
// in @gest/ingest-core (the stable vocabulary), so the reference store
// implementations in @gest/ingest-local can implement them without importing
// this loop package, and this loop package can implement them too — a clean
// split the Oracle review recommends (stable vocabulary in core, loop here).
//
// This module RE-EXPORTS those contracts unchanged, so every existing importer
// of `@gest/ingest-dispatch` (the loop, its tests, infra) keeps working with no
// edits. NO platform, provider, fetch, or env knowledge lives here.
//
// Credentials are a CAPABILITY boundary (mirroring the GitHub installation-token
// pattern): the outbox carries an opaque `credentialRef`; a token is resolved by
// an injected EffectCredentialCapability at send time, never baked into a row,
// parsed out of a rate key, or stored by this package.
export {};
//# sourceMappingURL=stores.js.map