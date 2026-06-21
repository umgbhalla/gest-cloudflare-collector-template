import type { Platform, PlatformMessageRenderer, RuntimeConsumer } from "@gest/ingest-core";
/**
 * Platform -> renderer map injected from `createGest({ renderers })`. Pure data:
 * a partial map of the version-pinned, inert {@link PlatformMessageRenderer}s the
 * outbound rich-render path fans out through at encode time. Empty by default.
 */
export type RendererRegistry = Readonly<Partial<Record<Platform, PlatformMessageRenderer>>>;
/**
 * The environment a consumer builder is handed when the facade instantiates it.
 * It exposes the seams a brain may legitimately need at construction time WITHOUT
 * letting it reach into cloud bindings: the renderer registry (so a rich consumer
 * renders through the injected, version-pinned renderer) and the raw deployment
 * env (read-only — for a deployment that keys behaviour off its own env vars). It
 * carries NO store/queue/transport: the consumer stays a PURE decision brain
 * (ADR-0004); side effects reach the world only later, through the outbox.
 *
 * @typeParam Env - the bound deployment env. Defaults to `unknown` so the DX skin
 *   (which only reads `.renderers`) is env-agnostic; @gest/infra uses `WorkerEnv`.
 */
export interface ConsumerEnv<Env = unknown> {
    /** Platform -> renderer map injected from `createGest({ renderers })`. */
    readonly renderers: RendererRegistry;
    /** The bound deployment env, read-only. For env-keyed construction only. */
    readonly env: Env;
}
/**
 * A registrable consumer: a kind plus a pure builder that receives the
 * {@link ConsumerEnv} and returns a {@link RuntimeConsumer}. The builder MUST stay
 * pure — no I/O, no clock, no randomness — so replay determinism holds.
 *
 * @typeParam Env - the bound deployment env handed to `build`.
 */
export interface ConsumerDefinition<Env = unknown> {
    readonly kind: string;
    build(consumerEnv: ConsumerEnv<Env>): RuntimeConsumer;
}
//# sourceMappingURL=index.d.ts.map