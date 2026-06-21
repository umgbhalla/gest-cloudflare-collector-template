// @gest/ingest-core / normalized event
//
// The normalized event is the runtime-facing record. It is platform-neutral at
// the top level: a runtime consumer can branch on `family` + `kind` without
// knowing whether the bytes came from Slack, Discord, Telegram, or GitHub.
// Platform-specific detail is NOT flattened into the top level; it lives only
// under `source[platform]` as opaque typed JSON the platform adapter populated.
// The core never reads inside a source namespace.
//
// Why a closed family/kind vocabulary: replay and evals need a stable shape, and
// a closed enum keeps this from drifting into a full social-platform schema. New
// platform-specific events stay isolated under `source` and are documented, not
// promoted to the top level.
import { asJson } from "./json.js";
import { decodeArray, decodeBoolean, decodeEnum, decodeIsoTimestamp, decodeNonEmptyString, decodeObject, decodeString, fail, field, ok, optionalField, } from "./decode.js";
import { decodePlatform } from "./platform.js";
import { decodeSignatureKind } from "./raw.js";
/**
 * Canonical event families. These are the neutral buckets every platform maps
 * its native events into. `repository` is for code-host events (GitHub) that do
 * not fit the chat-shaped families; chat platforms simply never emit it.
 */
export const EVENT_FAMILIES = [
    "message",
    "reaction",
    "member",
    "channel",
    "thread",
    "file",
    "app",
    "system",
    "repository",
];
/**
 * Canonical event kinds, namespaced by family as `family.verb`. Closed set so
 * replay output stays stable. Platform-specific verbs are NOT added here; they
 * remain under `source[platform]` and are documented per platform.
 */
export const EVENT_KINDS = [
    // message
    "message.created",
    "message.edited",
    "message.deleted",
    // reaction
    "reaction.added",
    "reaction.removed",
    // member
    "member.joined",
    "member.left",
    "member.updated",
    // channel
    "channel.created",
    "channel.updated",
    "channel.archived",
    // thread
    "thread.created",
    "thread.updated",
    // file
    "file.shared",
    "file.removed",
    // app
    "app.mentioned",
    "app.home_opened",
    "app.interactive",
    // system
    "system.rate_limited",
    "system.reconnect",
    "system.permission_denied",
    // repository
    "repository.push",
    "repository.pull_request",
    "repository.issue",
    "repository.release",
    "repository.check_run",
    "repository.check_suite",
    "repository.workflow_run",
    "repository.dispatch",
];
/** Map each kind to its family, so the core can validate the pairing. */
const KIND_FAMILY = {
    "message.created": "message",
    "message.edited": "message",
    "message.deleted": "message",
    "reaction.added": "reaction",
    "reaction.removed": "reaction",
    "member.joined": "member",
    "member.left": "member",
    "member.updated": "member",
    "channel.created": "channel",
    "channel.updated": "channel",
    "channel.archived": "channel",
    "thread.created": "thread",
    "thread.updated": "thread",
    "file.shared": "file",
    "file.removed": "file",
    "app.mentioned": "app",
    "app.home_opened": "app",
    "app.interactive": "app",
    "system.rate_limited": "system",
    "system.reconnect": "system",
    "system.permission_denied": "system",
    "repository.push": "repository",
    "repository.pull_request": "repository",
    "repository.issue": "repository",
    "repository.release": "repository",
    "repository.check_run": "repository",
    "repository.check_suite": "repository",
    "repository.workflow_run": "repository",
    "repository.dispatch": "repository",
};
/** Return the canonical family for a kind. */
export function familyOf(kind) {
    return KIND_FAMILY[kind];
}
export const decodeEventProvenance = decodeObject({
    verified: field(decodeBoolean),
    signatureKind: optionalField(decodeSignatureKind),
    rawId: field(decodeNonEmptyString),
    decoderVersion: field(decodeNonEmptyString),
    nativeKey: field(decodeNonEmptyString),
});
export const decodeEventSource = (input, path = "") => {
    const j = asJson(input);
    if (j === undefined || typeof j !== "object" || j === null || Array.isArray(j)) {
        return fail(path, "expected source object keyed by platform");
    }
    const out = {};
    for (const [k, v] of Object.entries(j)) {
        const pr = decodePlatform(k, `${path === "" ? "" : `${path}.`}${k}`);
        if (!pr.ok)
            return pr;
        out[k] = v;
    }
    return ok(out);
};
/**
 * Decode a normalized event AND validate that `kind` belongs to `family`. A
 * mismatched pair yields a structured failure at `kind` so fixtures can assert
 * the family/kind contract is enforced, not just the individual enums.
 */
export const decodeNormalizedEvent = (input, path = "") => {
    const base = decodeObject({
        eventId: field(decodeNonEmptyString),
        platform: field(decodePlatform),
        family: field(decodeEnum(EVENT_FAMILIES)),
        kind: field(decodeEnum(EVENT_KINDS)),
        tenant: field(decodeNonEmptyString),
        account: field(decodeNonEmptyString),
        conversationId: field(decodeNonEmptyString),
        actorId: optionalField(decodeNonEmptyString),
        threadId: optionalField(decodeNonEmptyString),
        text: optionalField(decodeString),
        receivedAt: field(decodeIsoTimestamp),
        occurredAt: optionalField(decodeIsoTimestamp),
        provenance: field(decodeEventProvenance),
        source: field(decodeEventSource),
    })(input, path);
    if (!base.ok)
        return base;
    const v = base.value;
    if (familyOf(v.kind) !== v.family) {
        return fail(`${path === "" ? "" : `${path}.`}kind`, `kind "${v.kind}" belongs to family "${familyOf(v.kind)}", not "${v.family}"`);
    }
    return ok(v);
};
export const decodeEventFamily = decodeEnum(EVENT_FAMILIES);
export const decodeEventKind = decodeEnum(EVENT_KINDS);
/** Decode a list of normalized events (replay batches, fixtures). */
export const decodeNormalizedEvents = decodeArray(decodeNormalizedEvent);
//# sourceMappingURL=event.js.map