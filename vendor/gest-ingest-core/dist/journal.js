// @gest/ingest-core / event journal
//
// The journal persists canonical events derived from raw deliveries, plus the
// runtime records produced when a consumer acts on them. The canonical event is
// deliberately NOT platform-shaped: no Slack/Discord/Telegram/GitHub field sits
// at the top level. Platform-specific data lives only under `source[platform]`
// as opaque typed JSON the platform adapter populated. The runtime contract is a
// small version marker, not a framework: the core never imports a runtime.
import {} from "./json.js";
import { decodeIsoTimestamp, decodeNonEmptyString, decodeObject, field, } from "./decode.js";
import { decodeJsonPayload } from "./queue.js";
import { decodePlatform } from "./platform.js";
import { decodeEventSource } from "./event.js";
export const decodeCanonicalEvent = decodeObject({
    eventId: field(decodeNonEmptyString),
    platform: field(decodePlatform),
    rawId: field(decodeNonEmptyString),
    nativeKey: field(decodeNonEmptyString),
    decoderVersion: field(decodeNonEmptyString),
    occurredAt: field(decodeIsoTimestamp),
    tenant: field(decodeNonEmptyString),
    account: field(decodeNonEmptyString),
    source: field(decodeEventSource),
});
export const decodeRuntimeRecord = decodeObject({
    recordId: field(decodeNonEmptyString),
    eventId: field(decodeNonEmptyString),
    runtimeVersion: field(decodeNonEmptyString),
    producedAt: field(decodeIsoTimestamp),
    decision: field(decodeJsonPayload),
});
//# sourceMappingURL=journal.js.map