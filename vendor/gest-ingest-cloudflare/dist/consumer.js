// @gest/ingest-cloudflare / consumer
//
// Decode a Cloudflare Queue consumer batch into neutral QueueMessages. The
// consumer body (what to DO with a message) is runtime policy and lives outside
// this package; here we only translate the host-native batch envelope into the
// neutral message type and expose ack/retry controls structurally.
import { decodeQueueMessage } from "@gest/ingest-core";
/**
 * Decode a consumer batch. Each `message.body` is expected to be a neutral
 * QueueMessage (the same shape `CloudflareQueue.send` accepted). Bodies that do
 * not decode are surfaced separately so the consumer can dead-letter or drop
 * them; this adapter never guesses platform meaning.
 */
export function decodeBatch(batch) {
    const decoded = [];
    const undecodable = [];
    for (const m of batch.messages) {
        const ack = () => m.ack?.();
        const retry = (delaySeconds) => m.retry?.(delaySeconds === undefined ? undefined : { delaySeconds });
        const result = decodeQueueMessage(m.body);
        if (result.ok) {
            decoded.push({ message: result.value, attempts: m.attempts ?? 1, ack, retry });
        }
        else {
            undecodable.push({
                id: m.id,
                reason: result.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
                ack,
                retry,
            });
        }
    }
    return { queue: batch.queue, decoded, undecodable };
}
//# sourceMappingURL=consumer.js.map