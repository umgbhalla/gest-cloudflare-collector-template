// @gest/infra / bindings / fakes
//
// In-memory binding set for OFFLINE tests. It reuses the @gest/ingest-local
// reference stores (MemoryRawStore / MemoryDeliveryGateStore / MemoryQueue /
// MemoryEventJournal / MemoryOutboxStore) and wraps them to satisfy the SAME hook
// shapes the real Cloudflare bindings implement (CloudflareQueue, CloudflareLane),
// plus a FakeLane that honors the LaneLease fencing-token contract in process.
//
// This is the fake/in-memory binding set the worker wiring is driven against in
// unit tests: valid -> enqueued + raw stored; invalid signature -> rejected, no
// body; duplicate -> collapsed; consumer -> journal + outbox; replay -> no effects.
// It is NOT production: no durability, no real concurrency.
import { MemoryDeliveryGateStore, MemoryEventJournal, MemoryMessageDedupeStore, MemoryOutboxStore, MemoryQueue, MemoryRawStore, } from "@gest/ingest-local";
/** A CloudflareQueue backed by the in-memory MemoryQueue (send -> enqueue). */
export class FakeQueue {
    inner;
    constructor(inner = new MemoryQueue()) {
        this.inner = inner;
    }
    async send(message) {
        await this.inner.enqueue(message);
    }
    async sendBatch(messages) {
        for (const m of messages)
            await this.inner.enqueue(m);
    }
}
/**
 * In-memory CloudflareLane honoring the lease + fencing-token contract: acquire
 * grants a lease when the subject is free or held by the same holder (refresh) or
 * the prior lease expired; a contended subject returns held=false. release is a
 * no-op (returns false) when the fencing token is stale. The fencing token is a
 * monotonic per-subject counter, matching the core's "reject stale holders" rule.
 */
export class FakeLane {
    #held = new Map();
    #counter = new Map();
    #clock;
    constructor(clock) {
        this.#clock = clock;
    }
    acquire(subject, holder, ttlSeconds) {
        const now = this.#clock();
        const nowMs = Date.parse(now);
        const existing = this.#held.get(subject);
        const free = existing === undefined || existing.expiresAtMs <= nowMs || existing.holder === holder;
        if (!free) {
            const lease = {
                subject,
                holder: existing.holder,
                fencingToken: existing.fencingToken,
                acquiredAt: existing.acquiredAt,
                expiresAt: new Date(existing.expiresAtMs).toISOString(),
                held: false,
            };
            return Promise.resolve(lease);
        }
        const token = (this.#counter.get(subject) ?? 0) + 1;
        this.#counter.set(subject, token);
        const expiresAtMs = nowMs + ttlSeconds * 1000;
        const fencingToken = `${subject}#${token}`;
        this.#held.set(subject, { holder, fencingToken, acquiredAt: now, expiresAtMs });
        return Promise.resolve({
            subject,
            holder,
            fencingToken,
            acquiredAt: now,
            expiresAt: new Date(expiresAtMs).toISOString(),
            held: true,
        });
    }
    release(subject, holder, fencingToken) {
        const existing = this.#held.get(subject);
        if (!existing || existing.holder !== holder || existing.fencingToken !== fencingToken) {
            return Promise.resolve(false);
        }
        this.#held.delete(subject);
        return Promise.resolve(true);
    }
}
/** Build a fresh in-memory binding set with a fixed clock for deterministic runs. */
export function createFakeBindings(clock = () => "1970-01-01T00:00:00.000Z") {
    const raw = new MemoryRawStore(clock);
    const delivery = new MemoryDeliveryGateStore();
    const messageDedupe = new MemoryMessageDedupeStore();
    const journal = new MemoryEventJournal();
    const outbox = new MemoryOutboxStore();
    const queue = new FakeQueue();
    const lane = new FakeLane(clock);
    return {
        raw,
        delivery,
        messageDedupe,
        journal,
        outbox,
        queue,
        lane,
        fetchStores: { raw, delivery },
        consumerStores: { raw, journal, outbox, delivery, messageDedupe },
    };
}
//# sourceMappingURL=fake.js.map