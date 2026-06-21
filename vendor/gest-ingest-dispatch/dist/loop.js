// @gest/ingest-dispatch / generic dispatch loop
//
// The ONE place effect-dispatch mechanics live. Platform-agnostic: it consults a
// caller-supplied codec registry, an injected transport, and an injected
// credential capability. It owns leasing, rate-key gating, retry/DLQ routing,
// and dry-run suppression — so Slack, GitHub, Discord, and Telegram share one
// retry/DLQ/rate policy and the platform packages stay pure (no fetch, no env).
//
// Ordering per pass:
//   1. reap expired `sending` leases back to `retry`
//   2. atomically claim ready rows (pending|retry -> sending + lease)
//   3. for each claimed row:
//        a. ALL of its rateKeys must be available, else release (no send)
//        b. resolve credentialRef via the injected capability — a resolver
//           failure short-circuits to a DispatchDecision (terminal -> DLQ now,
//           transient -> retry), routed through the SAME tail as a codec verdict
//        c. codec.buildEffectRequest -> injected transport.send
//        d. codec.parseEffectResponse -> DispatchDecision
//        e. recordDispatchDecision honouring notBefore + applying rateLimitUpdates
//        f. route exhausted/terminal rows to the DLQ
import { IngestError } from "@gest/ingest-core";
const EMPTY_RESULT = { reaped: 0, claimed: 0, results: [] };
/**
 * Run one dispatch pass. Pure orchestration over injected seams: the only I/O is
 * through `stores`, `transport`, and `credentials`. Returns a per-row trace.
 */
export async function dispatchReady(stores, registry, transport, credentials, clock, options = {}) {
    // Dry-run: never claim, never dispatch. The suppression guarantee holds by
    // construction — no row is even leased, so no effect can leave the system.
    if (options.dryRun === true)
        return EMPTY_RESULT;
    const limit = options.limit ?? 32;
    const leaseSeconds = options.leaseSeconds ?? 30;
    const reapLimit = options.reapLimit ?? limit;
    const owner = options.owner ?? "dispatcher";
    const maxAttempts = options.maxAttempts ?? 8;
    // 1. Reap expired leases first so previously-stuck rows are claimable again.
    const reapNow = clock.now();
    const reaped = await stores.outbox.reapExpiredLeases({ now: reapNow, limit: reapLimit });
    // 2. Atomically claim ready rows.
    const claimNow = clock.now();
    const claimed = await stores.outbox.claimReady({
        now: claimNow,
        limit,
        leaseSeconds,
        owner,
        ...(options.platforms ? { platforms: options.platforms } : {}),
    });
    const results = [];
    for (const row of claimed) {
        results.push(await dispatchRow(row, stores, registry, transport, credentials, clock, maxAttempts));
    }
    return { reaped, claimed: claimed.length, results };
}
async function dispatchRow(row, stores, registry, transport, credentials, clock, maxAttempts) {
    const codec = registry[row.platform];
    // No codec for this platform: route to DLQ, do not silently drop. Release the
    // lease as a terminal `failed` so the row stops cycling.
    if (codec === undefined) {
        const now = clock.now();
        const attempt = synthAttempt(row, now, "no_codec_registered");
        await stores.dlq.put({
            outbox: row,
            reason: `no_codec:${row.platform}`,
            attempt,
            recordedAt: now,
        });
        await stores.outbox.recordDispatchDecision({
            outboxId: row.outboxId,
            leaseId: row.leaseId,
            attempt,
            nextState: "failed",
            dlqReason: `no_codec:${row.platform}`,
            now,
        });
        return { outboxId: row.outboxId, platform: row.platform, outcome: "dlq-no-codec" };
    }
    // 3a. ALL rate keys must be available before we send. If any bucket is
    // blocked, defer the row to its block time and do NOT dispatch.
    const checkNow = clock.now();
    const check = await stores.rate.check({ rateKeys: row.rateKeys, now: checkNow });
    if (!check.allowed) {
        const attempt = synthAttempt(row, checkNow, "rate_blocked");
        await stores.outbox.recordDispatchDecision({
            outboxId: row.outboxId,
            leaseId: row.leaseId,
            attempt,
            nextState: "retry",
            now: checkNow,
            ...(check.blockedUntil ? { notBefore: check.blockedUntil } : {}),
        });
        return {
            outboxId: row.outboxId,
            platform: row.platform,
            outcome: "rate-blocked",
            ...(check.blockedRateKey ? { blockedRateKey: check.blockedRateKey } : {}),
        };
    }
    // 3b. Resolve the opaque credentialRef via the injected capability. The token
    // is in-memory only; it never touches a durable record. A resolver failure is
    // folded into the SAME decision taxonomy as a codec verdict: a terminal
    // credential error (revoked/not-found) becomes a `failed` decision routed to
    // the DLQ on THIS pass; a transient one becomes a `retry` with backoff. No
    // unwrapped await can leave the row stuck in `sending` until the lease expires.
    const credNow = clock.now();
    const credRequest = {
        platform: row.platform,
        tenant: row.tenant,
        account: row.account,
        credentialRef: row.credentialRef,
        method: row.method,
        destination: row.destination,
        now: credNow,
    };
    let credential;
    try {
        credential = await credentials.resolveEffectCredential(credRequest);
    }
    catch (err) {
        return routeDecision(row, stores, credentialFailure(row, credNow, err), maxAttempts, clock.now());
    }
    // 3c. Build + send through the injected transport (the only network boundary).
    const startedAt = clock.now();
    const request = codec.buildEffectRequest({ outbox: row, credential, now: startedAt });
    const response = await transport.send(request);
    // 3d. The codec owns native-body interpretation (e.g. Slack 200 + ok:false).
    const decision = codec.parseEffectResponse({
        outbox: row,
        response,
        attemptNumber: row.attemptNumber,
        startedAt,
        now: response.receivedAt,
    });
    // 3e. Apply rate-limit updates the codec asked for (e.g. on a 429).
    if (decision.rateLimitUpdates) {
        for (const update of decision.rateLimitUpdates) {
            await stores.rate.update(update);
        }
    }
    // 3f. Route the verdict (terminal -> DLQ, exhausted retry -> DLQ, else record).
    return routeDecision(row, stores, decision, maxAttempts, clock.now());
}
/**
 * Apply one `DispatchDecision` to a claimed row: route a terminal verdict to the
 * DLQ immediately, escalate an exhausted retry to the DLQ, otherwise record the
 * transition. This is the single tail every decision crosses — codec verdicts
 * and credential failures alike — so credential errors inherit the exact same
 * terminal/exhaustion/lease semantics without a second seam.
 */
