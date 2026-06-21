// @gest/infra / worker / dispatch + repair entry
//
// The scheduled/queue dispatch stage — the ONLY outbound side-effect path. It
// drives the provider-neutral dispatch loop (@gest/ingest-dispatch) over the D1
// dispatch stores, with the Slack codec registered, an EffectHttpTransport over
// Worker fetch, and an EffectCredentialCapability that resolves the Slack bot
// token from the Secrets Store by the row's opaque credentialRef.
//
// Cross-cutting by design: only Slack is wired live, but the loop, the stores,
// the transport, and the capability are all platform-neutral — GitHub/Discord/
// Telegram slot in later by registering their codec + resolver, with ZERO
// dispatcher changes.
//
// Also runs a REPAIR SCAN over delivery_work rows with durable queue pointers:
// ready rows (crash before Queue send was confirmed), queued rows that never got
// claimed, and expired processing leases. Re-enqueueing is intentionally
// at-least-once; delivery_work claim leases fence the runtime.
import { SlackEffectCodec } from "@gest/ingest-slack";
import { dispatchReady, } from "@gest/ingest-dispatch";
import { NoopTracer, } from "@gest/ingest-core";
import { ATTR_REPAIRED, SPAN_DISPATCH_PASS, SPAN_REPAIR, } from "../observability/attributes.js";
/** The codec registry for the vertical slice — Slack only, but extensible. */
export const SLACK_CODEC_REGISTRY = {
    slack: SlackEffectCodec,
};
/**
 * Re-enqueue delivery_work rows that need a fresh queue pointer. Idempotent:
 * markEnqueued flips ready->queued, queued rows stay queued, and expired
 * processing rows are re-claimable only after their lease expires.
 */
export async function repairUnenqueued(deps) {
    const tracer = deps.tracer ?? NoopTracer;
    return tracer.enterSpan(SPAN_REPAIR, undefined, async (span) => {
        const now = deps.clock.now();
        const limit = deps.repairLimit ?? 32;
        const unenqueued = await deps.delivery.listRepairable({ now, limit });
        let repaired = 0;
        for (const work of unenqueued) {
            if (work.queueMessage === undefined)
                continue; // no pointer to re-send.
            await deps.queue.send(work.queueMessage);
            await deps.delivery.markEnqueued({ workId: work.workId, now });
            repaired += 1;
        }
        if (span.isTraced)
            span.setAttribute(ATTR_REPAIRED, repaired);
        return repaired;
    });
}
/**
 * Run one dispatch pass + the repair scan. This is the body a scheduled trigger
 * (cron) or a dispatch-queue consumer invokes. Dry-run suppression is preserved:
 * with `options.dryRun`, the loop claims nothing and sends nothing.
 */
export async function dispatchPass(deps) {
    const tracer = deps.tracer ?? NoopTracer;
    return tracer.enterSpan(SPAN_DISPATCH_PASS, undefined, async (span) => {
        const dispatch = await dispatchReady(deps.stores, deps.registry ?? SLACK_CODEC_REGISTRY, deps.transport, deps.credentials, deps.clock, deps.options ?? {});
        const repaired = await repairUnenqueued(deps);
        if (span.isTraced) {
            span.setAttribute("gest.dispatch_claimed", dispatch.claimed);
            span.setAttribute(ATTR_REPAIRED, repaired);
        }
        return { dispatch, repaired };
    });
}
//# sourceMappingURL=dispatch.js.map