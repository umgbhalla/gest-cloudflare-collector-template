import { type Decoder, type NormalizedEvent } from "@gest/ingest-core";
import type { SlackAuthorization, SlackEventCallback } from "./envelope.js";
/**
 * The workspace/enterprise scope a delivery belongs to. Enterprise id wins when
 * present (enterprise installs span teams); otherwise team id; otherwise the
 * literal "unknown" so the key never collapses across apps silently.
 */
export declare function scopeOf(envelope: SlackEventCallback): string;
/**
 * Native dedupe key for an Events API delivery:
 *   slack:event:{api_app_id}:{enterprise_or_team}:{event_id}
 */
export declare function eventDedupeKey(envelope: SlackEventCallback): string;
/** Socket Mode ack/audit correlation, kept OFF the dedupe-claim key. */
export interface SocketCorrelation {
    /** The stable dedupe-claim key (same as the HTTP path). */
    readonly dedupeKey: string;
    /** The frame's envelope id, used to ack and to correlate redeliveries. */
    readonly envelopeId?: string;
    /** Inner event ts, for audit correlation. */
    readonly innerTs?: string;
}
/**
 * Build Socket Mode correlation metadata. The dedupe-claim key is the SAME stable
 * key the HTTP path uses (`eventDedupeKey`): Slack does not guarantee a stable
 * envelope_id across reconnect/redelivery, so envelope_id is NOT part of the
 * claim — a redelivery of the same event_id must collapse to one claim. The
 * envelope id and inner ts are returned separately for ack/audit correlation only.
 */
export declare function socketCorrelation(envelope: SlackEventCallback, envelopeId: string | undefined): SocketCorrelation;
/**
 * Persisted authorization + Slack Connect context for a delivery. This is durable
 * per-delivery provenance the runtime needs to pick a token (Slack Connect token
 * selection) without re-deriving it. It is recorded under source.slack and is
 * also independently decodable for an authorizations store.
 */
export interface SlackAuthContext {
    readonly apiAppId: string;
    /** Installing team, when this delivery is team-scoped. */
    readonly teamId?: string;
    /** Installing enterprise grid, when enterprise-installed. */
    readonly enterpriseId?: string;
    /** Slack Connect context team (the shared channel's host team). */
    readonly contextTeamId?: string;
    readonly contextEnterpriseId?: string;
    /** True when the delivery crosses a Slack Connect / external shared channel. */
    readonly isExtSharedChannel: boolean;
    /** Authorizations Slack attached (who the app may act as). */
    readonly authorizations: readonly SlackAuthorization[];
    /**
     * True when the inline `authorizations` array may be TRUNCATED and the runtime
     * must call apps.event.authorizations.list for the full set before selecting a
     * token. Slack truncates `authorizations` (typically to one entry) on shared-
     * channel / multi-team deliveries, so the inline list is NOT authoritative there.
     * Set whenever the delivery is ext-shared-channel (multi-team safety).
     */
    readonly needsAuthLookup: boolean;
}
/** Derive the durable auth + Slack Connect context from an event callback. */
export declare function authContextOf(envelope: SlackEventCallback): SlackAuthContext;
/** Decoder so the auth context can round-trip through a store/fixture. */
export declare const decodeSlackAuthContext: Decoder<SlackAuthContext>;
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
export declare function selectBotAuthorization(ctx: SlackAuthContext): SlackAuthorization | undefined;
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
export declare function slackMessageDedupeKey(event: NormalizedEvent): string | undefined;
//# sourceMappingURL=identity.d.ts.map