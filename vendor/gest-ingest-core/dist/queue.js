// @gest/ingest-core / queue + lane lease
//
// Neutral deferred-work and serialization contracts. Provider adapters map
// these onto Durable Objects, SQS FIFO groups, Convex scheduled actions, or an
// external lease. The core does not run the queue; it defines the message shape
// and the lease handshake so platform/runtime code stays provider-agnostic.
import { asJson } from "./json.js";
import { decodeBoolean, decodeIsoTimestamp, decodeNonEmptyString, decodeObject, field, optionalField, fail, ok, } from "./decode.js";
/** Decode a JSON value used as an opaque queue/outbox payload. */
export const decodeJsonPayload = (input, path = "") => {
    const j = asJson(input);
    return j === undefined ? fail(path, "expected JSON-safe value") : ok(j);
};
export const decodeQueueMessage = decodeObject({
    messageId: field(decodeNonEmptyString),
    kind: field(decodeNonEmptyString),
    payload: field(decodeJsonPayload),
    runAfter: optionalField(decodeIsoTimestamp),
    groupKey: optionalField(decodeNonEmptyString),
    causedByRawId: optionalField(decodeNonEmptyString),
});
export const decodeLaneLease = decodeObject({
    subject: field(decodeNonEmptyString),
    holder: field(decodeNonEmptyString),
    fencingToken: field(decodeNonEmptyString),
    acquiredAt: field(decodeIsoTimestamp),
    expiresAt: field(decodeIsoTimestamp),
    held: field(decodeBoolean),
});
//# sourceMappingURL=queue.js.map