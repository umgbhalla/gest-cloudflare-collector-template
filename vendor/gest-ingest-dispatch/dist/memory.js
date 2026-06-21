// @gest/ingest-dispatch / in-memory reference stores + transport
//
// REFERENCE / TEST ONLY. Deterministic in-memory implementations of the dispatch
// store contracts plus a scripted transport, so the generic loop is fully
// testable offline with no platform, provider, fetch, or env. Not for production:
// "atomicity" here is single-threaded JS turn atomicity, which is sufficient to
// prove the loop's ordering and verdict handling.
let seq = 0;
function leaseToken() {
    seq += 1;
    return `lease-${seq}`;
}
function addSeconds(iso, seconds) {
    return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}
function lte(a, b) {
    return new Date(a).getTime() <= new Date(b).getTime();
}
export class MemoryOutboxDispatchStore {
    rows = new Map();
    /** Seed a row. `attempts` defaults to []; `state` defaults to "pending". */
    add(outbox) {
        this.rows.set(outbox.outboxId, { ...outbox });
    }
    /** Read-only snapshot for assertions. */
    get(outboxId) {
        const r = this.rows.get(outboxId);
        return r ? { ...r } : undefined;
    }
    all() {
        return [...this.rows.values()].map((r) => ({ ...r }));
    }
    async claimReady(input) {
        const platforms = input.platforms ? new Set(input.platforms) : undefined;
        const ready = [...this.rows.values()]
            .filter((r) => r.state === "pending" || r.state === "retry")
            .filter((r) => r.notBefore === undefined || lte(r.notBefore, input.now))
            // Phase-4 sequencing: a row with unmet `dependsOnOutboxIds` is held back
            // until EVERY dependency has reached terminal `sent`. A missing or non-sent
            // dependency keeps the row unclaimable (it is not dispatched or dropped).
            .filter((r) => this.dependenciesSent(r))
            .filter((r) => platforms === undefined || platforms.has(r.platform))
            // Deterministic order: (createdAt, causedById, effectIndex).
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) ||
            a.causedById.localeCompare(b.causedById) ||
            a.effectIndex - b.effectIndex)
            .slice(0, input.limit);
        const claimed = [];
        for (const r of ready) {
            const leaseId = leaseToken();
            const leaseExpiresAt = addSeconds(input.now, input.leaseSeconds);
            const attemptNumber = r.attempts.length + 1;
            r.state = "sending";
            r.leaseId = leaseId;
            r.leaseExpiresAt = leaseExpiresAt;
            claimed.push({ ...r, leaseId, leaseExpiresAt, attemptNumber });
        }
        return claimed;
    }
    /** True when every `dependsOnOutboxIds` entry exists and is terminal `sent`. */
    dependenciesSent(row) {
        const deps = row.dependsOnOutboxIds;
        if (deps === undefined || deps.length === 0)
            return true;
        for (const id of deps) {
            const dep = this.rows.get(id);
            if (dep === undefined || dep.state !== "sent")
                return false;
        }
        return true;
    }
    async recordDispatchDecision(input) {
        const r = this.rows.get(input.outboxId);
        if (r === undefined)
            return;
        // Fencing: a stale/expired lease must not mutate the row.
        if (r.leaseId !== input.leaseId)
            return;
        r.attempts = [...r.attempts, input.attempt];
        r.state = input.nextState;
        delete r.leaseId;
        delete r.leaseExpiresAt;
        if (input.nextState === "retry") {
            if (input.notBefore !== undefined)
                r.notBefore = input.notBefore;
        }
        else {
            delete r.notBefore;
        }
    }
    async reapExpiredLeases(input) {
        let reaped = 0;
        for (const r of this.rows.values()) {
            if (reaped >= input.limit)
                break;
            if (r.state !== "sending")
                continue;
            if (r.leaseExpiresAt !== undefined && lte(r.leaseExpiresAt, input.now)) {
                r.state = "retry";
                delete r.leaseId;
                delete r.leaseExpiresAt;
                reaped += 1;
            }
        }
        return reaped;
    }
}
// ---------------------------------------------------------------------------
// In-memory rate-limit store
// ---------------------------------------------------------------------------
export class MemoryRateLimitStore {
    /** rateKey -> earliest usable time (ISO-8601). */
    blocked = new Map();
    /** Test helper: force a bucket blocked until `until`. */
    block(rateKey, until) {
        this.blocked.set(rateKey, until);
    }
    blockedUntil(rateKey) {
        return this.blocked.get(rateKey);
    }
    async check(input) {
        for (const key of input.rateKeys) {
            const until = this.blocked.get(key);
            if (until !== undefined && new Date(until).getTime() > new Date(input.now).getTime()) {
                return { allowed: false, blockedUntil: until, blockedRateKey: key };
            }
        }
        return { allowed: true };
    }
    async update(input) {
        const existing = this.blocked.get(input.rateKey);
        // Keep the latest (most restrictive) block time.
        if (existing === undefined || new Date(input.notBefore).getTime() > new Date(existing).getTime()) {
            this.blocked.set(input.rateKey, input.notBefore);
        }
    }
}
// ---------------------------------------------------------------------------
// In-memory DLQ
// ---------------------------------------------------------------------------
export class MemoryDispatchDlq {
    entries = [];
    async put(entry) {
        this.entries.push(entry);
    }
}
/**
 * Records every request and replays scripted responses in FIFO order. When the
 * script is exhausted it returns `fallback` (default 200 + empty body). Throws if
 * `dispatchShouldNeverRun` is set, to prove dry-run never dispatches.
 */
export class MemoryTransport {
    sent = [];
    script;
    fallback;
    guard;
    stampReceivedAt;
    constructor(script = [], opts = {}) {
        this.script = [...script];
        this.guard = opts.dispatchShouldNeverRun === true;
        if (opts.clock)
            this.stampReceivedAt = () => opts.clock.now();
        this.fallback =
            opts.fallback ?? {
                status: 200,
                headers: [],
                body: new Uint8Array(),
                bodyHash: "empty",
                receivedAt: new Date(0).toISOString(),
            };
    }
    async send(request) {
        if (this.guard) {
            throw new Error("MemoryTransport.send called while dispatch was asserted to never run");
        }
        this.sent.push(request);
        const next = this.script.shift();
        const response = next === undefined ? this.fallback : typeof next === "function" ? next(request) : next;
        if (this.stampReceivedAt)
            return { ...response, receivedAt: this.stampReceivedAt() };
        return response;
    }
}
/** Build an EffectHttpResponse from a JSON body + status, for scripting. */
export function jsonResponse(status, body, opts = {}) {
    const text = JSON.stringify(body);
    const bytes = new TextEncoder().encode(text);
    let hash = 5381;
    for (const b of bytes)
        hash = ((hash << 5) + hash + b) >>> 0;
    return {
        status,
        headers: (opts.headers ?? []).map(([name, value]) => ({ name, value })),
        body: bytes,
        bodyHash: `h${hash.toString(16)}`,
        receivedAt: opts.receivedAt ?? new Date(0).toISOString(),
    };
}
export function memoryStores() {
    return {
        outbox: new MemoryOutboxDispatchStore(),
        rate: new MemoryRateLimitStore(),
        dlq: new MemoryDispatchDlq(),
    };
}
/** A deterministic clock whose `now` can be advanced by the test. */
export class FakeClock {
    current;
    constructor(current) {
        this.current = current;
    }
    now() {
        return this.current;
    }
    set(iso) {
        this.current = iso;
    }
    advance(seconds) {
        this.current = addSeconds(this.current, seconds);
    }
}
//# sourceMappingURL=memory.js.map