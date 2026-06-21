// @gest/infra / bindings / CloudflareQueue
//
// Concrete CloudflareQueue backed by a Cloudflare Queues producer binding. Maps
// the neutral QueueMessage onto Queues `send` / `sendBatch`. A QueueMessage's
// `runAfter` is translated into the Queues `delaySeconds` send option relative to
// the supplied clock, so a deferred message is not delivered early. The body sent
// is the neutral QueueMessage itself, so the consumer's `decodeBatch` round-trips
// it back to the same shape.
/** Compute the Queues delaySeconds for a message's runAfter relative to now. */
function delayFor(message, now) {
    if (message.runAfter === undefined)
        return undefined;
    const deltaMs = Date.parse(message.runAfter) - Date.parse(now);
    if (!Number.isFinite(deltaMs) || deltaMs <= 0)
        return undefined;
    return { delaySeconds: Math.ceil(deltaMs / 1000) };
}
export class QueuesProducer {
    #producer;
    #clock;
    constructor(producer, clock) {
        this.#producer = producer;
        this.#clock = clock;
    }
    async send(message) {
        const now = this.#clock();
        const opts = delayFor(message, now);
        await this.#producer.send(message, opts);
    }
    async sendBatch(messages) {
        const now = this.#clock();
        await this.#producer.sendBatch(messages.map((m) => {
            const options = delayFor(m, now);
            return options === undefined ? { body: m } : { body: m, options };
        }));
    }
}
//# sourceMappingURL=queue.js.map