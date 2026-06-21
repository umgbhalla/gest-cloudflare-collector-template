// @gest/ingest-core / dispatch store contracts
//
// Provider-neutral durable-store contracts the generic dispatch loop drives.
// These name the durable seams (outbox claim/record, rate buckets, DLQ) and the
// platform-codec registry. They live in ingest-core (the stable vocabulary) so
// that BOTH the generic loop (@gest/ingest-dispatch) and the reference store
// implementations (@gest/ingest-local) can depend on them without either
// importing the other. The Oracle review (docs/research/oracle-slack-live-
// dispatch.md §"Core dispatch interfaces") prefers exactly this split: stable
// vocabulary in core, the loop in ingest-dispatch.
//
// Types ONLY here — no I/O, no platform, no provider, no fetch, no env. The loop
// only moves bytes and applies a codec's verdict against these atomic stores.
//
// Credentials are a CAPABILITY boundary (mirroring the GitHub installation-token
// pattern): the outbox carries an opaque `credentialRef`; a token is resolved by
// an injected EffectCredentialCapability at send time, never baked into a row,
// parsed out of a rate key, or stored.
export {};
//# sourceMappingURL=dispatch-store.js.map