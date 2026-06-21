import { type Platform, type ReplayContext, type RuntimeConsumer, type Tracer } from "@gest/ingest-core";
import type { ConsumerEnv as ClientConsumerEnv, ConsumerDefinition as ClientConsumerDefinition, RendererRegistry } from "@gest/client";
import type { CfFetchRequest, CfMessageBatch } from "@gest/ingest-cloudflare";
import type { ExecutionContext, WorkerEnv } from "./env.js";
import type { FetchLike } from "./bindings/transport.js";
import type { GatewayFetch } from "./bindings/discord-gateway-transport.js";
import { type FetchDeps } from "./worker/fetch.js";
import { type ConsumerDeps } from "./worker/consumer.js";
import { type DispatchDeps } from "./worker/dispatch.js";
import type { GatewayRunnerDeps } from "./worker/discord-gateway-do.js";
import { type LaneDurableObjectState } from "./worker/lane-do.js";
import { type GatewayDurableObjectState } from "./worker/discord-gateway-do.js";
/**
 * The environment a consumer builder is handed when the facade instantiates it.
 * It exposes the seams a brain may legitimately need at construction time WITHOUT
 * letting it reach into the cloud bindings: the renderer registry (so a rich
 * consumer renders through the injected, version-pinned renderer rather than
 * hand-passing one) and the raw Worker env (read-only — for a deployment that
 * keys behaviour off its own env vars). It carries NO store/queue/transport: the
 * runtime consumer stays a PURE decision brain (ADR-0004); side effects reach the
 * world only later, through the outbox + dispatcher.
 */
/**
 * The environment a consumer builder is handed at construction. The CONTRACT
 * lives in the @gest/client leaf (so the DX skin can reference it without a
 * project-reference edge up into this cloud-bound facade); here we bind its env
 * type parameter to the concrete {@link WorkerEnv}. Renderers + read-only env;
 * NO store/queue/transport — the consumer stays a pure brain (ADR-0004).
 */
export type ConsumerEnv = ClientConsumerEnv<WorkerEnv>;
/**
 * A registrable consumer (kind + pure builder over {@link ConsumerEnv}). The
 * CONTRACT lives in @gest/client; bound here to {@link WorkerEnv}.
 */
export type ConsumerDefinition = ClientConsumerDefinition<WorkerEnv>;
/**
 * `defineConsumer(...)` — the helper a developer uses to hand their own
 * RuntimeConsumer to `createGest` instead of editing the infra discovery switch.
 * Accepts a ready consumer OR a pure builder over the {@link ConsumerEnv}; in both
 * cases it yields a {@link ConsumerDefinition} the registry can hold.
 *
 * The builder form is how the renderer registry (C3) reaches a rich consumer: the
 * facade calls `build({ renderers, env })`, so the consumer closes over the
 * injected renderer rather than the call site hand-passing one.
 */
export declare function defineConsumer(kind: string, source: RuntimeConsumer | ((consumerEnv: ConsumerEnv) => RuntimeConsumer)): ConsumerDefinition;
/**
 * The consumer registry handed to `createGest`: a map of kind -> definition plus
 * the default kind selected when the selector returns nothing recognized. This
 * REPLACES the hard-coded `RUNTIME_CONSUMER_KINDS` string-switch discovery — a
 * developer adds a brain by registering it here, never by editing infra. The
 * ADR-0004 boundary is unchanged: every registered consumer still satisfies the
 * same core RuntimeConsumer contract; only the discovery seam deepened.
 */
export interface ConsumerRegistry {
    /** Registered consumers by kind. MUST include `defaultKind`. */
    readonly consumers: Readonly<Record<string, ConsumerDefinition>>;
    /**
     * The kind selected when the selector yields an unknown/absent value. Falling
     * back here (never throwing, never silently upgrading into an acting brain) is
     * the same fail-safe the old `runtimeConsumerKind` guard provided.
     */
    readonly defaultKind: string;
}
/**
 * The built-in deliver-only registry: the trivial no-op brain only. This is the
 * safe baseline `createGest` uses when `config.consumer` is omitted — it records
 * that an event was seen and proposes ZERO effects, so nothing is ever sent.
 */
export declare const DELIVER_ONLY_REGISTRY: ConsumerRegistry;
/**
 * Platform -> renderer map injected via `createGest({ renderers })`. Today only
 * the Slack renderer exists, so this is a minimal map with at most one real entry
 * — deliberately NOT a heavyweight abstraction (one adapter is a hypothetical
 * seam, not a real one). It is the documented extension point for the 2nd
 * renderer: register it under its platform key and rich consumers pick it up
 * through the injected {@link ConsumerEnv}, no call-site change.
 *
 * The CONTRACT type lives in the @gest/client leaf and is re-exported here so the
 * DX skin and the facade agree on one definition.
 */
export type { RendererRegistry };
/**
 * The four `*DepsFromEnv` builders as ONE injectable seam. This is the deep
 * module's hidden internal: a deployment NEVER passes it (the defaults wire the
 * real Cloudflare D1/R2/Queue/DO bindings); createGest's OWN tests substitute
 * fake-store-backed builders so the facade can be exercised through the exact
 * handler seam a caller uses, with no real D1. Concentrating the four builders
 * here (not at four call sites in the entry) is the assembly this module owns.
 */
