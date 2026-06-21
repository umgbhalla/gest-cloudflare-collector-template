import { type ReplayContext, type Tracer } from "@gest/ingest-core";
import { type FetchLike } from "../bindings/transport.js";
import { defaultRuntimeConsumer } from "../runtime.js";
import { PLATFORM_ROUTES } from "../routing.js";
import type { WorkerEnv } from "../env.js";
import type { FetchDeps } from "./fetch.js";
import type { DispatchDeps } from "./dispatch.js";
import type { ConsumerDeps } from "./consumer.js";
import type { GatewayRunnerDeps } from "./discord-gateway-do.js";
import { type GatewayFetch } from "../bindings/discord-gateway-transport.js";
/** Build the fetch ack-path deps from the bound Cloudflare env. */
export declare function fetchDepsFromEnv(env: WorkerEnv, receivedAt: string, tracer?: Tracer): FetchDeps;
/**
 * Build the queue-consumer deps from the bound env. Wires the D1 raw read, the D1
 * journal, the D1 outbox (consumer enqueue side), the durable delivery gate
 * (claimWork lease at the consumer top), and the D1 message-dedupe store. `now`
 * is the consumer's wall clock; `workerId` is the lease owner.
 */
export declare function consumerDepsFromEnv(env: WorkerEnv, now: string, workerId: string, context?: ReplayContext, tracer?: Tracer): ConsumerDeps;
/**
 * Build the Discord gateway Runner DO deps from the bound env. The DO owns only
 * the outbound socket/session loop and enqueues raw gateway frames; the Worker
 * queue consumer performs raw persistence, delivery dedupe, journal, runtime, and
 * outbox. The real outbound-socket transport (DiscordGatewayTransport) is
 * constructed over the isolate's global fetch with the 401-not-101 workaround.
 *
 * `now` is the DO's wall clock as epoch ms; `isoNow` derives the record
 * timestamps. Both default to the live clock; tests inject deterministic ones.
 */
export declare function gatewayRunnerDepsFromEnv(env: WorkerEnv, fetchImpl: GatewayFetch, now?: () => number, tracer?: Tracer): GatewayRunnerDeps;
/**
 * Build the dispatch-stage deps from the bound env: the D1 dispatch stores
 * (outbox/rate/dlq), the durable delivery gate (repair scan), the Slack codec
 * registry, an EffectHttpTransport over the injected Worker `fetch`, and the
 * Slack credential capability resolving the bot token from the Secrets Store (or
 * the SLACK_BOT_TOKEN env fallback) by the row's opaque credentialRef.
 */
export declare function dispatchDepsFromEnv(env: WorkerEnv, now: string, fetchImpl: FetchLike, tracer?: Tracer): DispatchDeps;
export { PLATFORM_ROUTES, defaultRuntimeConsumer };
//# sourceMappingURL=index.d.ts.map