import { WORKER_LIMITS, QUEUE_CONSUMER_SETTINGS, type DeclaredResource } from "./topology.js";
import { type EnabledPlatforms, type SecretBindingName } from "./secrets.js";
/** One planned resource action in the offline plan. */
export interface OfflinePlanNode {
    readonly resourceId: string;
    readonly kind: DeclaredResource["kind"];
    readonly action: "create";
    readonly binding?: string;
    readonly backs: string;
}
/** The offline plan: declared resources + the Worker's full binding set. */
export interface OfflinePlan {
    readonly stack: string;
    readonly offline: true;
    readonly reason: string;
    readonly resources: readonly OfflinePlanNode[];
    /** The Worker's resource-backed bindings (R2/D1/Queue/DO). */
    readonly workerResourceBindings: readonly string[];
    /** The Worker's required secret env bindings. */
    readonly workerSecretBindings: readonly string[];
    /** Worker runtime limit config applied by the live stack. */
    readonly workerLimits: typeof WORKER_LIMITS;
    /** Queue consumer settings applied by the live stack. */
    readonly queueConsumerSettings: typeof QUEUE_CONSUMER_SETTINGS;
    readonly workerMain?: string;
    readonly extraBindings: readonly string[];
    readonly collectorId?: string;
}
export interface OfflinePlanOptions {
    readonly workerMain?: string;
    readonly collector?: {
        readonly id: string;
        readonly platforms?: EnabledPlatforms;
    };
    readonly extraBindings?: readonly string[];
    readonly requiredSecrets?: readonly SecretBindingName[];
    readonly slackOutbound?: boolean;
}
/**
 * True when Cloudflare credentials are available to build the providers layer.
 * Honors the common env paths AND an explicit offline override so the gate is
 * deterministic in CI even if a stray profile exists on the runner.
 */
export declare function hasCloudflareCredentials(read?: (name: string) => string | undefined): boolean;
/**
 * Build the OFFLINE plan from the declared topology — no Cloudflare contact, no
 * providers layer, no credentials. This is what the gate runs.
 */
export declare function offlinePlan(reason?: string, options?: OfflinePlanOptions): OfflinePlan;
/**
 * Validate the plan's load-bearing invariant: the Worker binds EXACTLY the
 * declared resource set, required secrets, and explicit app-owned bindings.
 * Returns the list of problems (empty = ok). Pure; no Cloudflare.
 */
export declare function validatePlan(plan: OfflinePlan): readonly string[];
/**
 * Compile the LIVE stack to a CompiledStack — requires Cloudflare credentials.
 * Imported lazily so the offline path never even loads the providers graph.
 * Throws (fail-loud) if called without credentials.
 */
export declare function compileLiveStack(): Promise<unknown>;
//# sourceMappingURL=plan.d.ts.map