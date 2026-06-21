import type { Json, Platform } from "@gest/ingest-core";
/** The opaque queue payload the fetch handler enqueues and the consumer reads. */
export interface WorkPayload {
    readonly rawId: string;
    readonly nativeKey: string;
    readonly platform: Platform;
    readonly tenant: string;
}
/** Encode a WorkPayload as a core Json value (for QueueMessage.payload). */
export declare function encodeWorkPayload(p: WorkPayload): Json;
/** Decode a WorkPayload back from an opaque Json value; undefined when malformed. */
export declare function decodeWorkPayload(payload: Json): WorkPayload | undefined;
export declare const QUEUE_MESSAGE_KIND = "process-delivery";
export declare const GATEWAY_FRAME_QUEUE_MESSAGE_KIND = "capture-gateway-frame";
export interface GatewayFramePayload {
    readonly rawId: string;
    readonly nativeKey: string;
    readonly tenant: string;
    readonly account: string;
    readonly receivedAt: string;
    readonly body: string;
}
export declare function encodeGatewayFramePayload(p: GatewayFramePayload): Json;
export declare function decodeGatewayFramePayload(payload: Json): GatewayFramePayload | undefined;
/** Stable queue message id for a raw delivery's processing job. */
export declare function jobMessageId(rawId: string): string;
export declare function gatewayFrameMessageId(rawId: string): string;
/** Stable canonical event id for a raw delivery. */
export declare function eventIdFor(rawId: string): string;
/** Stable runtime record id for a raw delivery. */
export declare function recordIdFor(rawId: string): string;
/** Stable outbox id for the n-th proposal of a decision. */
export declare function outboxIdFor(decisionId: string, index: number): string;
//# sourceMappingURL=ids.d.ts.map