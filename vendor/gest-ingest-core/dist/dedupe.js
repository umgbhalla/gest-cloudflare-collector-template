// @gest/ingest-core / dedupe
//
// Dedupe claims a native event key within a retention window. Processing is
// at-least-once: a claim is granted once per key; later deliveries of the same
// key are duplicates and must not re-run the runtime consumer by default. The
// native key is computed by the platform adapter (the core never derives it).
//
// MULTI-LAYER IDEMPOTENCY (gest research §"Idempotency = multi-layer, not
// single"): this DedupeClaim is the DELIVERY-LEVEL layer — it dedupes a webhook
// delivery by the platform's delivery identity (e.g. Slack event_id, GitHub
// X-GitHub-Delivery, Telegram update_id, Svix svix-id) with its own retention
// window (e.g. ~1h). It is DISTINCT from message-level dedupe (a platform's
// message id such as WhatsApp `wamid` / `message_id`, a shorter ~5m window) and
// from effect-level idempotency (the outbox `idempotencyKey`). These layers have
// independent keys and TTLs and MUST NOT be merged: a redelivery of the same
// webhook and a re-send of the same logical message are different events. This
// module owns only the delivery layer; message-level dedupe, when a platform
// needs it, is a separate claim the platform adapter derives and the runtime owns.
import { decodeObject, } from "./decode.js";
import { decodeClaimBase, decodeDedupeBase } from "./dedupe-shared.js";
export const decodeDedupeRequest = decodeObject({
    ...decodeDedupeBase,
});
/** True when this claim was a first observation (i.e. not a duplicate). */
export function wasClaimed(claim) {
    return !claim.duplicate;
}
export const decodeDedupeClaim = decodeObject({
    ...decodeClaimBase,
});
//# sourceMappingURL=dedupe.js.map