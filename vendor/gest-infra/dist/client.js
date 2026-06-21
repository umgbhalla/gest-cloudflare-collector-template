// @gest/client — the wiring facade (the deep module that stands up a gest Worker)
//
// ONE entry point, `createGest(config)`, returns the fully-wired Cloudflare
// module-Worker handlers ({ fetch, queue, scheduled } + the Durable Object
// classes). It concentrates ALL the assembly that previously lived hand-wired in
// the Worker entry: the four `*DepsFromEnv` builders, the per-platform `secretFor`
// switch, and the runtime-consumer discovery switch. Those are now INTERNAL seams
// of this module — a caller never sees them, never edits an infra switch to plug a
// brain, and never hand-passes a renderer at an effect-encode call site.
//
// Deep module: a SMALL interface (createGest + defineConsumer) over a LARGE hidden
// implementation. The facade ACCEPTS its dependencies (bindings/env are injected
// at handler invocation time, the consumer registry + renderers are injected via
// config) and RETURNS results (the handler object) — it side-effects nothing at
// construction. The smallest surface a caller must know:
//   - `platforms`: per-platform verification secrets (deployment glue; the ack
//     path fails closed when one is missing).
//   - `consumer`: the pluggable decision brain (ADR-0004 runtime boundary),
//     handed in as a `ConsumerRegistry` rather than discovered from an env string.
//   - `renderers`: optional platform -> PlatformMessageRenderer map; the
//     documented extension point for outbound rich rendering (Slack only today).
//   - `selector`: optional `(env) => kind` so a deployment can still pick a
//     registered consumer from its own env without re-introducing a switch here.
//
// This module is the ONLY place permitted to compose platform + provider + cloud +
// renderer; ingest-core / platform / dispatch stay pure (no cloud/provider import).
// Every safety invariant is preserved because the facade reuses the SAME stages
// and the SAME deps-builders the hand-wiring used — it only concentrates them.
import { NoopTracer, } from "@gest/ingest-core";
import { consumerDepsFromEnv, dispatchDepsFromEnv, fetchDepsFromEnv, gatewayRunnerDepsFromEnv, } from "./worker/index.js";
import { ackPath } from "./worker/fetch.js";
import { processBatch } from "./worker/consumer.js";
import { dispatchPass } from "./worker/dispatch.js";
import { defaultRuntimeConsumer, DEFAULT_RUNTIME_CONSUMER_KIND, } from "./runtime.js";
import { LaneDurableObject as InnerLane, } from "./worker/lane-do.js";
import { DiscordGatewayRunner as InnerGateway, } from "./worker/discord-gateway-do.js";
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
export function defineConsumer(kind, source) {
    const build = typeof source === "function"
        ? (consumerEnv) => source(consumerEnv)
        : (_consumerEnv) => source;
    return { kind, build };
}
/**
 * The built-in deliver-only registry: the trivial no-op brain only. This is the
 * safe baseline `createGest` uses when `config.consumer` is omitted — it records
 * that an event was seen and proposes ZERO effects, so nothing is ever sent.
 */
export const DELIVER_ONLY_REGISTRY = {
    consumers: {
        [DEFAULT_RUNTIME_CONSUMER_KIND]: {
            kind: DEFAULT_RUNTIME_CONSUMER_KIND,
            build: () => defaultRuntimeConsumer,
        },
    },
    defaultKind: DEFAULT_RUNTIME_CONSUMER_KIND,
};
/**
 * Resolve a registry + selector + ConsumerEnv to the concrete RuntimeConsumer the
 * queue consumer will drive. Total + fail-safe: an unknown selected kind falls
 * back to `defaultKind` (which MUST be registered), exactly mirroring the old
 * `selectRuntimeConsumer(runtimeConsumerKind(env))` behaviour — minus the switch.
 */
function resolveConsumer(registry, selectedKind, consumerEnv) {
    const def = (selectedKind !== undefined ? registry.consumers[selectedKind] : undefined) ??
        registry.consumers[registry.defaultKind];
    if (def === undefined) {
        throw new Error(`@gest/client: consumer registry is missing its defaultKind "${registry.defaultKind}"`);
    }
    return def.build(consumerEnv);
}
/** The production builders: the real Cloudflare-binding `*DepsFromEnv` family. */
const DEFAULT_DEPS_BUILDERS = {
    fetch: fetchDepsFromEnv,
    consumer: consumerDepsFromEnv,
    dispatch: dispatchDepsFromEnv,
    // gateway's 3rd positional is `now` (defaulted), so it can't be a bare ref: the
    // builder inserts `undefined` for `now` and passes the tracer in 4th position.
    gateway: (env, fetchImpl, tracer) => gatewayRunnerDepsFromEnv(env, fetchImpl, undefined, tracer),
};
const DISCORD_GATEWAY_ADMIN_PATH = "/admin/discord-gateway";
const DISCORD_GATEWAY_BASE_URL = "https://discord.com/api/v10";
// Mirrors @gest/ingest-discord DISCORD_DEFAULT_INTENTS; kept local to avoid
// widening the platform package public API during the deploy-control patch.
const DISCORD_DEFAULT_GATEWAY_INTENTS = 34307;
/**
 * Default selector: read the established `RUNTIME_CONSUMER` env var. Keeping the
 * env var as the default means existing deployments behave identically — the
 * difference is the value is now looked up in the injected registry, not a switch.
 */
