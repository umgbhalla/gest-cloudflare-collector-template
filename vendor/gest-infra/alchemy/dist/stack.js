// @gest/infra / alchemy / stack
//
// The real Alchemy v2 (Effect-based) stack for the Gest Cloudflare deployment.
// This is the ONLY module that declares cloud resources; the ingest packages
// never depend on it. It binds the ingest-cloudflare provider hooks + the
// platform adapters (wired in ../src/worker) to real Cloudflare primitives:
//
//   R2.Bucket                  RAW_BUCKET   raw body blobs (keyed by bodyHash)
//   D1.D1Database              RAW_DB       raw metadata + dedupe + journal + outbox
//   Queue                      WORK_QUEUE   the ingest work queue (producer binding)
//   Queue (DLQ)                ---          dead-letter sink for the consumer
//   QueueConsumer              ---          the Worker as consumer of WORK_QUEUE
//   DurableObjectNamespace     LANE_DO      the per-subject lane (single-flight)
//   Worker                     gest-ingest  fetch ack path + queue consumer + outbox
//
// The Worker binds R2 + D1 + the Queue producer + DO namespaces, plus the
// platform/admin secrets required by the collector (read from env as Redacted,
// see ./secrets.ts — never hardcoded). The Cloudflare providers() Layer supplies
// every resource provider.
//
// OFFLINE GATE: building Cloudflare.providers() requires real credentials (it
// resolves the auth profile + account). So compiling/deploying this stack is a
// CREDENTIALED action. The offline plan/dry-run (./plan.ts) introspects the
// declared TOPOLOGY (./topology.ts) WITHOUT building the providers layer, so the
// gate runs with no Cloudflare contact. `alchemy deploy` runs this module live.
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { localState } from "alchemy/State";
import * as Effect from "effect/Effect";
import { fileURLToPath } from "node:url";
import { D1_MIGRATIONS_DIR, DISCORD_GATEWAY_DO_BINDING, DISCORD_GATEWAY_DO_CLASS, DISCORD_GATEWAY_DO_RESOURCE_ID, DLQ_RESOURCE_ID, LANE_DO_BINDING, LANE_DO_CLASS, LANE_DO_RESOURCE_ID, QUEUE_CONSUMER_ID, QUEUE_CONSUMER_SETTINGS, RAW_BUCKET_BINDING, RAW_BUCKET_RESOURCE_ID, RAW_DB_BINDING, RAW_DB_RESOURCE_ID, STACK_NAME, WORKER_LIMITS, WORKER_OBSERVABILITY, WORKER_RESOURCE_ID, WORK_QUEUE_BINDING, WORK_QUEUE_RESOURCE_ID, } from "./topology.js";
import { readPlatformSecrets, requiredSecretBindings, } from "./secrets.js";
// Paths are resolved relative to the COMPILED module location
// (infra/alchemy/dist/stack.js), so they hold at deploy time.
/** Absolute path to the deployable Worker entry (default export + DO classes). */
const DEFAULT_WORKER_MAIN = fileURLToPath(new URL("../../dist/worker/entry.js", import.meta.url));
/** Absolute path to the D1 migrations directory (schema applied on deploy). */
const MIGRATIONS_DIR = fileURLToPath(new URL(`../${D1_MIGRATIONS_DIR}`, import.meta.url));
const WEBHOOK_ROUTES = {
    slack: "/webhooks/slack",
    github: "/webhooks/github",
    discord: "/webhooks/discord",
    telegram: "/webhooks/telegram",
};
/**
 * The real stack. `yield* Alchemy.Stack(...)` returns a CompiledStack carrying
 * the declared resources + bindings; `alchemy deploy` applies it. Resource
 * declarations are pure; the side-effecting provider create/update only runs when
 * the providers Layer is built against real credentials.
 */
