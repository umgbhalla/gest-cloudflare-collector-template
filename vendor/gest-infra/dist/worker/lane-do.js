// @gest/infra / worker / lane Durable Object
//
// A Durable Object implementing the core CloudflareLane contract (acquire/release)
// with a fencing token + TTL, plus the flue-style lease + attempt-marker
// single-flight semantics from @gest/ingest-core (AttemptMarker / reconcileMarkers
// / isMarkerFresh). One DO instance per lane subject (the Worker routes via
// idFromName(subject)), so the DO's single-threaded execution IS the serialization
// point for a conversation/account stream.
//
// Storage: a single SqlStorage-style table (the only storage abstraction the core
// mandates). Two row kinds keyed by subject:
//   - the LEASE row: holder + monotonic fencing token + expiry.
//   - ATTEMPT MARKER rows: inserted BEFORE an attempt, deleted on settle. A FRESH
//     marker means an owner is mid-flight (suppress re-run); STALE markers are
//     reclaimable. reconcileMarkers (pure, in core) is the testable heart.
//
// This file declares the DO STRUCTURALLY (no @cloudflare/workers-types at compile
// time) so it typechecks offline; a deployed isolate satisfies the same shapes.
import { isMarkerFresh, reconcileMarkers, } from "@gest/ingest-core";
/**
 * The lane DO. Implements acquire/release over a monotonic fencing token plus the
 * attempt-marker single-flight contract. All clock reads come from the injected
 * `now` so behavior is deterministic in tests.
 */
