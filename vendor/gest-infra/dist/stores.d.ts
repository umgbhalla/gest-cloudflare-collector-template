import type { CanonicalEvent, DedupeClaim, DedupeRequest, DeliveryGateStore, EventJournal, MessageDedupeStore, Outbox, OutboxAttempt, RawDelivery, RuntimeRecord } from "@gest/ingest-core";
import type { CloudflareRawStore } from "@gest/ingest-cloudflare";
/** Read a raw delivery back (the consumer's source-truth load step). */
export interface RawReadStore {
    get(rawId: string): Promise<RawDelivery | undefined>;
}
/** A raw store that both persists (ack path) and reads back (consumer). */
export interface RawStoreRW extends CloudflareRawStore, RawReadStore {
}
/** Native-key dedupe claims within a retention window. */
export interface DedupeStore {
    claim(request: DedupeRequest): Promise<DedupeClaim>;
}
/** Outbox: the only side-effect path. Idempotent on idempotencyKey. */
export interface OutboxStore {
    enqueue(entry: Outbox): Promise<{
        readonly entry: Outbox;
        readonly inserted: boolean;
    }>;
    recordAttempt(idempotencyKey: string, attempt: OutboxAttempt, nextState: Outbox["state"]): Promise<Outbox>;
    get(idempotencyKey: string): Promise<Outbox | undefined>;
    list(): Promise<readonly Outbox[]>;
}
/** EventJournal plus the read-back surface fixtures need to assert on. */
export interface LocalEventJournal extends EventJournal {
    listEvents(): Promise<readonly CanonicalEvent[]>;
    listRecords(): Promise<readonly RuntimeRecord[]>;
}
export type { DeliveryGateStore, MessageDedupeStore };
/**
 * Everything the fetch ack path needs beyond the queue/lane hooks. The live ack
 * path uses the atomic `delivery` gate: it claims the delivery dedupe key AND
 * inserts the recoverable work-ledger row in ONE D1 transaction (atomicity).
 */
export interface FetchStores {
    readonly raw: CloudflareRawStore;
    readonly delivery: DeliveryGateStore;
}
/** Everything the queue consumer + outbox dispatcher need. */
export interface ConsumerStores {
    readonly raw: RawStoreRW;
    readonly journal: LocalEventJournal;
    readonly outbox: OutboxStore;
    /** Durable delivery gate: claimWork lease + completeWork/failWork at consumer top. */
    readonly delivery: DeliveryGateStore;
    /** Message-level dedupe (distinct layer), claimed after normalize. */
    readonly messageDedupe: MessageDedupeStore;
}
//# sourceMappingURL=stores.d.ts.map