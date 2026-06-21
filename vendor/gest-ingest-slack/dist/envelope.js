// @gest/ingest-slack / envelope
//
// Typed Slack envelope decoders. The Events API and Socket Mode both wrap an
// inner event in an outer envelope, but with different shapes:
//
//   Events API (HTTP):   { type: "url_verification" | "event_callback" | ..., ... }
//   Socket Mode (WS):    { envelope_id, type: "events_api"|..., payload: <Events API body>, ... }
//
// This module parses ALREADY-VERIFIED bytes (HTTP) or already-trusted socket
// frames into typed records, or a structured DecodeFailure. No untyped Slack JSON
// leaves this package: callers branch on the discriminated union below.
//
// Hard rule: for the HTTP transport, JSON.parse happens only AFTER signature
// verification. This module does not verify; the caller verifies first (see
// verify.ts) and only then hands the parsed value here.
import { asJson, decodeArray, decodeBoolean, decodeJsonBody, decodeNonEmptyString, decodeNumber, decodeObject, fail, field, isJsonObject, ok, optionalField, } from "@gest/ingest-core";
export const decodeSlackAuthorization = decodeObject({
    enterprise_id: optionalField(decodeNonEmptyString),
    team_id: optionalField(decodeNonEmptyString),
    user_id: field(decodeNonEmptyString),
    is_bot: field(decodeBoolean),
    is_enterprise_install: optionalField(decodeBoolean),
});
export const decodeSlackInnerEvent = (input, path = "") => {
    const obj = asJson(input);
    if (!isJsonObject(obj)) {
        return fail(path, "expected slack inner event object");
    }
    const typeR = decodeNonEmptyString(obj["type"], `${path}.type`);
    if (!typeR.ok)
        return typeR;
    const value = {
        type: typeR.value,
        raw: obj,
        ...(typeof obj["subtype"] === "string" ? { subtype: obj["subtype"] } : {}),
        ...(typeof obj["ts"] === "string" ? { ts: obj["ts"] } : {}),
        ...(typeof obj["event_ts"] === "string" ? { event_ts: obj["event_ts"] } : {}),
    };
    return ok(value);
};
const decodeAuthorizations = decodeArray(decodeSlackAuthorization);
/**
 * Decode an Events API outer envelope (the already-parsed verified body). Returns
 * a discriminated union so callers handle url_verification, event_callback, and
 * unknown explicitly. Unknown outer types are preserved opaquely, never dropped.
 */
export const decodeSlackEventsApiEnvelope = (input, path = "") => {
    const obj = asJson(input);
    if (!isJsonObject(obj)) {
        return fail(path, "expected slack envelope object");
    }
    const typeR = decodeNonEmptyString(obj["type"], `${path}.type`);
    if (!typeR.ok)
        return typeR;
    const type = typeR.value;
    if (type === "url_verification") {
        const ch = decodeNonEmptyString(obj["challenge"], `${path}.challenge`);
        if (!ch.ok)
            return ch;
        const value = {
            kind: "url_verification",
            challenge: ch.value,
            ...(typeof obj["token"] === "string" ? { token: obj["token"] } : {}),
        };
        return ok(value);
    }
    if (type === "event_callback") {
        return decodeEventCallback(obj, path);
    }
    const value = { kind: "unknown", type, raw: obj };
    return ok(value);
};
function decodeEventCallback(obj, path) {
    const appId = decodeNonEmptyString(obj["api_app_id"], `${path}.api_app_id`);
    if (!appId.ok)
        return appId;
    const eventId = decodeNonEmptyString(obj["event_id"], `${path}.event_id`);
    if (!eventId.ok)
        return eventId;
    const eventTime = decodeNumber(obj["event_time"], `${path}.event_time`);
    if (!eventTime.ok)
        return eventTime;
    const inner = decodeSlackInnerEvent(obj["event"], `${path}.event`);
    if (!inner.ok)
        return inner;
    let authorizations;
    if (obj["authorizations"] !== undefined) {
        const a = decodeAuthorizations(obj["authorizations"], `${path}.authorizations`);
        if (!a.ok)
            return a;
        authorizations = a.value;
    }
    const value = {
        kind: "event_callback",
        api_app_id: appId.value,
        event_id: eventId.value,
        event_time: eventTime.value,
        event: inner.value,
        ...(typeof obj["team_id"] === "string" ? { team_id: obj["team_id"] } : {}),
        ...(typeof obj["enterprise_id"] === "string" ? { enterprise_id: obj["enterprise_id"] } : {}),
        ...(typeof obj["context_team_id"] === "string" ? { context_team_id: obj["context_team_id"] } : {}),
        ...(typeof obj["context_enterprise_id"] === "string"
            ? { context_enterprise_id: obj["context_enterprise_id"] }
            : {}),
        ...(typeof obj["is_ext_shared_channel"] === "boolean"
            ? { is_ext_shared_channel: obj["is_ext_shared_channel"] }
            : {}),
        ...(authorizations === undefined ? {} : { authorizations }),
    };
    return ok(value);
}
// ---------------------------------------------------------------------------
// Socket Mode envelope.
//
// Socket Mode is a long-running runner INPUT shape, not a serverless HTTP request
// handler. Frames arrive over a websocket the runner owns; there is no per-frame
// signature (the websocket itself is authenticated at connect time), so the
// signature verdict for these is "not-applicable". The runner decodes each frame
// with `decodeSocketModeEnvelope` and acks it by envelope_id.
// ---------------------------------------------------------------------------
/** Socket Mode frame types we handle as a runner input. */
export const SOCKET_MODE_TYPES = [
    "hello",
    "events_api",
    "interactive",
    "slash_commands",
    "disconnect",
];
/**
 * Decode a Socket Mode frame. For "events_api" frames the inner payload is parsed
 * into the same `SlackEventsApiEnvelope` union the HTTP path uses, so downstream
 * normalization is transport-independent. Frames without a payload (hello,
 * disconnect) decode with `payload` absent.
 */
export const decodeSocketModeEnvelope = (input, path = "") => {
    const obj = asJson(input);
    if (!isJsonObject(obj)) {
        return fail(path, "expected socket mode frame object");
    }
    const typeR = decodeNonEmptyString(obj["type"], `${path}.type`);
    if (!typeR.ok)
        return typeR;
    let payload;
    if (typeR.value === "events_api" && obj["payload"] !== undefined) {
        const p = decodeSlackEventsApiEnvelope(obj["payload"], `${path}.payload`);
        if (!p.ok)
            return p;
        payload = p.value;
    }
    const value = {
        type: typeR.value,
        raw: obj,
        ...(typeof obj["envelope_id"] === "string" ? { envelope_id: obj["envelope_id"] } : {}),
        ...(typeof obj["accepts_response_payload"] === "boolean"
            ? { accepts_response_payload: obj["accepts_response_payload"] }
            : {}),
        ...(typeof obj["retry_attempt"] === "number" ? { retry_attempt: obj["retry_attempt"] } : {}),
        ...(typeof obj["retry_reason"] === "string" ? { retry_reason: obj["retry_reason"] } : {}),
        ...(payload === undefined ? {} : { payload }),
    };
    return ok(value);
};
/** Parse already-verified raw HTTP bytes into JSON, then decode the envelope. */
export function parseEventsApiBody(rawBody) {
    return decodeJsonBody(rawBody, decodeSlackEventsApiEnvelope);
}
//# sourceMappingURL=envelope.js.map