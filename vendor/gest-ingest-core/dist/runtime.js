// @gest/ingest-core / runtime consumer boundary
//
// This is the narrow seam between ingest and ANY downstream runtime. Gest must
// not bake in an agent framework: there is no ep-effect, AxAgent, Claude, or
// OpenAI knowledge here. A runtime consumer receives a normalized event plus a
// replay context and returns decision metadata plus typed effect proposals.
//
// Hard rules this file keeps:
// - Runtime consumers own decisions; the core owns the contract shape only.
// - Effect proposals are NOT dispatched here. They are converted into outbox
//   entries (the only side-effect path) by `proposalsToOutbox`. Dispatch is a
//   separate stage that reads the outbox.
// - In replay/dry-run, `ReplayContext.dryRun` is true; callers must persist the
//   proposals to the outbox for audit but MUST NOT dispatch. The core proves the
//   suppression invariant via `assertNoDispatchInDryRun`.
import {} from "./json.js";
import { decodeArray, decodeBoolean, decodeEnum, decodeNonEmptyString, decodeNonEmptyStringArray, decodeObject, field, optionalField, } from "./decode.js";
import { decodeJsonPayload } from "./queue.js";
import { decodePlatform } from "./platform.js";
import {} from "./event.js";
import {} from "./outbox.js";
/**
 * Why a runtime consumer was invoked. Live processing vs. a replay dry run. The
 * runtime can use this to choose a deterministic path, but the core ALSO uses it
 * to enforce that dry runs never dispatch.
 */
export const REPLAY_REASONS = ["live", "replay", "backfill"];
export const decodeReplayReason = decodeEnum(REPLAY_REASONS);
export const decodeReplayContext = decodeObject({
    reason: field(decodeReplayReason),
    dryRun: field(decodeBoolean),
    runtimeVersion: field(decodeNonEmptyString),
    replayId: optionalField(decodeNonEmptyString),
});
export const decodeEffectProposal = decodeObject({
    platform: field(decodePlatform),
    method: field(decodeNonEmptyString),
    destination: field(decodeNonEmptyString),
    idempotencyKey: field(decodeNonEmptyString),
    rateKey: field(decodeNonEmptyString),
    rateKeys: field(decodeNonEmptyStringArray),
    credentialRef: field(decodeNonEmptyString),
    requestHash: field(decodeNonEmptyString),
    requestBody: field(decodeJsonPayload),
    notBefore: optionalField(decodeNonEmptyString),
    dependsOnOutboxIds: optionalField(decodeArray(decodeNonEmptyString)),
});
export const decodeRuntimeDecision = decodeObject({
    decisionId: field(decodeNonEmptyString),
    runtimeVersion: field(decodeNonEmptyString),
    acted: field(decodeBoolean),
    proposals: field(decodeArray(decodeEffectProposal)),
    metadata: field(decodeJsonPayload),
});
/**
 * Convert a decision's effect proposals into outbox entries. This is the ONLY
 * bridge from "runtime wants to act" to "side effect recorded". It performs no
 * I/O and no dispatch: it returns rows the caller persists. Dispatch is a
 * separate stage that later reads the outbox.
 *
 * The returned entries are always `state: "pending"` with zero attempts, so the
 * fact a proposal was created carries no claim that anything was sent. This is
 * true for live and dry-run alike: dry-run proposals are durable audit rows,
 * dispatch simply never picks them up (see `assertNoDispatchInDryRun`).
 *
 * `effectIndex` is the proposal's position in the decision, giving a stable
 * intra-decision ordering. `rateKeys`/`credentialRef` are carried verbatim;
 * `credentialRef` stays opaque (no token ever appears here).
 */
export function proposalsToOutbox(decision, idFor, context) {
    return decision.proposals.map((p, i) => {
        const entry = {
            outboxId: idFor(p, i),
            idempotencyKey: p.idempotencyKey,
            platform: p.platform,
            tenant: context.tenant,
            account: context.account,
            credentialRef: p.credentialRef,
            method: p.method,
            destination: p.destination,
            rateKey: p.rateKey,
            rateKeys: p.rateKeys,
            requestHash: p.requestHash,
            requestBody: p.requestBody,
            causedById: decision.decisionId,
            effectIndex: i,
            state: "pending",
            attempts: [],
            createdAt: context.createdAt,
            ...(p.notBefore === undefined ? {} : { notBefore: p.notBefore }),
            ...(p.dependsOnOutboxIds === undefined
                ? {}
                : { dependsOnOutboxIds: p.dependsOnOutboxIds }),
        };
        return entry;
    });
}
/**
 * Replay/dry-run safety invariant. Given a context and the set of outbox ids a
 * dispatcher is about to send, this throws if any dispatch is attempted while
 * `dryRun` is true. Call this in the dispatch stage to make the suppression
 * guarantee enforceable, not aspirational.
 */
export function assertNoDispatchInDryRun(context, outboxIdsToDispatch) {
    if (context.dryRun && outboxIdsToDispatch.length > 0) {
        throw new Error(`dry-run dispatch attempted for ${outboxIdsToDispatch.length} outbox entr` +
            `${outboxIdsToDispatch.length === 1 ? "y" : "ies"} (reason=${context.reason}); ` +
            "replay must never send effects");
    }
}
//# sourceMappingURL=runtime.js.map