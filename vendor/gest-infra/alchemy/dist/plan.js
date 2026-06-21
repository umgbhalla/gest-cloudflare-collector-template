// @gest/infra / alchemy / offline plan + dry build
//
// Produces an Alchemy plan/dry build OFFLINE — without contacting Cloudflare.
//
// WHY a guard: building `Cloudflare.providers()` resolves the auth profile and
// account (real network + credentials). So the live compile is a CREDENTIALED
// action. `hasCloudflareCredentials()` detects whether creds are available; when
// they are absent (the gate's case) we DO NOT build the providers layer. Instead
// we return a credential-free plan derived from the declared topology
// (./topology.ts), which is the same single source of truth the live stack binds
// from. This proves the resource graph + that the Worker binds exactly the
// declared resources, with zero Cloudflare contact.
//
// When credentials ARE present, `compileLiveStack()` evaluates the real stack to
// a CompiledStack so `alchemy deploy` and live tests share one code path.
import { DECLARED_RESOURCES, RESOURCE_BINDING_NAMES, STACK_NAME, WORKER_LIMITS, WORKER_RESOURCE_ID, QUEUE_CONSUMER_SETTINGS, } from "./topology.js";
import { requiredSecretBindings } from "./secrets.js";
/**
 * True when Cloudflare credentials are available to build the providers layer.
 * Honors the common env paths AND an explicit offline override so the gate is
 * deterministic in CI even if a stray profile exists on the runner.
 */
export function hasCloudflareCredentials(read = (name) => process.env[name]) {
    if (read("GEST_ALCHEMY_OFFLINE") === "1")
        return false;
    const token = read("CLOUDFLARE_API_TOKEN") ?? read("CF_API_TOKEN");
    const apiKey = read("CLOUDFLARE_API_KEY") ?? read("CLOUDFLARE_EMAIL");
    return Boolean(token) || Boolean(apiKey);
}
/**
 * Build the OFFLINE plan from the declared topology — no Cloudflare contact, no
 * providers layer, no credentials. This is what the gate runs.
 */
export function offlinePlan(reason = "no Cloudflare credentials (offline gate)", options = {}) {
    const requiredSecrets = options.requiredSecrets ?? requiredSecretBindings({
        ...(options.collector?.platforms === undefined ? {} : { platforms: options.collector.platforms }),
        ...(options.slackOutbound === undefined ? {} : { slackOutbound: options.slackOutbound }),
    });
    const resources = DECLARED_RESOURCES.map((r) => ({
        resourceId: r.resourceId,
        kind: r.kind,
        action: "create",
        ...(r.binding === undefined ? {} : { binding: r.binding }),
        backs: r.backs,
    }));
    return {
        stack: STACK_NAME,
        offline: true,
        reason,
        resources,
        workerResourceBindings: [...RESOURCE_BINDING_NAMES, ...(options.extraBindings ?? [])],
        workerSecretBindings: [...requiredSecrets],
        workerLimits: WORKER_LIMITS,
        queueConsumerSettings: QUEUE_CONSUMER_SETTINGS,
        ...(options.workerMain === undefined ? {} : { workerMain: options.workerMain }),
        extraBindings: [...(options.extraBindings ?? [])],
        ...(options.collector?.id === undefined ? {} : { collectorId: options.collector.id }),
    };
}
/**
 * Validate the plan's load-bearing invariant: the Worker binds EXACTLY the
 * declared resource set, required secrets, and explicit app-owned bindings.
 * Returns the list of problems (empty = ok). Pure; no Cloudflare.
 */
export function validatePlan(plan) {
    const problems = [];
    // Every resource that declares a binding must appear in the Worker's binding
    // set, and the Worker must bind nothing beyond the declared resources/secrets.
    const declaredResourceBindings = new Set(DECLARED_RESOURCES.flatMap((r) => (r.binding ? [r.binding] : [])));
    const workerBindings = new Set([
        ...plan.workerResourceBindings,
        ...plan.workerSecretBindings,
    ]);
    const expected = new Set([
        ...RESOURCE_BINDING_NAMES,
        ...plan.workerSecretBindings,
        ...plan.extraBindings,
    ]);
    for (const b of declaredResourceBindings) {
        if (!plan.workerResourceBindings.includes(b)) {
            problems.push(`declared resource binding "${b}" is not bound to the Worker`);
        }
    }
    for (const b of workerBindings) {
        if (!expected.has(b)) {
            problems.push(`Worker binds "${b}" which is not a declared resource/secret`);
        }
    }
    for (const b of expected) {
        if (!workerBindings.has(b)) {
            problems.push(`expected Worker binding "${b}" is missing from the plan`);
        }
    }
    // The Worker resource itself must be declared.
    if (!plan.resources.some((r) => r.resourceId === WORKER_RESOURCE_ID && r.kind === "Worker")) {
        problems.push("the Worker resource is not declared in the plan");
    }
    // Each of the five resource kinds the deployment requires must be present.
    for (const kind of [
        "R2.Bucket",
        "D1.D1Database",
        "Queue",
        "QueueConsumer",
        "DurableObjectNamespace",
        "Worker",
    ]) {
        if (!plan.resources.some((r) => r.kind === kind)) {
            problems.push(`no ${kind} resource declared`);
        }
    }
    return problems;
}
/**
 * Compile the LIVE stack to a CompiledStack — requires Cloudflare credentials.
 * Imported lazily so the offline path never even loads the providers graph.
 * Throws (fail-loud) if called without credentials.
 */
export async function compileLiveStack() {
    if (!hasCloudflareCredentials()) {
        throw new Error("compileLiveStack requires Cloudflare credentials; use offlinePlan() for the offline gate.");
    }
    const [{ stack }, { Effect }] = await Promise.all([
        import("./stack.js"),
        import("effect"),
    ]);
    return Effect.runPromise(stack);
}
//# sourceMappingURL=plan.js.map