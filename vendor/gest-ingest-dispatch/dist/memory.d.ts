import type { ClaimReadyOutbox, ClaimedOutbox, DispatchDlq, DlqEntry, EffectHttpRequest, EffectHttpResponse, Outbox, OutboxDispatchStore, RateLimitCheck, RateLimitStore, RateLimitUpdate, ReapOutboxLeases, RecordDispatchDecision } from "@gest/ingest-core";
export declare class MemoryOutboxDispatchStore implements OutboxDispatchStore {
    private readonly rows;
    /** Seed a row. `attempts` defaults to []; `state` defaults to "pending". */
    add(outbox: Outbox): void;
    /** Read-only snapshot for assertions. */
    get(outboxId: string): Outbox | undefined;
    all(): readonly Outbox[];
    claimReady(input: ClaimReadyOutbox): Promise<readonly ClaimedOutbox[]>;
    /** True when every `dependsOnOutboxIds` entry exists and is terminal `sent`. */
    private dependenciesSent;
    recordDispatchDecision(input: RecordDispatchDecision): Promise<void>;
    reapExpiredLeases(input: ReapOutboxLeases): Promise<number>;
}
export declare class MemoryRateLimitStore implements RateLimitStore {
    /** rateKey -> earliest usable time (ISO-8601). */
    private readonly blocked;
    /** Test helper: force a bucket blocked until `until`. */
    block(rateKey: string, until: string): void;
    blockedUntil(rateKey: string): string | undefined;
    check(input: {
        readonly rateKeys: readonly string[];
        readonly now: string;
    }): Promise<RateLimitCheck>;
    update(input: RateLimitUpdate): Promise<void>;
}
export declare class MemoryDispatchDlq implements DispatchDlq {
    readonly entries: DlqEntry[];
    put(entry: DlqEntry): Promise<void>;
}
/** A scripted response, or a function producing one from the request. */
export type ScriptedResponse = EffectHttpResponse | ((request: EffectHttpRequest) => EffectHttpResponse);
/**
 * Records every request and replays scripted responses in FIFO order. When the
 * script is exhausted it returns `fallback` (default 200 + empty body). Throws if
 * `dispatchShouldNeverRun` is set, to prove dry-run never dispatches.
 */
export declare class MemoryTransport {
    readonly sent: EffectHttpRequest[];
    private readonly script;
    private readonly fallback;
    private readonly guard;
    private readonly stampReceivedAt?;
    constructor(script?: ScriptedResponse[], opts?: {
        readonly fallback?: EffectHttpResponse;
        readonly dispatchShouldNeverRun?: boolean;
        /**
         * When provided, the transport stamps each response's `receivedAt` from
         * this clock — modelling that the OBSERVED time comes from the dispatcher's
         * environment, not the scripted fixture. The codec reads it as `now`.
         */
        readonly clock?: {
            now(): string;
        };
    });
    send(request: EffectHttpRequest): Promise<EffectHttpResponse>;
}
/** Build an EffectHttpResponse from a JSON body + status, for scripting. */
export declare function jsonResponse(status: number, body: unknown, opts?: {
    readonly headers?: readonly [string, string][];
    readonly receivedAt?: string;
}): EffectHttpResponse;
export interface MemoryStores {
    readonly outbox: MemoryOutboxDispatchStore;
    readonly rate: MemoryRateLimitStore;
    readonly dlq: MemoryDispatchDlq;
}
export declare function memoryStores(): MemoryStores;
/** A deterministic clock whose `now` can be advanced by the test. */
export declare class FakeClock {
    private current;
    constructor(current: string);
    now(): string;
    set(iso: string): void;
    advance(seconds: number): void;
}
//# sourceMappingURL=memory.d.ts.map