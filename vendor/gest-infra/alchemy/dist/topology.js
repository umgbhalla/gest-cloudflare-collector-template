// @gest/infra / alchemy / topology
//
// The single source of truth for the deployed Cloudflare topology: resource
// logical ids, Worker binding names, the DO class name, and consumer settings.
// Both the live stack (./stack.ts) and the OFFLINE plan/dry-run (./plan.ts) read
// from here, so "the bound Worker references exactly the resources declared" is a
// checkable fact rather than a hope — the offline gate asserts the Worker's
// binding set equals the declared resource set using THESE names.
//
// No secrets and no cloud logic live here; this is plain deployment metadata.
import { SECRET_BINDING_NAMES } from "./secrets.js";
export const STACK_NAME = "gest";
// Resource logical ids (Alchemy derives physical names from stack/stage/id).
export const RAW_BUCKET_RESOURCE_ID = "RawBucket";
export const RAW_DB_RESOURCE_ID = "RawDb";
export const WORK_QUEUE_RESOURCE_ID = "WorkQueue";
export const DLQ_RESOURCE_ID = "WorkDeadLetterQueue";
export const LANE_DO_RESOURCE_ID = "Lane";
export const DISCORD_GATEWAY_DO_RESOURCE_ID = "DiscordGateway";
export const QUEUE_CONSUMER_ID = "WorkQueueConsumer";
export const WORKER_RESOURCE_ID = "Worker";
// Worker binding names (these MUST match the names WorkerEnv consumes — see
// ../src/env.ts). The fetch ack path + consumer read env.RAW_DB / env.RAW_BUCKET /
// env.WORK_QUEUE / env.LANE_DO under exactly these keys.
export const RAW_BUCKET_BINDING = "RAW_BUCKET";
export const RAW_DB_BINDING = "RAW_DB";
export const WORK_QUEUE_BINDING = "WORK_QUEUE";
export const LANE_DO_BINDING = "LANE_DO";
export const DISCORD_GATEWAY_DO_BINDING = "DISCORD_GATEWAY_DO";
/** The Durable Object class the Worker bundle exports (LaneDurableObject). */
export const LANE_DO_CLASS = "LaneDurableObject";
/** The Discord gateway Runner Durable Object class the Worker bundle exports. */
export const DISCORD_GATEWAY_DO_CLASS = "DiscordGatewayRunner";
/** Where the D1 schema migrations live (relative to the alchemy/ dir). */
export const D1_MIGRATIONS_DIR = "migrations";
/**
 * The scheduled (cron) trigger that drives the outbound dispatcher. The Worker's
 * `scheduled` handler (handleScheduled) runs one dispatchPass per tick: claim
 * ready outbox rows -> send via the Slack codec -> record/retry/DLQ, plus the
 * repair scan for ready+unenqueued delivery_work. Every 1 minute keeps Slack
 * retry latency low without hammering the rate buckets (the dispatcher gates on
 * all of a row's rate keys). Cloudflare cron uses standard cron syntax.
 */
export const DISPATCH_CRON = "* * * * *";
/**
 * Worker observability: enable Workers Logs + the custom-span TRACES pipeline that
 * the CloudflareTracer feeds (the wrangler `[observability.traces]` block). Each
 * custom span is one event sharing the Workers Logs quota, so the domain spans are
 * HEAD-sampled: TRACE_HEAD_SAMPLING_RATE keeps a fraction of traces to bound cost.
 * 1.0 = keep every trace; lower in a high-volume deploy. The neutral Tracer +
 * span.isTraced gating means an unsampled request pays nothing for attributes.
 */
export const TRACE_HEAD_SAMPLING_RATE = 0.05;
/** Worker observability config (logs + custom-span traces), shared by the stack. */
export const WORKER_OBSERVABILITY = {
    enabled: true,
    headSamplingRate: TRACE_HEAD_SAMPLING_RATE,
    traces: {
        enabled: true,
        headSamplingRate: TRACE_HEAD_SAMPLING_RATE,
    },
};
/**
 * Worker runtime limits. This is a safety cap only: memory is fixed by the
 * Workers runtime (128 MB isolate limit) and is not configurable here.
 */
export const WORKER_LIMITS = {
    cpuMs: 1000,
};
/** Queue consumer batching/retry settings for gateway stress and live ingest. */
export const QUEUE_CONSUMER_SETTINGS = {
    batchSize: 50,
    maxRetries: 3,
    maxWaitTimeMs: 1000,
};
/**
 * The complete set of NON-secret Worker bindings (resource-backed). Used by the
 * offline plan to assert the Worker binds exactly the declared resources.
 */
export const RESOURCE_BINDING_NAMES = [
    RAW_BUCKET_BINDING,
    RAW_DB_BINDING,
    WORK_QUEUE_BINDING,
    LANE_DO_BINDING,
    DISCORD_GATEWAY_DO_BINDING,
];
/** The full Worker binding name set: resource bindings + secret env bindings. */
export const ALL_WORKER_BINDING_NAMES = [
    ...RESOURCE_BINDING_NAMES,
    ...SECRET_BINDING_NAMES,
];
export const DECLARED_RESOURCES = [
    {
        resourceId: RAW_BUCKET_RESOURCE_ID,
        kind: "R2.Bucket",
        binding: RAW_BUCKET_BINDING,
        backs: "CloudflareRawStore body blobs (D1R2RawStore, keyed by bodyHash)",
    },
    {
        resourceId: RAW_DB_RESOURCE_ID,
        kind: "D1.D1Database",
        binding: RAW_DB_BINDING,
        backs: "raw metadata + dedupe (delivery+message) + journal + outbox + delivery_work ledger + rate_limit + dispatch_dlq",
    },
    {
        resourceId: WORK_QUEUE_RESOURCE_ID,
        kind: "Queue",
        binding: WORK_QUEUE_BINDING,
        backs: "CloudflareQueue producer (QueuesProducer) — fetch enqueues one job",
    },
    {
        resourceId: DLQ_RESOURCE_ID,
        kind: "Queue",
        backs: "dead-letter sink for messages the consumer exhausts retries on",
    },
    {
        resourceId: LANE_DO_RESOURCE_ID,
        kind: "DurableObjectNamespace",
        binding: LANE_DO_BINDING,
        backs: "CloudflareLane single-flight (LaneDurableObject lease + fencing)",
    },
    {
        resourceId: DISCORD_GATEWAY_DO_RESOURCE_ID,
        kind: "DurableObjectNamespace",
        binding: DISCORD_GATEWAY_DO_BINDING,
        backs: "Discord gateway Runner (DiscordGatewayRunner): outbound WS + alarm heartbeat + " +
            "session SQLite -> enqueue raw gateway frames on the work queue",
    },
    {
        resourceId: QUEUE_CONSUMER_ID,
        kind: "QueueConsumer",
        backs: "the Worker as consumer: normalize -> journal -> runtime -> outbox",
    },
    {
        resourceId: WORKER_RESOURCE_ID,
        kind: "Worker",
        backs: "fetch ack path (verify-before-parse) + queue consumer (claimWork + message dedupe) + " +
            `scheduled dispatcher (cron "${DISPATCH_CRON}": dispatchReady + repair scan)`,
    },
];
//# sourceMappingURL=topology.js.map