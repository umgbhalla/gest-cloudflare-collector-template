// @gest/ingest-slack / identity
//
// Event identity, dedupe keying, authorizations, and Slack Connect context. The
// core never derives a native key (that is a platform concern); this module owns
// the Slack key rule and exposes it as a string the core's dedupe store claims.
//
// Dedupe key (per docs/platforms/slack.md):
//
//   slack:event:{api_app_id}:{enterprise_or_team}:{event_id}
//
// This single key rule is transport-independent: both the HTTP and Socket Mode
// paths claim on it. Slack does NOT guarantee a stable envelope_id across Socket
// Mode reconnect/redelivery, so envelope_id must NOT be folded into the claim key
// (doing so would let the same logical event be consumed twice). envelope_id and
// the inner event ts are correlation/ack metadata only, kept off the claim key.
import { decodeArray, decodeBoolean, decodeNonEmptyString, decodeObject, field, ok, optionalField, } from "@gest/ingest-core";
/**
 * The workspace/enterprise scope a delivery belongs to. Enterprise id wins when
 * present (enterprise installs span teams); otherwise team id; otherwise the
 * literal "unknown" so the key never collapses across apps silently.
 */
export function scopeOf(envelope) {
    return (envelope.enterprise_id ??
        envelope.team_id ??
        envelope.context_enterprise_id ??
        envelope.context_team_id ??
        "unknown");
}
/**
 * Native dedupe key for an Events API delivery:
 *   slack:event:{api_app_id}:{enterprise_or_team}:{event_id}
 */
export function eventDedupeKey(envelope) {
    return `slack:event:${envelope.api_app_id}:${scopeOf(envelope)}:${envelope.event_id}`;
}
/**
 * Build Socket Mode correlation metadata. The dedupe-claim key is the SAME stable
 * key the HTTP path uses (`eventDedupeKey`): Slack does not guarantee a stable
 * envelope_id across reconnect/redelivery, so envelope_id is NOT part of the
 * claim — a redelivery of the same event_id must collapse to one claim. The
 * envelope id and inner ts are returned separately for ack/audit correlation only.
 */
export function socketCorrelation(envelope, envelopeId) {
    const ts = envelope.event.event_ts ?? envelope.event.ts;
    return {
        dedupeKey: eventDedupeKey(envelope),
        ...(envelopeId === undefined ? {} : { envelopeId }),
        ...(ts === undefined ? {} : { innerTs: ts }),
    };
}
/** Derive the durable auth + Slack Connect context from an event callback. */
export function authContextOf(envelope) {
    const isExtSharedChannel = envelope.is_ext_shared_channel ?? false;
    const authorizations = envelope.authorizations ?? [];
    return {
        apiAppId: envelope.api_app_id,
        isExtSharedChannel,
        authorizations,
        // Slack truncates `authorizations` on shared-channel/multi-team deliveries.
        // Flag a lookup whenever the delivery crosses a Slack Connect boundary (and
        // defensively whenever the inline list is a single entry on such a delivery).
        needsAuthLookup: isExtSharedChannel,
        ...(envelope.team_id === undefined ? {} : { teamId: envelope.team_id }),
        ...(envelope.enterprise_id === undefined ? {} : { enterpriseId: envelope.enterprise_id }),
        ...(envelope.context_team_id === undefined ? {} : { contextTeamId: envelope.context_team_id }),
        ...(envelope.context_enterprise_id === undefined
            ? {}
            : { contextEnterpriseId: envelope.context_enterprise_id }),
    };
}
const decodeAuthorization = decodeObject({
    enterprise_id: optionalField(decodeNonEmptyString),
    team_id: optionalField(decodeNonEmptyString),
    user_id: field(decodeNonEmptyString),
    is_bot: field(decodeBoolean),
    is_enterprise_install: optionalField(decodeBoolean),
});
/** Decoder so the auth context can round-trip through a store/fixture. */
export const decodeSlackAuthContext = (input, path = "") => {
    const r = decodeObject({
        apiAppId: field(decodeNonEmptyString),
        teamId: optionalField(decodeNonEmptyString),
        enterpriseId: optionalField(decodeNonEmptyString),
        contextTeamId: optionalField(decodeNonEmptyString),
        contextEnterpriseId: optionalField(decodeNonEmptyString),
        isExtSharedChannel: field(decodeBoolean),
        authorizations: field(decodeArray(decodeAuthorization)),
        needsAuthLookup: field(decodeBoolean),
    })(input, path);
    return r.ok ? ok(r.value) : r;
};
/**
 * Pick the bot authorization for a delivery.
 *
 * The inline `authorizations` array is NOT authoritative on Slack Connect /
 * shared-channel deliveries: Slack truncates it (typically to one entry) and the
 * full set lives behind apps.event.authorizations.list. So:
 *
 * - For a non-ext-shared delivery, prefer the installing scope
 *   (enterprise, then team), falling back to the sole bot.
 * - For an ext-shared delivery, prefer the Slack Connect CONTEXT team/enterprise
 *   that hosts the message (not the installing scope). If no confident match
 *   exists, or the context flags a possible truncated list (`needsAuthLookup`),
 *   return undefined to FORCE the runtime's apps.event.authorizations.list
 *   lookup rather than silently returning the wrong (or only) inline token.
 *
 * Returns undefined when Slack supplied no bot authorizations.
 */