function defaultSelector(env) {
    return env.RUNTIME_CONSUMER;
}
/**
 * Bind the global `fetch` to `globalThis`. Cloudflare's global `fetch` throws
 * "Illegal invocation" if called as a bare captured reference; the injected
 * transports call it as a plain function, so it MUST be bound at the isolate
 * boundary. Offline fakes pass their own fetch and never hit this.
 */
function boundGlobalFetch(role) {
    const raw = globalThis.fetch;
    if (raw === undefined) {
        throw new Error(`@gest/client: no global fetch available for the ${role} transport`);
    }
    return raw.bind(globalThis);
}
async function discordGatewayAdmin(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== DISCORD_GATEWAY_ADMIN_PATH)
        return undefined;
    if (request.method !== "POST") {
        return new Response("method not allowed", { status: 405, headers: { allow: "POST" } });
    }
    const adminToken = nonEmptyString(env.DISCORD_GATEWAY_ADMIN_TOKEN);
    if (adminToken === undefined) {
        return new Response("discord gateway admin is not configured", { status: 503 });
    }
    if (!authorizedBearer(request, adminToken)) {
        return new Response("unauthorized", { status: 401 });
    }
    let body;
    try {
        const parsed = JSON.parse(new TextDecoder().decode(await request.arrayBuffer()));
        if (!isRecord(parsed))
            return new Response("expected JSON object", { status: 400 });
        body = parsed;
    }
    catch {
        return new Response("invalid JSON body", { status: 400 });
    }
    const op = nonEmptyString(body.op);
    if (op !== "connect" && op !== "disconnect" && op !== "status") {
        return new Response("bad gateway op", { status: 400 });
    }
    const credentials = isRecord(body.credentials) ? body.credentials : undefined;
    const applicationId = nonEmptyString(body.applicationId) ?? nonEmptyString(credentials?.["applicationId"]);
    if (applicationId === undefined) {
        return new Response("missing applicationId", { status: 400 });
    }
    const tenant = nonEmptyString(body.tenant) ?? nonEmptyString(credentials?.["tenant"]) ?? env.TENANT ?? "default";
    const scope = nonEmptyString(body.scope) ?? "global";
    const objectName = `discord:${tenant}:${applicationId}:${scope}`;
    const stub = env.DISCORD_GATEWAY_DO.get(env.DISCORD_GATEWAY_DO.idFromName(objectName));
    try {
        const control = op === "connect"
            ? connectRequest(body, credentials, applicationId, tenant)
            : { op };
        const result = await stub.fetch("https://gest.internal/admin/discord-gateway", {
            method: "POST",
            body: JSON.stringify(control),
        });
        return Response.json(await result.json());
    }
    catch (error) {
        if (error instanceof Response)
            return error;
        return Response.json({ error: "discord gateway operation failed", detail: errorMessage(error) }, { status: 502 });
    }
}
function errorMessage(error) {
    if (error instanceof Error)
        return redactSecretLike(error.message);
    return redactSecretLike(String(error));
}
function redactSecretLike(value) {
    return value.replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{24,}/g, "[redacted]");
}
function connectRequest(body, credentials, applicationId, tenant) {
    const botToken = nonEmptyString(body.botToken) ?? nonEmptyString(credentials?.["botToken"]);
    if (botToken === undefined)
        throw new Response("missing botToken", { status: 400 });
    const shard = shardPair(body.shard) ?? shardPair(credentials?.["shard"]);
    return {
        op: "connect",
        credentials: {
            botToken,
            applicationId,
            tenant,
            gatewayBaseUrl: nonEmptyString(body.gatewayBaseUrl) ??
                nonEmptyString(credentials?.["gatewayBaseUrl"]) ??
                DISCORD_GATEWAY_BASE_URL,
            intents: nonNegativeInteger(body.intents) ??
                nonNegativeInteger(credentials?.["intents"]) ??
                DISCORD_DEFAULT_GATEWAY_INTENTS,
            ...(shard === undefined ? {} : { shard }),
        },
    };
}
function authorizedBearer(request, expected) {
    const header = headerValue(request, "authorization");
    const prefix = "Bearer ";
    if (header === null || !header.startsWith(prefix))
        return false;
    return timingSafeEqual(header.slice(prefix.length), expected);
}
function headerValue(request, name) {
    let found = null;
    const lower = name.toLowerCase();
    request.headers.forEach((value, key) => {
        if (key.toLowerCase() === lower)
            found = value;
    });
    return found;
}
function timingSafeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyString(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}
function nonNegativeInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
function shardPair(value) {
    if (!Array.isArray(value) || value.length !== 2)
        return undefined;
    const shardId = nonNegativeInteger(value[0]);
    const shardCount = nonNegativeInteger(value[1]);
    if (shardId === undefined || shardCount === undefined || shardCount < 1)
        return undefined;
    return [shardId, shardCount];
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
export function createGest(config = {}) {
    const registry = config.consumer ?? DELIVER_ONLY_REGISTRY;
    const renderers = config.renderers ?? {};
    const selector = config.selector ?? defaultSelector;
    const tracer = config.tracer ?? NoopTracer;
    const builders = config.deps ?? DEFAULT_DEPS_BUILDERS;
    /**
     * The consumer seam, resolved per queue pass from the registry + selector. A
     * fresh ConsumerEnv (renderers + env) is built each pass so a builder always
     * sees the live env; pure builders ignore it, so this stays deterministic.
     */
    function consumerFor(env) {
        return resolveConsumer(registry, selector(env), { renderers, env });
    }
    const handlers = {
        async fetch(request, env, _ctx) {
            const gatewayAdmin = await discordGatewayAdmin(request, env);
            if (gatewayAdmin !== undefined)
                return gatewayAdmin;
            const receivedAt = new Date().toISOString();
            const cfCtx = {
                receivedAt,
                ...(request.cf?.colo === undefined ? {} : { colo: request.cf.colo }),
            };
            const result = await ackPath(request, cfCtx, builders.fetch(env, receivedAt, tracer));
            return new Response(result.body, {
                status: result.status,
                headers: { "content-type": "text/plain; charset=utf-8" },
            });
        },
        async queue(batch, env, _ctx) {
            const now = new Date().toISOString();
            const workerId = `consumer-${now}-${Math.random().toString(36).slice(2, 10)}`;
            const runtime = consumerFor(env);
            const context = {
                reason: "live",
                dryRun: false,
                runtimeVersion: runtime.runtimeVersion,
            };
            // The registry-resolved runtime is the authority: override whatever default
            // the deps-builder selected, so the consumer the developer registered (not
            // an env-string switch) is the one the queue consumer drives. The context's
            // runtimeVersion already matches it, keeping replay comparison honest.
            await processBatch(batch, {
                ...builders.consumer(env, now, workerId, context, tracer),
                runtime,
            });
        },
        async scheduled(_event, env, _ctx) {
            const now = new Date().toISOString();
            const fetchImpl = boundGlobalFetch("dispatch");
            await dispatchPass(builders.dispatch(env, now, fetchImpl, tracer));
        },
    };
    // The lane DO: adapts the real DO fetch(request) to the inner acquire/release.
    class Lane {
        #inner;
        constructor(state, _env) {
            this.#inner = new InnerLane(state);
        }
        async fetch(request) {
            const body = (await request.json());
            if (body.op === "acquire") {
                return Response.json(this.#inner.acquire(body.subject, body.holder, body.ttlSeconds));
            }
            if (body.op === "release") {
                return Response.json({
                    released: this.#inner.release(body.subject, body.holder, body.fencingToken),
                });
            }
            return new Response("bad lane op", { status: 400 });
        }
    }
    // The Discord gateway Runner DO: adapts the real (state, env) ctor + fetch/alarm
    // to the injected-deps inner runner over the bound global fetch transport.
    class DiscordGateway {
        #inner;
        constructor(state, env) {
            const fetchImpl = boundGlobalFetch("gateway");
            this.#inner = new InnerGateway(state, builders.gateway(env, fetchImpl, tracer));
        }
        async fetch(request) {
            const body = (await request.json());
            switch (body.op) {
                case "connect":
                    if (body.credentials === undefined) {
                        return new Response("missing credentials", { status: 400 });
                    }
                    return Response.json(await this.#inner.connect(body.credentials));
                case "disconnect":
                    return Response.json(await this.#inner.disconnect());
                case "status":
                    return Response.json(this.#inner.status());
                default:
                    return new Response("bad gateway op", { status: 400 });
            }
        }
        async alarm() {
            await this.#inner.alarm();
        }
    }
    return { handlers, Lane, DiscordGateway };
}
export function defineCollector(config) {
    const { id, platforms = {}, ...gestConfig } = config;
    return {
        id,
        platforms,
        worker: createGest(gestConfig),
    };
}
//# sourceMappingURL=client.js.map