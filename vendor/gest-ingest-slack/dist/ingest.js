// @gest/ingest-slack / ingest
//
// The platform-adapter entry points that tie verification, envelope decoding,
// identity, and normalization together WITHOUT touching storage or a runtime.
// A provider adapter supplies the captured bytes + provider metadata; a runner
// supplies socket frames. These functions return durable records (RawDelivery,
// native key, NormalizedEvent) for the caller to persist raw-first and process.
//
// Gest boundaries kept here:
// - HTTP path verifies the signature over exact bytes BEFORE parsing JSON.
// - We never dispatch or decide; we only verify + decode + normalize + key.
// - url_verification is surfaced as a typed response intent, not auto-answered,
//   so the provider adapter owns the HTTP response.
import { buildRawDelivery, normalizedEventOf, } from "@gest/ingest-core";
import { decodeSocketModeEnvelope, parseEventsApiBody, } from "./envelope.js";
import { eventDedupeKey, scopeOf } from "./identity.js";
import { normalizeSlackEvent, } from "./normalize.js";
import { SLACK_SIGNATURE_SCHEME, verifySlackRequest, } from "./verify.js";
/**
 * Ingest a Slack Events API HTTP request: verify over raw bytes, then (only on a
 * verified signature) parse and decode the envelope. Returns durable records for
 * the caller to persist raw-first. A rejected/expired/missing signature yields a
 * "rejected" outcome whose raw delivery carries audit metadata only (no body).
 */
export function ingestSlackHttp(request, provider, verifyOpts, env) {
    const verification = verifySlackRequest(request, verifyOpts);
    const sig = verification.signature;
    if (!verification.verified) {
        // Source-truth rule: do not persist the attacker-controlled body.
        const raw = buildRaw(request, provider, env, sig, verification.retry, undefined);
        return { kind: "rejected", raw, reason: sig.reason ?? "signature not verified" };
    }
    const bodyText = new TextDecoder().decode(request.rawBody);
    const raw = buildRaw(request, provider, env, sig, verification.retry, bodyText);
    const decoded = parseEventsApiBody(request.rawBody);
    if (!decoded.ok) {
        return { kind: "ignored", raw, envelope: { kind: "unknown", type: "<undecodable>", raw: {} }, reason: "envelope decode failed" };
    }
    const envelope = decoded.value;
    if (envelope.kind === "url_verification") {
        return { kind: "url_verification", raw, challenge: envelope.challenge };
    }
    if (envelope.kind !== "event_callback") {
        return { kind: "ignored", raw, envelope, reason: `unhandled envelope type "${envelope.type}"` };
    }
    return buildEventOutcome(raw, envelope, eventDedupeKey(envelope), {
        tenant: env.tenant,
        rawId: env.rawId,
        verified: true,
        signatureKind: "verified",
        receivedAt: env.receivedAt,
        nativeKey: eventDedupeKey(envelope),
    });
}
/**
 * Decode a Socket Mode frame for a long-running runner. Socket Mode has no
 * per-frame HTTP signature: the websocket is authenticated at connect time, so
 * the signature verdict is "not-applicable" (NOT "verified" — connect-time trust
 * is not a per-message HMAC). The runner must still ack by envelope_id (carried
 * on the frame). Non-event frames (hello/disconnect) and non-event_callback
 * payloads are ack-only.
 *
 * Raw-first capture (ADR 0002): on every decodable outcome this returns a durable
 * RawDelivery built over the EXACT frame bytes (env.bodyHash) with the
 * "not-applicable" signature verdict and native retry meta, so socket frames are
 * replayable from source truth just like HTTP deliveries. Only an undecodable
 * frame is raw-less (consistent with not persisting unparseable input).
 *
 * Dedupe: the claim key is the SAME stable HTTP key (eventDedupeKey:
 * `slack:event:{api_app_id}:{scope}:{event_id}`). envelope_id is NOT folded into
 * the claim — Slack does not guarantee a stable envelope_id across reconnect/
 * redelivery, so folding it would let the same logical event be consumed twice.
 * envelope_id (and inner ts) are recorded as correlation metadata only.
 */