export class LaneDurableObject {
    #sql;
    #now;
    #initialized = false;
    constructor(state, now = () => new Date().toISOString()) {
        this.#sql = state.storage.sql;
        this.#now = now;
    }
    #init() {
        if (this.#initialized)
            return;
        this.#sql.exec("CREATE TABLE IF NOT EXISTS lane_lease (subject TEXT PRIMARY KEY, holder TEXT, fencing_token TEXT, acquired_at TEXT, expires_at TEXT, counter INTEGER)");
        this.#sql.exec("CREATE TABLE IF NOT EXISTS lane_marker (subject TEXT, owner_id TEXT, attempt_id TEXT, inserted_at TEXT, lease_expires_at TEXT, PRIMARY KEY (subject, attempt_id))");
        this.#initialized = true;
    }
    /**
     * Acquire or refresh the lease for `subject` held by `holder`. Grants when the
     * subject is free, already held by the same holder (refresh), or the prior lease
     * expired. A contended subject returns held=false with the current holder's lease
     * view. The fencing token is a monotonic per-subject counter so a stale holder is
     * always rejected on release.
     */
    acquire(subject, holder, ttlSeconds) {
        this.#init();
        const now = this.#now();
        const nowMs = Date.parse(now);
        const existing = this.#leaseRow(subject);
        const counter = this.#counter(subject);
        if (existing && Date.parse(existing.expires_at) > nowMs && existing.holder !== holder) {
            return {
                subject,
                holder: existing.holder,
                fencingToken: existing.fencing_token,
                acquiredAt: existing.acquired_at,
                expiresAt: existing.expires_at,
                held: false,
            };
        }
        const nextCounter = counter + 1;
        const fencingToken = `${subject}#${nextCounter}`;
        const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
        this.#sql.exec("INSERT INTO lane_lease (subject, holder, fencing_token, acquired_at, expires_at, counter) VALUES (?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(subject) DO UPDATE SET holder=excluded.holder, fencing_token=excluded.fencing_token, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at, counter=excluded.counter", subject, holder, fencingToken, now, expiresAt, nextCounter);
        return { subject, holder, fencingToken, acquiredAt: now, expiresAt, held: true };
    }
    /** Release a lease. A stale (non-matching) fencing token is a no-op -> false. */
    release(subject, holder, fencingToken) {
        this.#init();
        const existing = this.#leaseRow(subject);
        if (!existing || existing.holder !== holder || existing.fencing_token !== fencingToken) {
            return false;
        }
        // Vacate the lease WITHOUT dropping the row: blank the holder + token and force
        // the expiry into the past so the subject is immediately free, but PRESERVE the
        // monotonic counter so the next acquire mints a strictly-greater fencing token
        // (a stale holder that reacquired the deleted subject must never collide).
        this.#sql.exec("UPDATE lane_lease SET holder = '', fencing_token = '', expires_at = ? WHERE subject = ?", "1970-01-01T00:00:00.000Z", subject);
        return true;
    }
    /**
     * Insert an attempt marker BEFORE running a lane attempt (flue single-flight). If
     * a FRESH marker already exists for the subject the attempt MUST be suppressed
     * (an owner is mid-flight); this returns false and writes nothing. Otherwise it
     * inserts the marker and returns true (the caller owns the attempt).
     */
    beginAttempt(marker) {
        this.#init();
        const now = this.#now();
        const markers = this.#markers(marker.subject);
        const { suppressRerun } = reconcileMarkers(markers, now);
        if (suppressRerun)
            return false;
        this.#sql.exec("INSERT OR REPLACE INTO lane_marker (subject, owner_id, attempt_id, inserted_at, lease_expires_at) VALUES (?, ?, ?, ?, ?)", marker.subject, marker.ownerId, marker.attemptId, marker.insertedAt, marker.leaseExpiresAt);
        return true;
    }
    /** Delete an attempt marker on settle (success or terminal failure). */
    settleAttempt(subject, attemptId) {
        this.#init();
        this.#sql.exec("DELETE FROM lane_marker WHERE subject = ? AND attempt_id = ?", subject, attemptId);
    }
    /** Reclaim stale markers (their owners died). Returns the reclaimed markers. */
    reclaimStale(subject) {
        this.#init();
        const now = this.#now();
        const { reclaimable } = reconcileMarkers(this.#markers(subject), now);
        for (const m of reclaimable) {
            this.#sql.exec("DELETE FROM lane_marker WHERE subject = ? AND attempt_id = ?", m.subject, m.attemptId);
        }
        return reclaimable;
    }
    /** True when a fresh marker exists for the subject (owner mid-flight). */
    hasFreshMarker(subject) {
        this.#init();
        const now = this.#now();
        return this.#markers(subject).some((m) => isMarkerFresh(m, now));
    }
    /**
     * The DO fetch entrypoint speaking the lane JSON protocol the DurableObjectLane
     * binding uses (/acquire, /release). A deployed isolate calls this; in tests the
     * methods above are driven directly.
     */
    async fetch(request) {
        const body = (await request.json());
        const op = body["op"];
        if (op === "acquire") {
            const lease = this.acquire(String(body["subject"]), String(body["holder"]), Number(body["ttlSeconds"]));
            return jsonResponse(lease);
        }
        if (op === "release") {
            const released = this.release(String(body["subject"]), String(body["holder"]), String(body["fencingToken"]));
            return jsonResponse({ released });
        }
        return jsonResponse({ error: "unknown op" });
    }
    #leaseRow(subject) {
        const rows = this.#sql
            .exec("SELECT subject, holder, fencing_token, acquired_at, expires_at FROM lane_lease WHERE subject = ?", subject)
            .toArray();
        return rows.length === 0 ? undefined : rows[0];
    }
    #counter(subject) {
        const rows = this.#sql.exec("SELECT counter FROM lane_lease WHERE subject = ?", subject).toArray();
        if (rows.length === 0)
            return 0;
        const c = rows[0]["counter"];
        return typeof c === "number" ? c : 0;
    }
    #markers(subject) {
        const rows = this.#sql
            .exec("SELECT subject, owner_id, attempt_id, inserted_at, lease_expires_at FROM lane_marker WHERE subject = ?", subject)
            .toArray();
        return rows.map((r) => {
            const row = r;
            return {
                subject: row.subject,
                ownerId: row.owner_id,
                attemptId: row.attempt_id,
                insertedAt: row.inserted_at,
                leaseExpiresAt: row.lease_expires_at,
            };
        });
    }
}
function jsonResponse(value) {
    return { json: () => Promise.resolve(value) };
}
//# sourceMappingURL=lane-do.js.map