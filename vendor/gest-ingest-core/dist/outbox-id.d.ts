import type { HashFn } from "./hash.js";
import type { EffectProposal, RuntimeDecision } from "./runtime.js";
/** The stable inputs an outbox id is derived from. All replay-invariant. */
export interface StableOutboxIdInput {
    /** The decision this proposal belongs to (becomes the row's `causedById`). */
    readonly decisionId: string;
    /** 0-based position of the proposal within the decision. */
    readonly effectIndex: number;
    /** The proposal's idempotency key (platform-owned, deterministic). */
    readonly idempotencyKey: string;
    /** Stable hash of the proposal's request (platform-owned, deterministic). */
    readonly requestHash: string;
}
/**
 * Derive the stable outbox id for one proposal. PURE: a content hash over the
 * decision id, effect index, idempotency key, and request hash, prefixed `ob_`
 * so the value is recognizable in logs and never collides with another id space.
 * The same inputs always produce the same id, across processes and replays.
 */
export declare function stableOutboxId(input: StableOutboxIdInput, hash: HashFn): string;
/**
 * Convenience wrapper: derive the stable outbox id for a decision's proposal at
 * a given index. This is the EXACT function `proposalsToOutbox` should be handed
 * as its `idFor`, so the durable rows and the DX skin's handles agree byte-for-
 * byte.
 */
export declare function stableOutboxIdForProposal(decision: Pick<RuntimeDecision, "decisionId">, proposal: EffectProposal, effectIndex: number, hash: HashFn): string;
//# sourceMappingURL=outbox-id.d.ts.map