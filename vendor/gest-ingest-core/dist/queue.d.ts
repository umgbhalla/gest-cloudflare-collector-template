import { type Json } from "./json.js";
import { type Decoder } from "./decode.js";
/** A unit of deferred processing work. Payload is opaque typed JSON. */
export interface QueueMessage {
    readonly messageId: string;
    /** Work classifier, e.g. "process-delivery" or "dispatch-outbox". */
    readonly kind: string;
    /** Opaque payload the consumer understands; never interpreted by the core. */
    readonly payload: Json;
    /** Earliest time the message should be delivered (ISO-8601). */
    readonly runAfter?: string;
    /** Serialization group; maps to FIFO group / DO id / lease subject. */
    readonly groupKey?: string;
    /** Source raw id for trace correlation, when applicable. */
    readonly causedByRawId?: string;
}
/** Decode a JSON value used as an opaque queue/outbox payload. */
export declare const decodeJsonPayload: Decoder<Json>;
export declare const decodeQueueMessage: Decoder<QueueMessage>;
/**
 * A held lane lease that serializes work by conversation or platform stream.
 * The subject is platform-owned (e.g. a Slack channel or Discord guild stream);
 * the core only tracks ownership, fencing token, and expiry.
 */
export interface LaneLease {
    /** Lane identity, e.g. "slack:T123:C456". Owned by the platform adapter. */
    readonly subject: string;
    /** Holder identity (worker/instance id). */
    readonly holder: string;
    /** Monotonic fencing token to reject stale holders. */
    readonly fencingToken: string;
    /** Lease acquisition time (ISO-8601). */
    readonly acquiredAt: string;
    /** Lease expiry time (ISO-8601). */
    readonly expiresAt: string;
    /** True if the lease was acquired; false means contended/denied. */
    readonly held: boolean;
}
export declare const decodeLaneLease: Decoder<LaneLease>;
//# sourceMappingURL=queue.d.ts.map