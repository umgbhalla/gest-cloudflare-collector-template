// @gest/infra / worker / deps-builders
//
// The four `*DepsFromEnv` builders that bind the real Cloudflare env
// (D1/R2/Queues/DO) to the framework-free stage deps (fetch ack-path, queue
// consumer, dispatch, Discord gateway Runner DO). They wire bindings only; all
// policy lives in the stages and the platform adapters. The deployable Worker
// handlers themselves are assembled by `createGest` (client.ts) over these
// builders — this file owns the env->deps binding, not the handler entrypoints.
import { NoopTracer } from "@gest/ingest-core";
import { D1R2RawStore } from "../bindings/raw-store.js";
import { QueuesProducer } from "../bindings/queue.js";
import { D1DeliveryGateStore, D1MessageDedupeStore } from "../bindings/delivery-store.js";
import { D1DispatchDlq, D1OutboxDispatchStore, D1RateLimitStore, } from "../bindings/dispatch-store.js";
import { SlackEffectCredentialCapability } from "../bindings/credentials.js";
import { EffectHttpFetchTransport } from "../bindings/transport.js";
import { D1EventJournal } from "../bindings/journal.js";
import { defaultRuntimeConsumer } from "../runtime.js";
import { PLATFORM_ROUTES } from "../routing.js";
import { hashString } from "@gest/ingest-core";
import { DiscordGatewayTransport, } from "../bindings/discord-gateway-transport.js";
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
function nowEpochSeconds(receivedAt) {
    return Math.floor(Date.parse(receivedAt) / 1000);
}
/** A Clock from a fixed ISO instant (the dispatch loop reads time once per pass). */
function clockOf(iso) {
    return { now: () => iso };
}
/** Build the fetch ack-path deps from the bound Cloudflare env. */
export function fetchDepsFromEnv(env, receivedAt, tracer = NoopTracer) {
    const clock = () => receivedAt;
    const raw = new D1R2RawStore(env.RAW_DB, env.RAW_BUCKET, clock);
    const queue = new QueuesProducer(env.WORK_QUEUE, clock);
    // The durable delivery gate: prepareDelivery claims the delivery dedupe key AND
    // inserts the recoverable delivery_work row in ONE D1 transaction (atomicity).
    const delivery = new D1DeliveryGateStore(env.RAW_DB);
    return {
        stores: { raw, delivery },
        queue,
        tracer,
        secrets: {
            ...(env.SLACK_SIGNING_SECRET === undefined ? {} : { slackSigningSecret: env.SLACK_SIGNING_SECRET }),
            ...(env.GITHUB_WEBHOOK_SECRET === undefined ? {} : { githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET }),
            ...(env.DISCORD_PUBLIC_KEY === undefined ? {} : { discordPublicKeyHex: env.DISCORD_PUBLIC_KEY }),
            ...(env.TELEGRAM_SECRET_TOKEN === undefined ? {} : { telegramSecretToken: env.TELEGRAM_SECRET_TOKEN }),
            ...(env.TELEGRAM_BOT_ID === undefined ? {} : { telegramBotId: env.TELEGRAM_BOT_ID }),
            nowEpochSeconds: nowEpochSeconds(receivedAt),
        },
        secretForPlatform: (platform) => secretFor(env, platform),
        tenantForRequest: () => env.TENANT ?? "default",
        maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
        rawIdFor: (platform, bodyHash) => `raw_${platform}_${hashString(bodyHash).slice(7, 23)}`,
    };
}
function secretFor(env, platform) {
    switch (platform) {
        case "slack":
            return env.SLACK_SIGNING_SECRET;
        case "github":
            return env.GITHUB_WEBHOOK_SECRET;
        case "discord":
            return env.DISCORD_PUBLIC_KEY;
        case "telegram":
            return env.TELEGRAM_SECRET_TOKEN;
    }
}
// ---------------------------------------------------------------------------
// Queue consumer deps
// ---------------------------------------------------------------------------
/**
 * Build the queue-consumer deps from the bound env. Wires the D1 raw read, the D1
 * journal, the D1 outbox (consumer enqueue side), the durable delivery gate
 * (claimWork lease at the consumer top), and the D1 message-dedupe store. `now`
 * is the consumer's wall clock; `workerId` is the lease owner.
 */
export function consumerDepsFromEnv(env, now, workerId, context, tracer = NoopTracer) {
    const clock = () => now;
    const raw = new D1R2RawStore(env.RAW_DB, env.RAW_BUCKET, clock);
    const journal = new D1EventJournal(env.RAW_DB);
    const outbox = new D1OutboxDispatchStore(env.RAW_DB);
    const delivery = new D1DeliveryGateStore(env.RAW_DB);
    const messageDedupe = new D1MessageDedupeStore(env.RAW_DB);
    // The deps-builder seeds the safe deliver-only brain; the @gest/client facade
    // resolves the REGISTERED consumer per queue pass (registry + selector) and
    // overrides this field before processBatch runs (see createGest.queue). The
    // context's runtimeVersion matches whatever runtime ultimately drives the pass,
    // keeping replay comparison honest across the boundary.
    const runtime = defaultRuntimeConsumer;
    const ctx = context ?? { reason: "live", dryRun: false, runtimeVersion: runtime.runtimeVersion };
    return {
        stores: { raw, journal, outbox, delivery, messageDedupe },
        runtime,
        context: ctx,
        clock,
        workerId,
        tracer,
    };
}
// ---------------------------------------------------------------------------
// Discord gateway Runner DO deps
// ---------------------------------------------------------------------------
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
export function gatewayRunnerDepsFromEnv(env, fetchImpl, now = () => Date.now(), tracer = NoopTracer) {
    const isoClock = () => new Date(now()).toISOString();
    const queue = new QueuesProducer(env.WORK_QUEUE, isoClock);
    const transport = new DiscordGatewayTransport({ fetch: fetchImpl });
    return { transport, queue, now, isoNow: isoClock, tracer };
}
// ---------------------------------------------------------------------------
// Dispatch (scheduled / dispatch-queue) deps + handler
// ---------------------------------------------------------------------------
/**
 * Build the dispatch-stage deps from the bound env: the D1 dispatch stores
 * (outbox/rate/dlq), the durable delivery gate (repair scan), the Slack codec
 * registry, an EffectHttpTransport over the injected Worker `fetch`, and the
 * Slack credential capability resolving the bot token from the Secrets Store (or
 * the SLACK_BOT_TOKEN env fallback) by the row's opaque credentialRef.
 */
export function dispatchDepsFromEnv(env, now, fetchImpl, tracer = NoopTracer) {
    const clock = clockOf(now);
    const fnClock = () => now;
    const outbox = new D1OutboxDispatchStore(env.RAW_DB);
    const rate = new D1RateLimitStore(env.RAW_DB, fnClock);
    const dlq = new D1DispatchDlq(env.RAW_DB);
    const delivery = new D1DeliveryGateStore(env.RAW_DB);
    const queue = new QueuesProducer(env.WORK_QUEUE, fnClock);
    const transport = new EffectHttpFetchTransport(fetchImpl, fnClock);
    const credentials = new SlackEffectCredentialCapability({
        ...(env.SECRETS === undefined ? {} : { secrets: env.SECRETS }),
        ...(env.SLACK_BOT_TOKEN === undefined ? {} : { botTokenEnv: env.SLACK_BOT_TOKEN }),
    });
    return {
        stores: { outbox, rate, dlq },
        delivery,
        queue,
        transport,
        credentials,
        clock,
        tracer,
    };
}
export { PLATFORM_ROUTES, defaultRuntimeConsumer };
//# sourceMappingURL=index.js.map