async function routeDecision(row, stores, decision, maxAttempts, recordNow) {
    if (decision.nextState === "failed") {
        await stores.dlq.put({
            outbox: row,
            reason: decision.dlqReason ?? "terminal",
            attempt: decision.attempt,
            recordedAt: recordNow,
        });
        await record(stores, row, decision, recordNow);
        return { outboxId: row.outboxId, platform: row.platform, outcome: "dlq-terminal", decision };
    }
    if (decision.nextState === "retry" && row.attemptNumber >= maxAttempts) {
        // Exhausted: convert a would-be retry into a terminal DLQ row.
        const reason = `exhausted:${decision.dlqReason ?? `attempts_${row.attemptNumber}`}`;
        await stores.dlq.put({ outbox: row, reason, attempt: decision.attempt, recordedAt: recordNow });
        await stores.outbox.recordDispatchDecision({
            outboxId: row.outboxId,
            leaseId: row.leaseId,
            attempt: decision.attempt,
            nextState: "failed",
            dlqReason: reason,
            now: recordNow,
        });
        return { outboxId: row.outboxId, platform: row.platform, outcome: "dlq-exhausted", decision };
    }
    await record(stores, row, decision, recordNow);
    return {
        outboxId: row.outboxId,
        platform: row.platform,
        outcome: decision.nextState === "sent" ? "sent" : "retry",
        decision,
    };
}
/** Backoff (seconds) for a transient credential retry, by attempt number. */
const CREDENTIAL_RETRY_BACKOFF_SECONDS = 5;
/**
 * Classify a credential-resolver throw into a `DispatchDecision`. A retryable
 * `IngestError` becomes a `retry` with backoff; everything else is terminal and
 * routed to the DLQ as `credential_error` — a revoked/not-found token must NOT
 * burn N attempts. The transport is never reached, so the attempt is synthetic.
 */
function credentialFailure(row, now, err) {
    const retryable = err instanceof IngestError && err.retryable;
    if (retryable) {
        return {
            attempt: synthAttempt(row, now, "credential_error"),
            nextState: "retry",
            notBefore: addSeconds(now, CREDENTIAL_RETRY_BACKOFF_SECONDS),
        };
    }
    return {
        attempt: synthAttempt(row, now, "credential_error"),
        nextState: "failed",
        dlqReason: "credential_error",
    };
}
function addSeconds(iso, seconds) {
    return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}
async function record(stores, row, decision, now) {
    await stores.outbox.recordDispatchDecision({
        outboxId: row.outboxId,
        leaseId: row.leaseId,
        attempt: decision.attempt,
        nextState: decision.nextState,
        now,
        ...(decision.notBefore ? { notBefore: decision.notBefore } : {}),
        ...(decision.dlqReason ? { dlqReason: decision.dlqReason } : {}),
    });
}
/** A synthetic attempt for paths that never reached the transport. */
function synthAttempt(row, startedAt, error) {
    return {
        attempt: row.attemptNumber,
        startedAt,
        error,
    };
}
//# sourceMappingURL=loop.js.map