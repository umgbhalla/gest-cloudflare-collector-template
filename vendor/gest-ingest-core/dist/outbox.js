// @gest/ingest-core / outbox
//
// The outbox is the ONLY path for external side effects. Every row carries an
// idempotency key, a caused-by id, a destination, a platform rate key, a request
// hash, attempt records, and response metadata. The core promises at-least-once
// dispatch with idempotency; it does NOT claim global exactly-once side effects.
// The request body is opaque typed JSON the platform adapter encoded; the core
// stores it without understanding any platform's API.
import {} from "./json.js";
import { decodeArray, decodeBoolean, decodeEnum, decodeIsoTimestamp, decodeNonEmptyString, decodeNonEmptyStringArray, decodeNonNegativeInt, decodeObject, decodeString, field, optionalField, } from "./decode.js";
import { decodeJsonPayload } from "./queue.js";
import { decodePlatform } from "./platform.js";
/** Lifecycle state of an outbox entry. */
export const OUTBOX_STATES = ["pending", "sending", "sent", "retry", "failed"];
export const decodeOutboxAttempt = decodeObject({
    attempt: field(decodeNonNegativeInt),
    startedAt: field(decodeIsoTimestamp),
    status: optionalField(decodeNonNegativeInt),
    responseHash: optionalField(decodeNonEmptyString),
    rateLimited: optionalField(decodeBoolean),
    retryAfterSeconds: optionalField(decodeNonNegativeInt),
    error: optionalField(decodeString),
});
export const decodeOutboxState = decodeEnum(OUTBOX_STATES);
export const decodeOutbox = decodeObject({
    outboxId: field(decodeNonEmptyString),
    idempotencyKey: field(decodeNonEmptyString),
    platform: field(decodePlatform),
    tenant: field(decodeNonEmptyString),
    account: field(decodeNonEmptyString),
    credentialRef: field(decodeNonEmptyString),
    method: field(decodeNonEmptyString),
    destination: field(decodeNonEmptyString),
    rateKey: field(decodeNonEmptyString),
    rateKeys: field(decodeNonEmptyStringArray),
    requestHash: field(decodeNonEmptyString),
    requestBody: field(decodeJsonPayload),
    causedById: field(decodeNonEmptyString),
    effectIndex: field(decodeNonNegativeInt),
    state: field(decodeOutboxState),
    attempts: field(decodeArray(decodeOutboxAttempt)),
    notBefore: optionalField(decodeIsoTimestamp),
    createdAt: field(decodeIsoTimestamp),
    leaseId: optionalField(decodeNonEmptyString),
    leaseExpiresAt: optionalField(decodeIsoTimestamp),
    dependsOnOutboxIds: optionalField(decodeNonEmptyStringArray),
});
//# sourceMappingURL=outbox.js.map