export interface DepsBuilders {
    fetch(env: WorkerEnv, receivedAt: string, tracer: Tracer): FetchDeps;
    consumer(env: WorkerEnv, now: string, workerId: string, context: ReplayContext, tracer: Tracer): ConsumerDeps;
    dispatch(env: WorkerEnv, now: string, fetchImpl: FetchLike, tracer: Tracer): DispatchDeps;
    gateway(env: WorkerEnv, fetchImpl: GatewayFetch, tracer: Tracer): GatewayRunnerDeps;
}
/**
 * The single config a deployment hands `createGest`. Bindings/env are NOT here —
 * they are injected per-invocation by the Cloudflare runtime at the handler
 * surface — so this object is pure deployment policy: which verification secrets,
 * which decision brain, which renderers, how to pick the brain, and the tracer.
 */
export interface GestConfig {
    /**
     * The consumer registry (C2). Defaults to {@link DELIVER_ONLY_REGISTRY} — the
     * safe no-op baseline. Pass a registry built from `defineConsumer(...)` to plug
     * your own brain WITHOUT editing any infra switch.
     */
    readonly consumer?: ConsumerRegistry;
    /**
     * The renderer registry (C3): platform -> PlatformMessageRenderer. Injected into
     * the {@link ConsumerEnv} a consumer builder receives. Defaults to empty.
     */
    readonly renderers?: RendererRegistry;
    /**
     * Pick which registered consumer kind to drive from the bound env. Defaults to
     * reading `env.RUNTIME_CONSUMER` (the established env var). The result is looked
     * up in the registry; an unknown kind falls back to the registry default.
     */
    readonly selector?: (env: WorkerEnv) => string | undefined;
    /**
     * The domain tracer the deployed Worker injects into every stage. Defaults to
     * the NoopTracer so offline construction stays side-effect-free; the real entry
     * passes the native CloudflareTracer.
     */
    readonly tracer?: Tracer;
    /**
     * INTERNAL seam: override the four `*DepsFromEnv` builders. A deployment never
     * sets this — the defaults wire the real Cloudflare bindings. It exists so the
     * facade's own tests can drive the handlers against fake stores (no real D1),
     * crossing the SAME seam a caller does. Not part of the deployment surface.
     */
    readonly deps?: DepsBuilders;
}
/**
 * A Cloudflare module-Worker default export: the `fetch` / `queue` / `scheduled`
 * handlers. This is exactly the object a Worker `export default` needs.
 */
export interface GestWorkerHandlers {
    fetch(request: CfFetchRequest & {
        readonly cf?: {
            readonly colo?: string;
        };
    }, env: WorkerEnv, ctx: ExecutionContext): Promise<Response>;
    queue(batch: CfMessageBatch, env: WorkerEnv, ctx: ExecutionContext): Promise<void>;
    scheduled(event: unknown, env: WorkerEnv, ctx: ExecutionContext): Promise<void>;
}
/**
 * Everything `createGest` returns: the default-export handler object plus the
 * Durable Object classes the runtime instantiates by name. The Worker entry
 * re-exports these; it no longer hand-wires a single dep.
 */
export interface GestHandlers {
    /** The Worker `export default` object. */
    readonly handlers: GestWorkerHandlers;
    /** The lane single-flight Durable Object class (LANE_DO_CLASS). */
    readonly Lane: new (state: LaneDurableObjectState, env: WorkerEnv) => LaneDurableObjectShape;
    /** The Discord gateway Runner Durable Object class (DISCORD_GATEWAY_DO_CLASS). */
    readonly DiscordGateway: new (state: GatewayDurableObjectState, env: WorkerEnv) => DiscordGatewayShape;
}
/** The lane DO surface Cloudflare drives (a JSON `fetch` protocol). */
export interface LaneDurableObjectShape {
    fetch(request: Request): Promise<Response>;
}
/** The gateway DO surface Cloudflare drives (JSON `fetch` control + `alarm`). */
export interface DiscordGatewayShape {
    fetch(request: Request): Promise<Response>;
    alarm(): Promise<void>;
}
export type EnabledPlatformConfig = boolean | {
    readonly webhooks?: boolean;
    readonly gateway?: boolean;
};
export type EnabledPlatforms = Readonly<Partial<Record<Platform, EnabledPlatformConfig>>>;
export interface CollectorConfig extends GestConfig {
    readonly id: string;
    readonly platforms?: EnabledPlatforms;
}
export interface CollectorDefinition {
    readonly id: string;
    readonly platforms: EnabledPlatforms;
    readonly worker: GestHandlers;
}
/**
 * `createGest(config)` — stand up a gest instance in ONE call.
 *
 * It composes platform (verification secrets) + provider (Cloudflare bindings at
 * invocation time) + cloud (the DO classes) + renderer (the registry) behind the
 * four deps-builders, now hidden seams. The returned handlers preserve EVERY
 * safety invariant because each one routes through the exact same stage the
 * hand-wiring used:
 *   - fetch  -> ackPath        (verify-before-parse, redaction, dedupe, ack-fast)
 *   - queue  -> processBatch   (normalize -> journal -> runtime -> outbox-only)
 *   - sched  -> dispatchPass   (outbox-only dispatch + crash-recovery repair)
 * Replay stays side-effect-free; raw stays durable first; no switch is edited to
 * plug a brain or a renderer.
 */
export declare function createGest(config?: GestConfig): GestHandlers;
export declare function defineCollector(config: CollectorConfig): CollectorDefinition;
//# sourceMappingURL=client.d.ts.map