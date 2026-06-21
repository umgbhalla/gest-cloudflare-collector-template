// @gest/infra / worker / fetch handler
//
// The Worker fetch handler — the verify-before-parse ACK PATH and nothing more.
// In order:
//   1. route by path -> platform (404 not-found when unrouted).
//   2. guardInbound: pre-read edge checks (missing-secret 403, content-length 413,
//      loopback/CIDR). Body is NOT read until the guard passes.
//   3. adaptCloudflareRequest: read EXACT bytes through the streaming cap, build the
//      neutral IngestHttpRequest + provider metadata (no JSON parse here).
//   4. platformIngest: the platform adapter verifies over the exact bytes and
//      decodes. A rejected verdict -> persist raw WITHOUT body (audit only) -> 401.
//      A handshake (Slack challenge / Discord ping / GitHub ping) -> 200 + echo.
//   5. persist raw (D1+R2) -> claim dedupe (collapse redeliveries to 200) ->
//      enqueue ONE QueueMessage -> ack fast with 202.
//
// HARD RULE: NO runtime consumer and NO outbox dispatch run here. The consumer +
// dispatch run in the Queue consumer. The status code always comes from the core
// inbound taxonomy via statusForOutcome — distinct codes, never a collapsed 400.
import { NoopTracer, statusForOutcome, } from "@gest/ingest-core";
import { adaptCloudflareRequest, guardInbound, } from "@gest/ingest-cloudflare";
import { hashBytes } from "@gest/ingest-core";
import { platformForPath } from "../routing.js";
import { platformIngest, } from "../platform-ingest.js";
import { QUEUE_MESSAGE_KIND, encodeWorkPayload, jobMessageId, } from "../ids.js";
import { ATTR_ACCOUNT, ATTR_DUPLICATE, ATTR_ENQUEUED, ATTR_HTTP_RESPONSE_STATUS_CODE, ATTR_HTTP_ROUTE, ATTR_OUTCOME, ATTR_PLATFORM, ATTR_RAW_ID, ATTR_NATIVE_KEY, ATTR_TENANT, SPAN_ACK, SPAN_ENQUEUE, SPAN_PREPARE_DELIVERY, SPAN_RAW_CAPTURE, SPAN_VERIFY, } from "../observability/attributes.js";
const RETENTION_SECONDS = 3600;
function ack(partial) {
    return {
        body: "",
        enqueued: false,
        rawStored: false,
        duplicate: false,
        ...partial,
    };
}
/**
 * Run the ack path for a single inbound request. Pure over its deps + clock; the
 * createGest `fetch` handler supplies the real bindings (via fetchDepsFromEnv).
 */