export function defineGestCloudflareStack(config = {}) {
    const stackName = config.name ?? STACK_NAME;
    const workerMain = config.main ?? DEFAULT_WORKER_MAIN;
    const platforms = config.collector?.platforms;
    const requiredSecrets = requiredSecretBindings({
        ...(platforms === undefined ? {} : { platforms }),
        ...(config.slackOutbound === undefined ? {} : { slackOutbound: config.slackOutbound }),
    });
    const Lane = Cloudflare.DurableObjectNamespace(LANE_DO_RESOURCE_ID, {
        className: LANE_DO_CLASS,
    });
    const DiscordGateway = Cloudflare.DurableObjectNamespace(DISCORD_GATEWAY_DO_RESOURCE_ID, {
        className: DISCORD_GATEWAY_DO_CLASS,
    });
    return Alchemy.Stack(stackName, {
        providers: Cloudflare.providers(),
        // State backend. The default is the Cloudflare-hosted remote state store, but
        // that bootstrap requires a Cloudflare SecretsStore permission (it deploys its
        // own Worker + SecretsStore-encrypted state). When the deploy token is scoped
        // to Workers/D1/R2/Queues only (no SecretsStore), GEST_ALCHEMY_LOCAL_STATE=1
        // selects the filesystem state backend (.alchemy/state), which provisions the
        // SAME application resources without the extra permission.
        state: process.env["GEST_ALCHEMY_LOCAL_STATE"] === "1" ? localState() : Cloudflare.state(),
    }, Effect.gen(function* () {
        // Raw body blobs (keyed by bodyHash). Rejected deliveries store no body.
        const rawBucket = yield* Cloudflare.R2Bucket(RAW_BUCKET_RESOURCE_ID);
        // Raw metadata + both dedupe layers + journal + outbox. The schema is applied
        // from the migrations dir on each deploy (wrangler-compatible ordering).
        const rawDb = yield* Cloudflare.D1Database(RAW_DB_RESOURCE_ID, {
            migrationsDir: MIGRATIONS_DIR,
        });
        // The ingest work queue (producer binding on the Worker) and its dead-letter
        // queue for messages the consumer exhausts retries on.
        const workQueue = yield* Cloudflare.Queue(WORK_QUEUE_RESOURCE_ID);
        const deadLetter = yield* Cloudflare.Queue(DLQ_RESOURCE_ID);
        // The Worker: the fetch ack path + (deployed) queue consumer + outbox. It
        // binds the resources declared above, explicit app-owned bindings, and the
        // platform/admin secrets required by the collector.
        const worker = yield* Cloudflare.Worker(WORKER_RESOURCE_ID, {
            main: workerMain,
            compatibility: { date: "2026-01-28", flags: ["nodejs_compat"] },
            // Workers Logs + the custom-span TRACES pipeline the CloudflareTracer feeds
            // ([observability.traces] enabled + head_sampling_rate). The domain stages
            // emit native spans via the neutral Tracer; head sampling bounds cost.
            observability: WORKER_OBSERVABILITY,
            limits: WORKER_LIMITS,
            bindings: {
                [RAW_BUCKET_BINDING]: rawBucket,
                [RAW_DB_BINDING]: rawDb,
                [WORK_QUEUE_BINDING]: workQueue,
                [LANE_DO_BINDING]: Lane,
                [DISCORD_GATEWAY_DO_BINDING]: DiscordGateway,
                ...(config.extraBindings ?? {}),
            },
            env: secretEnv(requiredSecrets),
        });
        // Register the Worker as the consumer of the work queue, with the DLQ as the
        // poison sink. The consumer runs normalization + the runtime consumer + the
        // outbox; the fetch path only acks. (Producer + consumer are the SAME Worker.)
        const consumer = yield* Cloudflare.QueueConsumer(QUEUE_CONSUMER_ID, {
            queueId: workQueue.queueId,
            scriptName: worker.workerName,
            deadLetterQueue: deadLetter.queueName,
            settings: QUEUE_CONSUMER_SETTINGS,
        });
        return {
            collectorId: config.collector?.id ?? stackName,
            worker: {
                name: worker.workerName,
                url: worker.url,
                main: workerMain,
            },
            webhooks: webhookUrls(worker.url, platforms),
            admin: {
                discordGateway: {
                    url: worker.url + "/admin/discord-gateway",
                    authSecret: "DISCORD_GATEWAY_ADMIN_TOKEN",
                },
            },
            bindings: {
                RAW_BUCKET: { binding: RAW_BUCKET_BINDING, bucketName: rawBucket.bucketName },
                RAW_DB: { binding: RAW_DB_BINDING, databaseId: rawDb.databaseId },
                WORK_QUEUE: { binding: WORK_QUEUE_BINDING, queueId: workQueue.queueId },
                WORK_DEAD_LETTER_QUEUE: { queueId: deadLetter.queueId },
                LANE_DO: { binding: LANE_DO_BINDING, className: LANE_DO_CLASS },
                DISCORD_GATEWAY_DO: {
                    binding: DISCORD_GATEWAY_DO_BINDING,
                    className: DISCORD_GATEWAY_DO_CLASS,
                },
            },
            secrets: {
                required: requiredSecrets,
            },
            consumer: consumer.consumerId,
        };
    }));
}
export const stack = defineGestCloudflareStack();
/** The required platform/admin secrets as a Worker `env` map of Redacted values. */
function secretEnv(required) {
    return readPlatformSecrets((name) => process.env[name], required);
}
function webhookUrls(workerUrl, platforms) {
    // ponytail: keep the public handle simple; replace this with an Alchemy Output
    // combinator only if deployed output rendering proves these URLs are not resolved.
    const out = {};
    for (const [platform, route] of Object.entries(WEBHOOK_ROUTES)) {
        const enabled = platforms === undefined ? true : platformEnabled(platforms[platform]);
        if (enabled)
            out[platform] = workerUrl + route;
    }
    return out;
}
function platformEnabled(input) {
    if (input === true)
        return true;
    if (input === false || input === undefined)
        return false;
    return input.webhooks === true || input.gateway === true;
}
export default stack;
//# sourceMappingURL=stack.js.map