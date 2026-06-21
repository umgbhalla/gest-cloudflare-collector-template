import { type Decoder } from "./decode.js";
/** A row returned by a SqlStorage query. Opaque key/value record. */
export type SqlRow = Readonly<Record<string, unknown>>;
/** The cursor a SqlStorage.exec returns; `toArray()` materializes the rows. */
export interface SqlCursor {
    toArray(): readonly SqlRow[];
}
/**
 * The ONLY storage abstraction. Cloudflare maps it to a Durable Object's
 * `state.storage.sql`; Node maps it to sqlite. A new backend implements this one
 * method — no KV/R2/D1 enum sprawl. Bindings are positional, matching the DO sql
 * API.
 */
export interface SqlStorage {
    exec(query: string, ...bindings: readonly unknown[]): SqlCursor;
}
/**
 * An attempt marker row written BEFORE a lane attempt and deleted on settle
 * (flue's single-flight). `reconcileMarkers` inspects markers: a FRESH marker
 * (within the lease TTL) means an owner is mid-flight -> suppress a re-run; a STALE
 * marker means the owner died -> reclaim. This is the LaneLease lease +
 * attempt-marker contract made concrete and testable.
 */
export interface AttemptMarker {
    /** Lane subject this attempt belongs to. */
    readonly subject: string;
    /** Owner (worker/fiber) that inserted the marker. */
    readonly ownerId: string;
    /** Attempt id; unique per attempt for at-least-once ownership. */
    readonly attemptId: string;
    /** When the marker was inserted (ISO-8601). */
    readonly insertedAt: string;
    /** When the owning lease expires (ISO-8601); past this, the marker is stale. */
    readonly leaseExpiresAt: string;
}
export declare const decodeAttemptMarker: Decoder<AttemptMarker>;
/** True when a marker's lease has NOT yet expired at `now` (owner mid-flight). */
export declare function isMarkerFresh(marker: AttemptMarker, now: string): boolean;
/** Outcome of reconciling the marker set for a subject. */
export interface MarkerReconciliation {
    /** True when a fresh marker exists: a re-run must be suppressed (single-flight). */
    readonly suppressRerun: boolean;
    /** Subjects whose only markers are stale and may be reclaimed. */
    readonly reclaimable: readonly AttemptMarker[];
}
/**
 * Reconcile a marker set at `now`. If ANY marker is fresh, single-flight holds and
 * a re-run is suppressed. Stale markers are returned as reclaimable so a degraded
 * path can reclaim them (bounded double-processing via attempt-id ownership). Pure;
 * no I/O — this is the testable heart of the lease/single-flight contract.
 */
export declare function reconcileMarkers(markers: readonly AttemptMarker[], now: string): MarkerReconciliation;
//# sourceMappingURL=interfaces.d.ts.map