import type { QueueMessage } from "@gest/ingest-core";
import type { CloudflareQueue } from "@gest/ingest-cloudflare";
import type { QueueProducer } from "../env.js";
export type Clock = () => string;
export declare class QueuesProducer implements CloudflareQueue {
    #private;
    constructor(producer: QueueProducer<QueueMessage>, clock: Clock);
    send(message: QueueMessage): Promise<void>;
    sendBatch(messages: readonly QueueMessage[]): Promise<void>;
}
//# sourceMappingURL=queue.d.ts.map