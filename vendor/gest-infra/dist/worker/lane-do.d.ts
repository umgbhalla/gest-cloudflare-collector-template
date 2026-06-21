import { type AttemptMarker, type LaneLease, type SqlStorage } from "@gest/ingest-core";
/** Structural Durable Object state surface we depend on (storage.sql + clock). */
export interface LaneDurableObjectState {
    readonly storage: {
        readonly sql: SqlStorage;
    };
}
/**
 * The lane DO. Implements acquire/release over a monotonic fencing token plus the
 * attempt-marker single-flight contract. All clock reads come from the injected
 * `now` so behavior is deterministic in tests.
 */
export declare class LaneDurableObject {
    #private;
    constructor(state: LaneDurableObjectState, now?: () => string);
    /**
     * Acquire or refresh the lease for `subject` held by `holder`. Grants when the
     * subject is free, already held by the same holder (refresh), or the prior lease
     * expired. A contended subject returns held=false with the current holder's lease
     * view. The fencing token is a monotonic per-subject counter so a stale holder is
     * always rejected on release.
     */
    acquire(subject: string, holder: string, ttlSeconds: number): LaneLease;
    /** Release a lease. A stale (non-matching) fencing token is a no-op -> false. */
    release(subject: string, holder: string, fencingToken: string): boolean;
    /**
     * Insert an attempt marker BEFORE running a lane attempt (flue single-flight). If
     * a FRESH marker already exists for the subject the attempt MUST be suppressed
     * (an owner is mid-flight); this returns false and writes nothing. Otherwise it
     * inserts the marker and returns true (the caller owns the attempt).
     */
    beginAttempt(marker: AttemptMarker): boolean;
    /** Delete an attempt marker on settle (success or terminal failure). */
    settleAttempt(subject: string, attemptId: string): void;
    /** Reclaim stale markers (their owners died). Returns the reclaimed markers. */
    reclaimStale(subject: string): readonly AttemptMarker[];
    /** True when a fresh marker exists for the subject (owner mid-flight). */
    hasFreshMarker(subject: string): boolean;
    /**
     * The DO fetch entrypoint speaking the lane JSON protocol the DurableObjectLane
     * binding uses (/acquire, /release). A deployed isolate calls this; in tests the
     * methods above are driven directly.
     */
    fetch(request: {
        url: string;
        json(): Promise<unknown>;
    }): Promise<{
        json(): Promise<unknown>;
    }>;
}
//# sourceMappingURL=lane-do.d.ts.map