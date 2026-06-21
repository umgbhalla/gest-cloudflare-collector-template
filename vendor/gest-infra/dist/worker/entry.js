// @gest/infra / worker / entry — the deployable Cloudflare module-Worker entry.
//
// This is the file the Alchemy `Cloudflare.Worker` resource points `main` at. The
// Cloudflare module-Worker contract requires:
//   1. a `default` export with `fetch` / `queue` / `scheduled` handlers, and
//   2. a NAMED export per Durable Object class the runtime instantiates
//      (`new Class(state, env)`).
//
// The ENTIRE assembly now lives behind ONE `createGest(config)` call (the @gest/
// client facade). This entry no longer hand-wires the four `*DepsFromEnv`
// builders, the `secretFor` switch, or the runtime-consumer discovery switch — it
// only declares deployment policy (which consumers are registered, the native
// tracer) and re-exports what createGest returns under the names the topology
// expects. createGest accepts deps (bindings/env injected per invocation) and
// returns results (the handlers); this file is the thin name-binding shim.
import { createGest, defineConsumer } from "../client.js";
import { defaultRuntimeConsumer } from "../runtime.js";
import { CloudflareTracer } from "../observability/tracer.js";
// The deployment's consumer registry (C2). This REPLACES the old
// `RUNTIME_CONSUMER_KINDS` string-switch. The reference entry stays deliver-only:
// it records the event and proposes nothing. A source-SDK user should define an
// app-owned collector/worker entry and register their own consumer there, not make
// @gest/infra depend on a bot/rules example. The selected kind is read from
// `env.RUNTIME_CONSUMER` by createGest's default selector; an unknown value falls
// back to the registry default (deliver-only — never silently an acting brain).
const CONSUMER_REGISTRY = {
    consumers: {
        "deliver-only": defineConsumer("deliver-only", defaultRuntimeConsumer),
    },
    defaultKind: "deliver-only",
};
const gest = createGest({
    consumer: CONSUMER_REGISTRY,
    // Renderer registry (C3) is empty here. App-owned collectors can register
    // renderers next to their own consumers without changing the infra package.
    renderers: {},
    tracer: CloudflareTracer,
});
// ---------------------------------------------------------------------------
// Default export: fetch ack path + queue consumer + scheduled dispatcher, all
// wired by createGest.
// ---------------------------------------------------------------------------
export default gest.handlers;
// ---------------------------------------------------------------------------
// Durable Objects: bound under the class names the topology declares.
// (LANE_DO_CLASS = LaneDurableObject; DISCORD_GATEWAY_DO_CLASS = DiscordGatewayRunner)
// ---------------------------------------------------------------------------
export const Lane = gest.Lane;
export { Lane as LaneDurableObject };
export const DiscordGateway = gest.DiscordGateway;
export { DiscordGateway as DiscordGatewayRunner };
//# sourceMappingURL=entry.js.map