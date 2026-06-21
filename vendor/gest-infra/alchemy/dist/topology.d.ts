import { type SecretBindingName } from "./secrets.js";
export declare const STACK_NAME = "gest";
export declare const RAW_BUCKET_RESOURCE_ID = "RawBucket";
export declare const RAW_DB_RESOURCE_ID = "RawDb";
export declare const WORK_QUEUE_RESOURCE_ID = "WorkQueue";
export declare const DLQ_RESOURCE_ID = "WorkDeadLetterQueue";
export declare const LANE_DO_RESOURCE_ID = "Lane";
export declare const DISCORD_GATEWAY_DO_RESOURCE_ID = "DiscordGateway";
export declare const QUEUE_CONSUMER_ID = "WorkQueueConsumer";
export declare const WORKER_RESOURCE_ID = "Worker";
export declare const RAW_BUCKET_BINDING = "RAW_BUCKET";
export declare const RAW_DB_BINDING = "RAW_DB";
export declare const WORK_QUEUE_BINDING = "WORK_QUEUE";
export declare const LANE_DO_BINDING = "LANE_DO";
export declare const DISCORD_GATEWAY_DO_BINDING = "DISCORD_GATEWAY_DO";
/** The Durable Object class the Worker bundle exports (LaneDurableObject). */
export declare const LANE_DO_CLASS = "LaneDurableObject";
/** The Discord gateway Runner Durable Object class the Worker bundle exports. */
export declare const DISCORD_GATEWAY_DO_CLASS = "DiscordGatewayRunner";
/** Where the D1 schema migrations live (relative to the alchemy/ dir). */
export declare const D1_MIGRATIONS_DIR = "migrations";
/**
 * The scheduled (cron) trigger that drives the outbound dispatcher. The Worker's
 * `scheduled` handler (handleScheduled) runs one dispatchPass per tick: claim
 * ready outbox rows -> send via the Slack codec -> record/retry/DLQ, plus the
 * repair scan for ready+unenqueued delivery_work. Every 1 minute keeps Slack
 * retry latency low without hammering the rate buckets (the dispatcher gates on
 * all of a row's rate keys). Cloudflare cron uses standard cron syntax.
 */
export declare const DISPATCH_CRON = "* * * * *";
/**
 * Worker observability: enable Workers Logs + the custom-span TRACES pipeline that
 * the CloudflareTracer feeds (the wrangler `[observability.traces]` block). Each
 * custom span is one event sharing the Workers Logs quota, so the domain spans are
 * HEAD-sampled: TRACE_HEAD_SAMPLING_RATE keeps a fraction of traces to bound cost.
 * 1.0 = keep every trace; lower in a high-volume deploy. The neutral Tracer +
 * span.isTraced gating means an unsampled request pays nothing for attributes.
 */
export declare const TRACE_HEAD_SAMPLING_RATE = 0.05;
/** Worker observability config (logs + custom-span traces), shared by the stack. */
export declare const WORKER_OBSERVABILITY: {
    readonly enabled: true;
    readonly headSamplingRate: 0.05;
    readonly traces: {
        readonly enabled: true;
        readonly headSamplingRate: 0.05;
    };
};
/**
 * Worker runtime limits. This is a safety cap only: memory is fixed by the
 * Workers runtime (128 MB isolate limit) and is not configurable here.
 */
export declare const WORKER_LIMITS: {
    readonly cpuMs: 1000;
};
/** Queue consumer batching/retry settings for gateway stress and live ingest. */
export declare const QUEUE_CONSUMER_SETTINGS: {
    readonly batchSize: 50;
    readonly maxRetries: 3;
    readonly maxWaitTimeMs: 1000;
};
/**
 * The complete set of NON-secret Worker bindings (resource-backed). Used by the
 * offline plan to assert the Worker binds exactly the declared resources.
 */
export declare const RESOURCE_BINDING_NAMES: readonly ["RAW_BUCKET", "RAW_DB", "WORK_QUEUE", "LANE_DO", "DISCORD_GATEWAY_DO"];
export type ResourceBindingName = (typeof RESOURCE_BINDING_NAMES)[number];
/** The full Worker binding name set: resource bindings + secret env bindings. */
export declare const ALL_WORKER_BINDING_NAMES: readonly (ResourceBindingName | SecretBindingName)[];
/**
 * A static, credential-free description of the declared topology: every resource
 * and which Gest hook / runtime stage it backs, plus the Worker's binding set.
 * The offline plan returns this and the gate asserts the Worker references
 * exactly these resources.
 */
export interface DeclaredResource {
    readonly resourceId: string;
    readonly kind: "R2.Bucket" | "D1.D1Database" | "Queue" | "QueueConsumer" | "DurableObjectNamespace" | "Worker";
    /** The Worker binding name, when this resource is bound to the Worker. */
    readonly binding?: ResourceBindingName;
    /** The Gest hook / stage this resource backs. */
    readonly backs: string;
}
export declare const DECLARED_RESOURCES: readonly DeclaredResource[];
//# sourceMappingURL=topology.d.ts.map