import type { LaneLease, QueueMessage, RawDelivery, RawInsertResult } from "@gest/ingest-core";
/** Enqueue deferred work onto Cloudflare Queues. */
export interface CloudflareQueue {
    /** Send one neutral queue message. */
    send(message: QueueMessage): Promise<void>;
    /** Send a batch; providers may map to Queue `sendBatch`. */
    sendBatch?(messages: readonly QueueMessage[]): Promise<void>;
}
/**
 * A Durable Object that serializes a lane (one conversation/account stream). The
 * DO owns the fencing token and expiry; this is the neutral handshake only.
 */
export interface CloudflareLane {
    /** Try to acquire/refresh the lease for `subject` held by `holder`. */
    acquire(subject: string, holder: string, ttlSeconds: number): Promise<LaneLease>;
    /** Release a lease; a stale fencing token is a no-op (returns false). */
    release(subject: string, holder: string, fencingToken: string): Promise<boolean>;
}
/** Raw store split across D1 (metadata row) and R2 (body blob). */
export interface CloudflareRawStore {
    /**
     * Idempotently persist a raw delivery. Implementations write the metadata row
     * to D1 and, when `RawDelivery.body` is present, the exact bytes to R2 keyed by
     * `bodyHash`. Rejected-signature deliveries arrive with no body by contract.
     */
    put(raw: RawDelivery): Promise<RawInsertResult>;
}
/** The full bundle of Cloudflare hooks a Worker provides to the ack path. */
export interface CloudflareHooks {
    readonly raw: CloudflareRawStore;
    readonly queue: CloudflareQueue;
    /** Optional: only present when the deployment uses DO lane serialization. */
    readonly lane?: CloudflareLane;
}
//# sourceMappingURL=hooks.d.ts.map