import { type Json } from "./json.js";
import { type Decoder } from "./decode.js";
import { type Platform } from "./platform.js";
import { type NormalizedEvent } from "./event.js";
import { type Outbox } from "./outbox.js";
/**
 * Why a runtime consumer was invoked. Live processing vs. a replay dry run. The
 * runtime can use this to choose a deterministic path, but the core ALSO uses it
 * to enforce that dry runs never dispatch.
 */
export declare const REPLAY_REASONS: readonly ["live", "replay", "backfill"];
export type ReplayReason = (typeof REPLAY_REASONS)[number];
/**
 * Replay context handed to the consumer alongside the normalized event. When
 * `dryRun` is true, no effect proposal may be dispatched; it may only be written
 * to the outbox for audit and comparison.
 */
export interface ReplayContext {
    readonly reason: ReplayReason;
    /** True for replay/eval runs: proposals are recorded, never dispatched. */
    readonly dryRun: boolean;
    /** Pinned runtime version for deterministic replay comparison. */
    readonly runtimeVersion: string;
    /** Replay correlation id, when this invocation is part of a replay run. */
    readonly replayId?: string;
}
export declare const decodeReplayReason: Decoder<ReplayReason>;
export declare const decodeReplayContext: Decoder<ReplayContext>;
/**
 * A typed side-effect proposal a runtime consumer wants performed. This is the
 * platform adapter's effect vocabulary: `method` is a native API method or
 * effect kind, `requestBody` is the typed platform payload (opaque to the core).
 * The proposal carries the identity needed to become an outbox row but does NOT
 * itself perform any I/O.
 */
export interface EffectProposal {
    readonly platform: Platform;
    /** Native API method or effect kind, e.g. "chat.postMessage". */
    readonly method: string;
    /** Channel/chat/thread/user/resource the effect targets. */
    readonly destination: string;
    /** Stable effect identity; same intent -> same key (idempotency). */
    readonly idempotencyKey: string;
    /**
     * Legacy single rate-limit bucket. SUPERSEDED by `rateKeys`; kept for
     * back-compat. New consumers populate `rateKeys`.
     * @deprecated use {@link rateKeys}
     */
    readonly rateKey: string;
    /** Rate-limit buckets this effect counts against, platform-owned. */
    readonly rateKeys: readonly string[];
    /**
     * Opaque platform-owned credential/install pointer the dispatcher resolves to
     * a live token via an injected capability. Never a raw token.
     */
    readonly credentialRef: string;
    /** Stable hash of the effect request, for dedupe/replay. */
    readonly requestHash: string;
    /** Typed platform effect payload, opaque to the core. */
    readonly requestBody: Json;
    /** Earliest dispatch/schedule time (ISO-8601), when deferred. */
    readonly notBefore?: string;
    /**
     * Outbox ids (from earlier proposals in the same decision) that must reach a
     * terminal-sent state before this effect dispatches. Ordering hint only; the
     * core records it, the dispatcher enforces it.
     */
    readonly dependsOnOutboxIds?: readonly string[];
}
export declare const decodeEffectProposal: Decoder<EffectProposal>;
/**
 * The output of a runtime consumer: decision metadata the runtime owns plus the
 * typed effect proposals it wants performed. `decisionId` ties proposals back to
 * the decision (becomes the outbox `causedById`). `metadata` is opaque JSON the
 * core stores but never interprets (no agent-framework knowledge).
 */
export interface RuntimeDecision {
    /** Stable id for this decision; used as the outbox caused-by id. */
    readonly decisionId: string;
    /** Runtime version that produced this decision, for replay comparison. */
    readonly runtimeVersion: string;
    /** True when the consumer chose to act; false when it deliberately no-ops. */
    readonly acted: boolean;
    /** Typed effect proposals; empty when the consumer chose not to act. */
    readonly proposals: readonly EffectProposal[];
    /** Opaque decision metadata owned by the runtime consumer. */
    readonly metadata: Json;
}
export declare const decodeRuntimeDecision: Decoder<RuntimeDecision>;
/**
 * The runtime consumer boundary. Implemented OUTSIDE the core (in an app, an
 * eval lab, or an agent runtime). The core only owns this signature so platform
 * adapters and replay can drive any consumer the same way.
 *
 * `consume` MUST be deterministic given the same event + context + version, so
 * replay dry runs are comparable. It returns a decision; it never dispatches.
 */
export interface RuntimeConsumer {
    readonly runtimeVersion: string;
    consume(event: NormalizedEvent, context: ReplayContext): Promise<RuntimeDecision> | RuntimeDecision;
}
/**
 * Tenant/account/clock context a decision's proposals need to become outbox
 * rows. The runtime decision is platform-payload-shaped; the caller supplies the
 * durable-row identity (which tenant/account this decision was made for and the
 * deterministic creation timestamp) at the bridge.
 */
export interface ProposalsToOutboxContext {
    readonly tenant: string;
    readonly account: string;
    /** Deterministic creation timestamp (ISO-8601) stamped on every row. */
    readonly createdAt: string;
}
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
export declare function proposalsToOutbox(decision: RuntimeDecision, idFor: (proposal: EffectProposal, index: number) => string, context: ProposalsToOutboxContext): readonly Outbox[];
/**
 * Replay/dry-run safety invariant. Given a context and the set of outbox ids a
 * dispatcher is about to send, this throws if any dispatch is attempted while
 * `dryRun` is true. Call this in the dispatch stage to make the suppression
 * guarantee enforceable, not aspirational.
 */
export declare function assertNoDispatchInDryRun(context: ReplayContext, outboxIdsToDispatch: readonly string[]): void;
//# sourceMappingURL=runtime.d.ts.map