export function selectBotAuthorization(ctx) {
    const bots = ctx.authorizations.filter((a) => a.is_bot);
    if (bots.length === 0)
        return undefined;
    if (ctx.isExtSharedChannel) {
        // Prefer the Slack Connect context (the host of the shared message).
        const ctxEnterprise = ctx.contextEnterpriseId
            ? bots.find((a) => a.enterprise_id === ctx.contextEnterpriseId)
            : undefined;
        const ctxTeam = ctx.contextTeamId
            ? bots.find((a) => a.team_id === ctx.contextTeamId)
            : undefined;
        const contextMatch = ctxEnterprise ?? ctxTeam;
        // Only a confident context match is trustworthy on a possibly-truncated list;
        // otherwise force the runtime to do a full authorizations lookup.
        if (contextMatch !== undefined && !ctx.needsAuthLookup)
            return contextMatch;
        return undefined;
    }
    const enterprise = ctx.enterpriseId
        ? bots.find((a) => a.enterprise_id === ctx.enterpriseId)
        : undefined;
    const team = ctx.teamId ? bots.find((a) => a.team_id === ctx.teamId) : undefined;
    return enterprise ?? team ?? bots[0];
}
// ---------------------------------------------------------------------------
// Message-level dedupe key (runtime run candidates)
// ---------------------------------------------------------------------------
//
// This is a DIFFERENT dedupe layer from the native delivery key above:
//   - eventDedupeKey  -> platform DELIVERY identity (Slack event_id). One claim
//                        per delivery; collapses HTTP retries / socket
//                        redeliveries so a delivery is processed once.
//   - slackMessageDedupeKey -> MESSAGE identity for runtime RUN candidates. It
//                        collapses the same logical user message so the runtime
//                        does not re-run (e.g. across replay) on an already-seen
//                        message. It is intentionally NARROW: only NEW user
//                        messages are run candidates.
//
// We key ONLY user-message creation. Edits, deletes, reactions, channel/member
// lifecycle, joins/leaves, and files are NOT run candidates here and get no key
// (the caller must not run-dedupe them on this layer). A self/bot-authored
// message is also excluded: it is an echo, not a user turn to run on.
/** Read a string at `event.source.slack.event[key]`, if present. */
function slackRawString(event, key) {
    const slack = event.source.slack;
    if (slack === undefined || typeof slack !== "object" || Array.isArray(slack)) {
        return undefined;
    }
    const inner = slack["event"];
    if (inner === undefined || typeof inner !== "object" || Array.isArray(inner)) {
        return undefined;
    }
    const v = inner[key];
    return typeof v === "string" ? v : undefined;
}
/** True when the normalized event was flagged as the app's own/bot output. */
function isFromSelfEvent(event) {
    const slack = event.source.slack;
    if (slack === undefined || typeof slack !== "object" || Array.isArray(slack)) {
        return false;
    }
    return slack["fromSelf"] === true;
}
/**
 * Message-level dedupe key for a runtime RUN candidate, or `undefined` when the
 * event is NOT a run candidate or a required field is missing.
 *
 *   slack:message:{account}:{channel}:{ts}:{actor}
 *
 * Returns `undefined` (no guess) when:
 *   - the event is not a brand-new user message (kind !== "message.created");
 *   - the message is self/bot-authored (an echo, not a user turn);
 *   - the Slack `ts`, the actor, the channel, or the account is absent.
 *
 * `ts` comes from the opaque `source.slack.event.ts` (the message's own Slack
 * timestamp, which is its native message id within a channel) — NOT from
 * `occurredAt`, so the key matches Slack's own message identity exactly.
 */
export function slackMessageDedupeKey(event) {
    if (event.platform !== "slack")
        return undefined;
    if (event.kind !== "message.created")
        return undefined;
    if (isFromSelfEvent(event))
        return undefined;
    const account = event.account;
    const channel = event.conversationId;
    const actor = event.actorId;
    const ts = slackRawString(event, "ts");
    if (account === undefined ||
        channel === undefined ||
        actor === undefined ||
        ts === undefined ||
        account === "" ||
        channel === "" ||
        actor === "" ||
        ts === "") {
        return undefined;
    }
    return `slack:message:${account}:${channel}:${ts}:${actor}`;
}
//# sourceMappingURL=identity.js.map