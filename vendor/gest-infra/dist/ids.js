// @gest/infra / ids
//
// Deterministic id derivation for the work payload and the canonical/outbox
// artifacts. Every id is derived from stable inputs (rawId, nativeKey, eventId)
// so a retry or a replay produces the SAME ids and the idempotent stores collapse
// duplicates. No wall-clock, no randomness.
/** Encode a WorkPayload as a core Json value (for QueueMessage.payload). */
export function encodeWorkPayload(p) {
    return { rawId: p.rawId, nativeKey: p.nativeKey, platform: p.platform, tenant: p.tenant };
}
/** Decode a WorkPayload back from an opaque Json value; undefined when malformed. */
export function decodeWorkPayload(payload) {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload))
        return undefined;
    const o = payload;
    const rawId = o["rawId"];
    const nativeKey = o["nativeKey"];
    const platform = o["platform"];
    const tenant = o["tenant"];
    if (typeof rawId !== "string" ||
        typeof nativeKey !== "string" ||
        typeof platform !== "string" ||
        typeof tenant !== "string") {
        return undefined;
    }
    return { rawId, nativeKey, platform: platform, tenant };
}
export const QUEUE_MESSAGE_KIND = "process-delivery";
export const GATEWAY_FRAME_QUEUE_MESSAGE_KIND = "capture-gateway-frame";
export function encodeGatewayFramePayload(p) {
    return {
        rawId: p.rawId,
        nativeKey: p.nativeKey,
        tenant: p.tenant,
        account: p.account,
        receivedAt: p.receivedAt,
        body: p.body,
    };
}
export function decodeGatewayFramePayload(payload) {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload))
        return undefined;
    const o = payload;
    const rawId = o["rawId"];
    const nativeKey = o["nativeKey"];
    const tenant = o["tenant"];
    const account = o["account"];
    const receivedAt = o["receivedAt"];
    const body = o["body"];
    if (typeof rawId !== "string" ||
        typeof nativeKey !== "string" ||
        typeof tenant !== "string" ||
        typeof account !== "string" ||
        typeof receivedAt !== "string" ||
        typeof body !== "string") {
        return undefined;
    }
    return { rawId, nativeKey, tenant, account, receivedAt, body };
}
/** Stable queue message id for a raw delivery's processing job. */
export function jobMessageId(rawId) {
    return `job_${rawId}`;
}
export function gatewayFrameMessageId(rawId) {
    return `gw_${rawId}`;
}
/** Stable canonical event id for a raw delivery. */
export function eventIdFor(rawId) {
    return `evt_${rawId}`;
}
/** Stable runtime record id for a raw delivery. */
export function recordIdFor(rawId) {
    return `rec_${rawId}`;
}
/** Stable outbox id for the n-th proposal of a decision. */
export function outboxIdFor(decisionId, index) {
    return `ob_${decisionId}_${index}`;
}
//# sourceMappingURL=ids.js.map