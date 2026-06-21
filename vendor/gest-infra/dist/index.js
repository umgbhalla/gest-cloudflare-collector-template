// @gest/infra
//
// Deployment wiring layer. This is the ONLY layer permitted to import the
// Cloudflare provider adapter (@gest/ingest-cloudflare) AND the platform adapters
// (slack/github/discord/telegram) together to wire a real deployment. The ingest
// packages never depend on infra.
//
// What lives here:
//   - worker/fetch.ts: the verify-before-parse ACK PATH (route -> guard -> read
//     exact bytes -> platform verify+decode -> persist raw -> dedupe -> enqueue ->
//     ack). No runtime consumer, no outbox dispatch.
//   - worker/consumer.ts: the Queue consumer (load raw -> platform normalize ->
//     journal -> runtime consumer -> proposals -> outbox) and the outbox dispatcher
//     (rate-key + idempotency honoring; replay stays side-effect-free).
//   - worker/lane-do.ts: the lane Durable Object (lease + fencing token + TTL +
//     flue-style attempt-marker single-flight).
//   - bindings/*: concrete Cloudflare bindings (D1+R2 raw store, Queues producer,
//     DO lane stub) and an in-memory fake binding set reusing ingest-local.
//   - runtime.ts: the deliver-only default RuntimeConsumer (the safe baseline the
//     @gest/client consumer registry falls back to) so the wiring is runnable with
//     no agent runtime.
//
// NO Alchemy resource declarations live here yet (that is a later phase). This
// package only ships the runtime code + bindings + offline-testable wiring.
// Routing.
export { PLATFORM_ROUTES, platformForPath } from "./routing.js";
// Work payload + deterministic ids.
export { GATEWAY_FRAME_QUEUE_MESSAGE_KIND, QUEUE_MESSAGE_KIND, decodeGatewayFramePayload, decodeWorkPayload, encodeGatewayFramePayload, encodeWorkPayload, eventIdFor, gatewayFrameMessageId, jobMessageId, outboxIdFor, recordIdFor, } from "./ids.js";
// Platform ingest dispatch (the provider+platform meeting point).
export { TELEGRAM_SECRET_HEADER, platformIngest } from "./platform-ingest.js";
// Platform normalize (consumer side).
export { DECODER_VERSIONS, messageDedupeKeyFor, normalizeFromRaw } from "./platform-normalize.js";
// Runtime consumer: the deliver-only default RuntimeConsumer (the safe baseline
// the @gest/client consumer registry falls back to). The concrete brain a
// deployment drives is chosen by the registry (defineConsumer), not a switch here.
export { DEFAULT_RUNTIME_VERSION, defaultRuntimeConsumer, DEFAULT_RUNTIME_CONSUMER_KIND, } from "./runtime.js";
// Worker stages.
export { ackPath } from "./worker/fetch.js";
export { dispatchOutbox, effectResponseHash, processBatch, } from "./worker/consumer.js";
export { LaneDurableObject } from "./worker/lane-do.js";
// Discord gateway Runner Durable Object (outbound WS + alarm + delivery-gate).
export { DiscordGatewayRunner } from "./worker/discord-gateway-do.js";
export { DiscordGatewayTransport } from "./bindings/discord-gateway-transport.js";
export { consumerDepsFromEnv, dispatchDepsFromEnv, fetchDepsFromEnv, gatewayRunnerDepsFromEnv, } from "./worker/index.js";
// Dispatch + repair stage (scheduled / dispatch-queue entry).
export { SLACK_CODEC_REGISTRY, dispatchPass, repairUnenqueued, } from "./worker/dispatch.js";
// Concrete Cloudflare bindings.
export { D1R2RawStore, bodyKey } from "./bindings/raw-store.js";
export { QueuesProducer } from "./bindings/queue.js";
export { DurableObjectLane } from "./bindings/lane.js";
export { D1DeliveryGateStore, D1MessageDedupeStore } from "./bindings/delivery-store.js";
export { D1DispatchDlq, D1OutboxDispatchStore, D1RateLimitStore, } from "./bindings/dispatch-store.js";
export { D1EventJournal } from "./bindings/journal.js";
export { SlackEffectCredentialCapability } from "./bindings/credentials.js";
export { EffectHttpFetchTransport } from "./bindings/transport.js";
// The @gest/client facade: the ONE call (createGest) + defineConsumer that stand
// up a wired Worker (handlers + DO classes) from platform + provider + cloud +
// renderer. Concentrates all assembly; the four deps-builders are its private
// seams. This is the surface the Worker entry uses instead of hand-wiring.
export { createGest, defineCollector, defineConsumer, DELIVER_ONLY_REGISTRY, } from "./client.js";
// Observability: the span-attribute vocabulary the stages attach to DOMAIN spans.
// (The CloudflareTracer itself is NOT exported here — it imports cloudflare:workers
// and is constructed only by the deployed Worker entry, never by the offline test
// import graph. Tests inject NoopTracer from @gest/ingest-core.)
export * from "./observability/attributes.js";
// In-memory fakes (FakeLane/FakeQueue/createFakeBindings) are NOT re-exported
// here: they are offline test doubles with no durability and must not surface on
// the production infra entrypoint. Tests import them from ./bindings/fake.js.
//# sourceMappingURL=index.js.map