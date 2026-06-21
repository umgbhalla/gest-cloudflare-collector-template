// @gest/ingest-cloudflare / hooks
//
// Boring capability interfaces a Worker wires to Cloudflare primitives. These are
// the ONLY way a provider adapter touches infrastructure: enqueue work, lease a
// lane, store raw metadata/blobs. They carry NO platform or runtime policy — the
// types they move (QueueMessage, LaneLease, RawDelivery) are all neutral core
// records. A Worker implements these against Queues / Durable Objects / D1 / R2.
export {};
//# sourceMappingURL=hooks.js.map