export function ingestSlackSocket(frameInput, provider, env) {
    const decoded = decodeSocketModeEnvelope(frameInput);
    if (!decoded.ok)
        return { kind: "undecodable", reason: decoded.issues.map((i) => i.message).join("; ") };
    const frame = decoded.value;
    if (frame.type !== "events_api" || frame.payload === undefined) {
        const raw = buildSocketRaw(frame, provider, env, frame.type);
        return { kind: "ack-only", frame, raw, reason: `frame type "${frame.type}" carries no event` };
    }
    if (frame.payload.kind !== "event_callback") {
        const raw = buildSocketRaw(frame, provider, env, frame.payload.kind);
        return { kind: "ack-only", frame, raw, reason: `payload type "${frame.payload.kind}"` };
    }
    const envelope = frame.payload;
    const raw = buildSocketRaw(frame, provider, env, scopeOf(envelope));
    // Same stable claim key as HTTP; reconnect/redelivery (fresh envelope_id, same
    // event_id) collapses to one claim. envelope_id stays on frame for ack/audit.
    const nativeKey = eventDedupeKey(envelope);
    // Ack path: a malformed-but-signed payload (DecodeFailure) is folded to "no
    // event" exactly like an unsupported event — the raw is already durable and the
    // ack must not 500. The consumer seam re-derives and surfaces the failure.
    const event = normalizedEventOf(normalizeSlackEvent(envelope, {
        tenant: env.tenant,
        rawId: env.rawId,
        // Socket frames carry NO per-frame signature; do not claim verification.
        verified: false,
        signatureKind: "not-applicable",
        receivedAt: env.receivedAt,
        nativeKey,
    }));
    return event === undefined
        ? { kind: "event", frame, raw, envelope, nativeKey }
        : { kind: "event", frame, raw, envelope, nativeKey, event };
}
function buildEventOutcome(raw, envelope, nativeKey, ctx) {
    const event = normalizedEventOf(normalizeSlackEvent(envelope, ctx));
    return event === undefined
        ? { kind: "event", raw, envelope, nativeKey }
        : { kind: "event", raw, envelope, nativeKey, event };
}
function buildRaw(request, provider, env, signature, retry, body) {
    // account/transport are platform-derived; the no-attacker-body policy + common
    // shape live in core's buildRawDelivery (the rejected path passes body=undefined,
    // so it stays out regardless of policy).
    return buildRawDelivery({ rawId: env.rawId, tenant: env.tenant, receivedAt: env.receivedAt, provider, headers: request.headers, bodyHash: env.bodyHash, signature, retry, ...(body === undefined ? {} : { body }) }, { platform: "slack", transport: "http", account: installRefOf(request.headers) ?? provider.requestId });
}
/**
 * Build a durable RawDelivery for a Socket Mode frame (ADR 0002 raw-first). The
 * signature verdict is "not-applicable" — the websocket is authenticated at
 * connect time, there is no per-frame HMAC. Native retry meta is derived from the
 * frame's retry_attempt/retry_reason, the body is the exact frame JSON, and
 * bodyHash is the caller-computed hash over the exact frame bytes.
 */
function buildSocketRaw(frame, provider, env, account) {
    const signature = { kind: "not-applicable", scheme: SLACK_SIGNATURE_SCHEME };
    const retry = frame.retry_attempt === undefined
        ? { count: 0 }
        : frame.retry_reason === undefined
            ? { count: frame.retry_attempt }
            : { count: frame.retry_attempt, reason: frame.retry_reason };
    return buildRawDelivery({ rawId: env.rawId, tenant: env.tenant, receivedAt: env.receivedAt, provider, headers: {}, bodyHash: env.bodyHash, signature, retry, body: JSON.stringify(frame.raw) }, { platform: "slack", transport: "socket", account });
}
/** Best-effort install hint from headers; the verified envelope is authoritative. */
function installRefOf(_headers) {
    return undefined;
}
//# sourceMappingURL=ingest.js.map