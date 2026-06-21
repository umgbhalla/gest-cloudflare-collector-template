// @gest/ingest-core / stable outbox id
//
// The single, deterministic derivation of an outbox row's id from a decision's
// proposal. Phase 4 of the Oracle DX strategy needs ONE id function shared by:
//   - `proposalsToOutbox` (via its `idFor` argument), which mints the durable
//     rows the dispatcher reads; and
//   - the DX skin's effect handles (`@gest/tools`, `@gest/bot`), which expose
//     `handle.outboxId` so a LATER proposal in the same decision can sequence
//     after an EARLIER one via `dependsOnOutboxIds`.
//
// Both MUST agree byte-for-byte: a handle's `outboxId` is the same string the
// outbox row will carry, so a `dependsOnOutboxIds` reference resolves to a real
// row. The id is a pure hash of stable, replay-invariant inputs — `decisionId`,
// the proposal's position, its idempotency key, and its request hash — so the
// same decision replayed yields the identical id and the idempotent stores
// collapse duplicates. No wall clock, no counter, no randomness.
/**
 * Derive the stable outbox id for one proposal. PURE: a content hash over the
 * decision id, effect index, idempotency key, and request hash, prefixed `ob_`
 * so the value is recognizable in logs and never collides with another id space.
 * The same inputs always produce the same id, across processes and replays.
 */
export function stableOutboxId(input, hash) {
    return `ob_${hash({
        type: "gest.outbox-id",
        decisionId: input.decisionId,
        effectIndex: input.effectIndex,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
    })}`;
}
/**
 * Convenience wrapper: derive the stable outbox id for a decision's proposal at
 * a given index. This is the EXACT function `proposalsToOutbox` should be handed
 * as its `idFor`, so the durable rows and the DX skin's handles agree byte-for-
 * byte.
 */
export function stableOutboxIdForProposal(decision, proposal, effectIndex, hash) {
    return stableOutboxId({
        decisionId: decision.decisionId,
        effectIndex,
        idempotencyKey: proposal.idempotencyKey,
        requestHash: proposal.requestHash,
    }, hash);
}
//# sourceMappingURL=outbox-id.js.map