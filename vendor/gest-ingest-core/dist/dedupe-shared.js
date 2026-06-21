// @gest/ingest-core / dedupe field-decoder plumbing (PRIVATE)
//
// Shared PRIVATE field-spec fragments behind the two DISTINCT dedupe layers'
// request/claim decoders. This module is NOT re-exported from index.ts: it shares
// only the boring field-decode mechanics ({key, rawId, now, retentionSeconds} for
// a request, {key, duplicate, firstRawId, claimedAt} for a claim) that the
// delivery-level (./dedupe.ts) and message-level (./delivery.ts) decoders happen
// to have in common. The two layers keep separate PUBLIC types, names, stores,
// keys, and TTLs — this file never merges those seams, it only removes copy-paste
// in the field list each `decodeObject` shape spreads.
import { decodeBoolean, decodeIsoTimestamp, decodeNonEmptyString, decodeNonNegativeInt, field, optionalField, } from "./decode.js";
/** Request base: {key, rawId, now, retentionSeconds}. Spread into a shape spec. */
export const decodeDedupeBase = {
    key: field(decodeNonEmptyString),
    rawId: field(decodeNonEmptyString),
    now: field(decodeIsoTimestamp),
    retentionSeconds: field(decodeNonNegativeInt),
};
/** Claim base: {key, duplicate, firstRawId?, claimedAt?}. Spread into a shape spec. */
export const decodeClaimBase = {
    key: field(decodeNonEmptyString),
    duplicate: field(decodeBoolean),
    firstRawId: optionalField(decodeNonEmptyString),
    claimedAt: optionalField(decodeIsoTimestamp),
};
//# sourceMappingURL=dedupe-shared.js.map