export async function ackPath(request, cfCtx, deps) {
    const tracer = deps.tracer ?? NoopTracer;
    const { path } = splitPath(request.url);
    const platform = platformForPath(path);
    // One DOMAIN span around the whole ack stage. The HTTP fetch lifecycle is
    // auto-traced by CF; this span carries the Gest domain outcome, not the request.
    return tracer.enterSpan(SPAN_ACK, platform === undefined ? undefined : { [ATTR_PLATFORM]: platform, [ATTR_HTTP_ROUTE]: path }, async (span) => {
        const result = await runAck(request, cfCtx, deps, tracer, span, platform, path);
        if (span.isTraced) {
            span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, result.status);
            span.setAttribute(ATTR_OUTCOME, result.outcome);
            span.setAttribute(ATTR_ENQUEUED, result.enqueued);
            span.setAttribute(ATTR_DUPLICATE, result.duplicate);
        }
        return result;
    });
}
async function runAck(request, cfCtx, deps, tracer, ackSpan, platform, path) {
    if (platform === undefined) {
        return ack({ status: statusForOutcome("not-found"), outcome: "not-found" });
    }
    const secret = deps.secretForPlatform(platform);
    // Pre-read edge guard. Body is NOT read until this passes.
    const guardOutcome = guardInbound({
        headers: headerMapOf(request),
        maxBodyBytes: deps.maxBodyBytes,
        secret,
        ...(cfCtx.colo === undefined ? {} : { sourceHost: cfCtx.colo }),
    });
    if (guardOutcome !== "accepted") {
        return ack({ status: statusForOutcome(guardOutcome), outcome: guardOutcome });
    }
    // Read EXACT bytes through the streaming cap (throws PayloadTooLargeError -> 413).
    let adapted;
    try {
        adapted = await adaptCloudflareRequest(request, cfCtx, deps.maxBodyBytes);
    }
    catch {
        return ack({ status: statusForOutcome("payload-too-large"), outcome: "payload-too-large" });
    }
    const { http, provider } = adapted;
    const bodyHash = hashBytes(http.rawBody);
    const rawId = deps.rawIdFor(platform, bodyHash);
    const tenant = deps.tenantForRequest(platform, path);
    const receivedAt = cfCtx.receivedAt;
    if (ackSpan.isTraced) {
        ackSpan.setAttribute(ATTR_TENANT, tenant);
        ackSpan.setAttribute(ATTR_RAW_ID, rawId);
    }
    // VERIFY stage: platform verify + decode. Verify-before-parse lives in the adapter.
    const outcome = await tracer.enterSpan(SPAN_VERIFY, { [ATTR_PLATFORM]: platform, [ATTR_RAW_ID]: rawId }, (span) => {
        const o = platformIngest(platform, http, provider, deps.secrets, {
            tenant,
            rawId,
            receivedAt,
            bodyHash,
        });
        if (span.isTraced)
            span.setAttribute(ATTR_OUTCOME, o.verified ? "verified" : "rejected");
        return o;
    });
    if (outcome.verified === false) {
        // Persist audit metadata only (the raw carries NO body by contract). 401.
        await tracer.enterSpan(SPAN_RAW_CAPTURE, { [ATTR_RAW_ID]: rawId }, () => deps.stores.raw.put(outcome.raw));
        return ack({
            status: statusForOutcome("unauthorized"),
            outcome: "rejected",
            rawStored: true,
        });
    }
    // Verified: persist raw (D1 row + R2 blob keyed by bodyHash). The nativeKey is
    // only known on a non-handshake outcome; it rides the prepareDelivery span below.
    await tracer.enterSpan(SPAN_RAW_CAPTURE, { [ATTR_RAW_ID]: rawId }, () => deps.stores.raw.put(outcome.raw));
    if (outcome.handshake === true) {
        // Challenge / ping handshake: echo + 200, no work enqueued.
        return ack({
            status: 200,
            outcome: "accepted",
            rawStored: true,
            ...(outcome.responseBody === undefined ? {} : { body: outcome.responseBody }),
        });
    }
    // The neutral QueueMessage pointer the consumer processes (pointer only — it
    // loads raw from source truth). Built once and persisted on the work row, so a
    // repair re-enqueues EXACTLY the same message.
    const workId = jobMessageId(rawId);
    const account = outcome.raw.account;
    if (ackSpan.isTraced)
        ackSpan.setAttribute(ATTR_ACCOUNT, account);
    const queueMessage = {
        messageId: workId,
        kind: QUEUE_MESSAGE_KIND,
        payload: encodeWorkPayload({ rawId, nativeKey: outcome.nativeKey, platform, tenant }),
        groupKey: `${platform}:${account}`,
        causedByRawId: rawId,
    };
    // ATOMIC delivery gate: claim the delivery dedupe key AND insert/ensure the
    // recoverable delivery_work row in ONE D1 transaction (Oracle review, Decision
    // B). A duplicate may be acked 200 ONLY because a recoverable work row exists.
    const prepared = await tracer.enterSpan(SPAN_PREPARE_DELIVERY, { [ATTR_NATIVE_KEY]: outcome.nativeKey, [ATTR_ACCOUNT]: account }, (span) => deps.stores.delivery
        .prepareDelivery({
        platform,
        tenant,
        account,
        dedupeKey: outcome.nativeKey,
        rawId,
        workId,
        queueMessage,
        now: receivedAt,
        retentionSeconds: RETENTION_SECONDS,
    })
        .then((p) => {
        if (span.isTraced)
            span.setAttribute(ATTR_DUPLICATE, p.duplicate);
        return p;
    }));
    if (prepared.duplicate) {
        // Redelivery. If the work was never confirmed enqueued (crash after the
        // atomic prepare but before the Queue send), REPAIR it here so the event is
        // not lost; otherwise just collapse to 200.
        if (prepared.shouldEnqueue) {
            await tracer.enterSpan(SPAN_ENQUEUE, { [ATTR_RAW_ID]: rawId }, async () => {
                await deps.queue.send(prepared.work.queueMessage ?? queueMessage);
                await deps.stores.delivery.markEnqueued({ workId, now: receivedAt });
            });
        }
        return ack({
            status: statusForOutcome("duplicate"),
            outcome: "duplicate",
            rawStored: true,
            duplicate: true,
        });
    }
    // First observation: enqueue ONE QueueMessage, then confirm the send so a
    // repair scan does not re-enqueue it. NO consumer/dispatch runs here.
    await tracer.enterSpan(SPAN_ENQUEUE, { [ATTR_RAW_ID]: rawId }, async () => {
        await deps.queue.send(queueMessage);
        await deps.stores.delivery.markEnqueued({ workId, now: receivedAt });
    });
    return ack({
        status: statusForOutcome("accepted"),
        outcome: "accepted",
        rawStored: true,
        enqueued: true,
    });
}
function splitPath(url) {
    const q = url.indexOf("?");
    const noQuery = q < 0 ? url : url.slice(0, q);
    const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i.exec(noQuery);
    return { path: m ? (m[1] ?? "/") : noQuery };
}
function headerMapOf(request) {
    const out = {};
    request.headers.forEach((value, key) => {
        out[key.toLowerCase()] = value;
    });
    return out;
}
//# sourceMappingURL=fetch.js.map