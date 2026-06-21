import { type QueueMessage } from "@gest/ingest-core";
/** Structural view of a Cloudflare Queue message (no workers-types dependency). */
export interface CfQueueMessage {
    readonly id: string;
    readonly timestamp: Date | string;
    readonly body: unknown;
    readonly attempts?: number;
    ack?(): void;
    retry?(opts?: {
        delaySeconds?: number;
    }): void;
}
/** Structural view of a Cloudflare Queue consumer batch. */
export interface CfMessageBatch {
    readonly queue: string;
    readonly messages: readonly CfQueueMessage[];
}
/** A decoded message paired with its host ack/retry controls. */
export interface DecodedCfMessage {
    readonly message: QueueMessage;
    readonly attempts: number;
    ack(): void;
    retry(delaySeconds?: number): void;
}
/** One message whose body failed neutral decode (poison candidate). */
export interface UndecodableCfMessage {
    readonly id: string;
    readonly reason: string;
    ack(): void;
    retry(delaySeconds?: number): void;
}
export interface DecodedBatch {
    readonly queue: string;
    readonly decoded: readonly DecodedCfMessage[];
    readonly undecodable: readonly UndecodableCfMessage[];
}
/**
 * Decode a consumer batch. Each `message.body` is expected to be a neutral
 * QueueMessage (the same shape `CloudflareQueue.send` accepted). Bodies that do
 * not decode are surfaced separately so the consumer can dead-letter or drop
 * them; this adapter never guesses platform meaning.
 */
export declare function decodeBatch(batch: CfMessageBatch): DecodedBatch;
//# sourceMappingURL=consumer.d.ts.map