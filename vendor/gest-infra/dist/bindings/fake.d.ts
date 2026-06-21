import type { LaneLease, QueueMessage } from "@gest/ingest-core";
import type { CloudflareLane, CloudflareQueue } from "@gest/ingest-cloudflare";
import { MemoryDeliveryGateStore, MemoryEventJournal, MemoryMessageDedupeStore, MemoryOutboxStore, MemoryQueue, MemoryRawStore, type Clock } from "@gest/ingest-local";
import type { ConsumerStores, FetchStores } from "../stores.js";
/** A CloudflareQueue backed by the in-memory MemoryQueue (send -> enqueue). */
export declare class FakeQueue implements CloudflareQueue {
    readonly inner: MemoryQueue;
    constructor(inner?: MemoryQueue);
    send(message: QueueMessage): Promise<void>;
    sendBatch(messages: readonly QueueMessage[]): Promise<void>;
}
/**
 * In-memory CloudflareLane honoring the lease + fencing-token contract: acquire
 * grants a lease when the subject is free or held by the same holder (refresh) or
 * the prior lease expired; a contended subject returns held=false. release is a
 * no-op (returns false) when the fencing token is stale. The fencing token is a
 * monotonic per-subject counter, matching the core's "reject stale holders" rule.
 */
export declare class FakeLane implements CloudflareLane {
    #private;
    constructor(clock: Clock);
    acquire(subject: string, holder: string, ttlSeconds: number): Promise<LaneLease>;
    release(subject: string, holder: string, fencingToken: string): Promise<boolean>;
}
/** The full in-memory binding set: fetch stores + consumer stores + hooks. */
export interface FakeBindings {
    readonly raw: MemoryRawStore;
    readonly delivery: MemoryDeliveryGateStore;
    readonly messageDedupe: MemoryMessageDedupeStore;
    readonly journal: MemoryEventJournal;
    readonly outbox: MemoryOutboxStore;
    readonly queue: FakeQueue;
    readonly lane: FakeLane;
    readonly fetchStores: FetchStores;
    readonly consumerStores: ConsumerStores;
}
/** Build a fresh in-memory binding set with a fixed clock for deterministic runs. */
export declare function createFakeBindings(clock?: Clock): FakeBindings;
//# sourceMappingURL=fake.d.ts.map