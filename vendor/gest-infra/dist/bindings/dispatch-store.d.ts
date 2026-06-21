import type { ClaimReadyOutbox, ClaimedOutbox, DispatchDlq, DlqEntry, Outbox, OutboxAttempt, OutboxState, RateLimitCheck, RateLimitStore, RateLimitUpdate, ReapOutboxLeases, RecordDispatchDecision, OutboxDispatchStore } from "@gest/ingest-core";
import type { OutboxStore } from "../stores.js";
import type { D1Database } from "../env.js";
export type Clock = () => string;
/**
 * One D1 class serving BOTH the consumer-side `OutboxStore` (enqueue / list /
 * get / recordAttempt) and the dispatcher-side `OutboxDispatchStore` (claimReady
 * / recordDispatchDecision / reapExpiredLeases) over the same `outbox` table. The
 * consumer enqueues pending rows; the dispatcher claims + sends them. Keeping it
 * one class avoids a second binding for the same table.
 */
export declare class D1OutboxDispatchStore implements OutboxDispatchStore, OutboxStore {
    #private;
    constructor(db: D1Database);
    /** Seed a pending row (consumer-side enqueue). Idempotent on idempotency_key. */
    enqueue(o: Outbox): Promise<{
        readonly entry: Outbox;
        readonly inserted: boolean;
    }>;
    /** OutboxStore.get is keyed by idempotencyKey (UNIQUE). */
    get(idempotencyKey: string): Promise<Outbox | undefined>;
    list(): Promise<readonly Outbox[]>;
    /** Legacy consumer dispatcher path: record an attempt by idempotencyKey. */
    recordAttempt(idempotencyKey: string, attempt: OutboxAttempt, nextState: OutboxState): Promise<Outbox>;
    /** Dispatcher-side read by outboxId (the loop's RecordDispatchDecision key). */
    getById(outboxId: string): Promise<Outbox | undefined>;
    claimReady(input: ClaimReadyOutbox): Promise<readonly ClaimedOutbox[]>;
    recordDispatchDecision(input: RecordDispatchDecision): Promise<void>;
    reapExpiredLeases(input: ReapOutboxLeases): Promise<number>;
}
export declare class D1RateLimitStore implements RateLimitStore {
    #private;
    constructor(db: D1Database, clock: Clock);
    check(input: {
        readonly rateKeys: readonly string[];
        readonly now: string;
    }): Promise<RateLimitCheck>;
    update(input: RateLimitUpdate): Promise<void>;
}
export declare class D1DispatchDlq implements DispatchDlq {
    #private;
    constructor(db: D1Database);
    put(entry: DlqEntry): Promise<void>;
}
//# sourceMappingURL=dispatch-store.d.ts.map