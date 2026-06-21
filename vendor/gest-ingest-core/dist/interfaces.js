// @gest/ingest-core / provider-neutral runtime interfaces
//
// These are the minimal, provider-neutral SHAPES every cloud backend implements
// (mined from flue, see docs/research/provider-integration-ideas.md §1). The core
// owns ONLY the type contracts — no implementation, no cloud SDK, no platform.
// One interface per concern, deliberately tiny so "a new backend = implement this
// interface", not "add a KV/R2/D1 enum branch".
//
//   - SqlStorage:    the ONLY storage abstraction (a sql exec returning rows).
//   - AttemptMarker / single-flight helpers extend the LaneLease contract with the
//     DO attempt-marker semantics (insert-before-attempt, delete-on-settle).
//
// IMPORTANT: importing this file pulls in NO runtime. It is types + two pure
// helpers (`isMarkerFresh`, `reconcileMarkers`) that operate on plain records, so
// the lease/single-flight contract is testable without any cloud.
import { decodeIsoTimestamp, decodeNonEmptyString, decodeObject, field, } from "./decode.js";
export const decodeAttemptMarker = decodeObject({
    subject: field(decodeNonEmptyString),
    ownerId: field(decodeNonEmptyString),
    attemptId: field(decodeNonEmptyString),
    insertedAt: field(decodeIsoTimestamp),
    leaseExpiresAt: field(decodeIsoTimestamp),
});
/** True when a marker's lease has NOT yet expired at `now` (owner mid-flight). */
export function isMarkerFresh(marker, now) {
    return Date.parse(marker.leaseExpiresAt) > Date.parse(now);
}
/**
 * Reconcile a marker set at `now`. If ANY marker is fresh, single-flight holds and
 * a re-run is suppressed. Stale markers are returned as reclaimable so a degraded
 * path can reclaim them (bounded double-processing via attempt-id ownership). Pure;
 * no I/O — this is the testable heart of the lease/single-flight contract.
 */
export function reconcileMarkers(markers, now) {
    const fresh = markers.some((m) => isMarkerFresh(m, now));
    const reclaimable = fresh ? [] : markers.filter((m) => !isMarkerFresh(m, now));
    return { suppressRerun: fresh, reclaimable };
}
//# sourceMappingURL=interfaces.js.map