export interface D1Result<T = Record<string, unknown>> {
    readonly results: readonly T[];
    readonly success: boolean;
    readonly meta?: Record<string, unknown>;
}
export interface D1PreparedStatement {
    bind(...values: readonly unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
export interface D1Database {
    prepare(query: string): D1PreparedStatement;
    /**
     * Run a list of prepared statements as ONE D1 transaction (Cloudflare D1 batch
     * is an implicit transaction that rolls back if any statement fails). This is
     * the atomicity primitive the delivery gate relies on: the dedupe-claim + the
     * delivery_work ledger insert MUST commit (or roll back) together.
     */
    batch<T = Record<string, unknown>>(statements: readonly D1PreparedStatement[]): Promise<readonly D1Result<T>[]>;
}
export interface R2ObjectBody {
    text(): Promise<string>;
}
export interface R2PutOptions {
    readonly httpMetadata?: Record<string, string>;
    readonly customMetadata?: Record<string, string>;
}
export interface R2Bucket {
    put(key: string, value: string | ArrayBuffer | Uint8Array, options?: R2PutOptions): Promise<unknown>;
    get(key: string): Promise<R2ObjectBody | null>;
    head(key: string): Promise<unknown | null>;
}
export interface QueueSendOptions {
    readonly contentType?: string;
    readonly delaySeconds?: number;
}
export interface QueueProducer<Body = unknown> {
    send(message: Body, options?: QueueSendOptions): Promise<void>;
    sendBatch(messages: Iterable<{
        readonly body: Body;
        readonly options?: QueueSendOptions;
    }>): Promise<void>;
}
export interface DurableObjectId {
    toString(): string;
}
export interface DurableObjectStub {
    fetch(input: string, init?: {
        method?: string;
        body?: string;
    }): Promise<{
        json(): Promise<unknown>;
    }>;
}
export interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
}
/**
 * A Cloudflare Secrets Store binding: `get(name)` returns the secret value for a
 * named entry. The dispatcher's EffectCredentialCapability resolves an outbox
 * row's opaque `credentialRef` to a live bot token through THIS binding — the
 * token is never baked into a row, parsed from a rate key, or stored in a core/
 * platform package. The fakes satisfy the same structural shape offline.
 */
export interface SecretsStoreSecret {
    get(): Promise<string>;
}
export interface SecretsStore {
    get(name: string): SecretsStoreSecret;
}
/**
 * The Worker env: the bound Cloudflare resources plus the per-route secrets.
 * Alchemy (in a later phase) declares the resources and produces these bindings;
 * the runtime code here only consumes them.
 */
export interface WorkerEnv {
    readonly RAW_DB: D1Database;
    readonly RAW_BUCKET: R2Bucket;
    readonly WORK_QUEUE: QueueProducer;
    readonly LANE_DO: DurableObjectNamespace;
    /**
     * The Discord gateway Runner DO namespace. The Worker routes a control request
     * to one instance per (tenant, bot) via idFromName; the DO opens the outbound
     * gateway WebSocket and feeds the SAME work queue + delivery gate as webhooks.
     */
    readonly DISCORD_GATEWAY_DO: DurableObjectNamespace;
    /** Per-platform secrets, fail-closed when missing/empty at handler time. */
    readonly SLACK_SIGNING_SECRET?: string;
    readonly GITHUB_WEBHOOK_SECRET?: string;
    readonly DISCORD_PUBLIC_KEY?: string;
    /**
     * Bearer token for the operator-only Discord gateway control route. This only
     * authorizes connect/status/disconnect requests; the Discord bot token is
     * supplied per connect request and is persisted inside the gateway DO.
     */
    readonly DISCORD_GATEWAY_ADMIN_TOKEN?: string;
    readonly TELEGRAM_SECRET_TOKEN?: string;
    readonly TELEGRAM_BOT_ID?: string;
    /**
     * Secrets Store binding the dispatcher's credential capability reads bot tokens
     * from. Optional in the type so the fetch-only handler typechecks without it;
     * the dispatch entry fails closed if it is absent.
     */
    readonly SECRETS?: SecretsStore;
    /**
     * Plain-env fallback for the Slack bot token when no Secrets Store is bound
     * (e.g. local `wrangler dev` with a `.dev.vars`). Read as a Worker secret env;
     * never a literal in source. The capability prefers SECRETS when present.
     */
    readonly SLACK_BOT_TOKEN?: string;
    /** Default tenant for single-tenant routes; multi-tenant resolves per-route. */
    readonly TENANT?: string;
    /**
     * Runtime-consumer selector (the pluggable decision brain behind the queue
     * consumer; ADR-0004 runtime boundary). The reference infra entry only
     * registers `"deliver-only"`; app-owned collectors register their own consumer
     * kinds with `defineCollector` / `defineConsumer`. Unknown/unset values fall
     * back to the registry's safe default. The choice is wiring, not policy:
     * swapping it changes which RuntimeConsumer the consumer stage drives, never
     * the consumer/outbox/dispatch contracts.
     */
    readonly RUNTIME_CONSUMER?: string;
}
/** The execution context a Worker fetch/queue handler receives. */
export interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}
//# sourceMappingURL=env.d.ts.map