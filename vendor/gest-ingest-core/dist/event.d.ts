import { type Json } from "./json.js";
import { type Decoder } from "./decode.js";
import { type Platform } from "./platform.js";
import { type SignatureKind } from "./raw.js";
/**
 * Canonical event families. These are the neutral buckets every platform maps
 * its native events into. `repository` is for code-host events (GitHub) that do
 * not fit the chat-shaped families; chat platforms simply never emit it.
 */
export declare const EVENT_FAMILIES: readonly ["message", "reaction", "member", "channel", "thread", "file", "app", "system", "repository"];
export type EventFamily = (typeof EVENT_FAMILIES)[number];
/**
 * Canonical event kinds, namespaced by family as `family.verb`. Closed set so
 * replay output stays stable. Platform-specific verbs are NOT added here; they
 * remain under `source[platform]` and are documented per platform.
 */
export declare const EVENT_KINDS: readonly ["message.created", "message.edited", "message.deleted", "reaction.added", "reaction.removed", "member.joined", "member.left", "member.updated", "channel.created", "channel.updated", "channel.archived", "thread.created", "thread.updated", "file.shared", "file.removed", "app.mentioned", "app.home_opened", "app.interactive", "system.rate_limited", "system.reconnect", "system.permission_denied", "repository.push", "repository.pull_request", "repository.issue", "repository.release", "repository.check_run", "repository.check_suite", "repository.workflow_run", "repository.dispatch"];
export type EventKind = (typeof EVENT_KINDS)[number];
/** Return the canonical family for a kind. */
export declare function familyOf(kind: EventKind): EventFamily;
/**
 * Trust + provenance metadata carried alongside every normalized event so a
 * runtime can make policy decisions (e.g. ignore unverified deliveries) without
 * re-deriving them. Populated by the platform adapter from the raw delivery.
 */
export interface EventProvenance {
    /**
     * True ONLY when the platform adapter cryptographically verified the raw
     * delivery SIGNATURE (HMAC over exact bytes). A runtime "ignore unverified"
     * policy gates on this. Transport-level trust that is NOT a per-message
     * signature (e.g. a Socket Mode websocket authenticated at connect time) is
     * `verified: false` with `signatureKind: "not-applicable"` — connect-time
     * trust must not satisfy a signature-verification gate.
     */
    readonly verified: boolean;
    /**
     * The signature verdict kind carried from the raw delivery, so audit/replay
     * can distinguish an HMAC-verified HTTP delivery ("verified") from an unsigned
     * socket frame ("not-applicable"). Only `kind === "verified"` is a verified
     * signature; everything else (including "not-applicable") is not. Optional for
     * back-compat with adapters that have not yet threaded the verdict; when
     * present it is authoritative over `verified` for distinguishing transports.
     */
    readonly signatureKind?: SignatureKind;
    /** Raw delivery id this event was decoded from (durable source truth). */
    readonly rawId: string;
    /** Decoder version that produced this event, for replay honesty. */
    readonly decoderVersion: string;
    /** Native event key from the platform adapter, for correlation/dedupe. */
    readonly nativeKey: string;
}
export declare const decodeEventProvenance: Decoder<EventProvenance>;
/**
 * Platform-namespaced source data. Keyed by platform; value is opaque typed JSON
 * owned by that platform adapter. The core never reads inside it. This is the
 * ONLY place platform-specific fields live (source.slack, source.discord,
 * source.telegram, source.github).
 */
export type EventSource = {
    readonly [P in Platform]?: Json;
};
export declare const decodeEventSource: Decoder<EventSource>;
/**
 * The runtime-facing normalized event. Top level is platform-neutral identity +
 * the closed family/kind classification. No Slack/Discord/Telegram/GitHub field
 * appears here; that detail is namespaced under `source`.
 */
export interface NormalizedEvent {
    readonly eventId: string;
    readonly platform: Platform;
    readonly family: EventFamily;
    readonly kind: EventKind;
    readonly tenant: string;
    readonly account: string;
    /** Conversation/room/channel/repo scope the event belongs to. */
    readonly conversationId: string;
    /** Actor id (user/bot/app) when the platform supplies one. */
    readonly actorId?: string;
    /** Thread reference when the event sits in a thread. */
    readonly threadId?: string;
    /** Plain text content when available (messages, etc.). */
    readonly text?: string;
    /** When the core received the delivery (ISO-8601). */
    readonly receivedAt: string;
    /** Logical occurrence time the platform reported (ISO-8601), when supplied. */
    readonly occurredAt?: string;
    readonly provenance: EventProvenance;
    readonly source: EventSource;
}
/**
 * Decode a normalized event AND validate that `kind` belongs to `family`. A
 * mismatched pair yields a structured failure at `kind` so fixtures can assert
 * the family/kind contract is enforced, not just the individual enums.
 */
export declare const decodeNormalizedEvent: Decoder<NormalizedEvent>;
export declare const decodeEventFamily: Decoder<EventFamily>;
export declare const decodeEventKind: Decoder<EventKind>;
/** Decode a list of normalized events (replay batches, fixtures). */
export declare const decodeNormalizedEvents: Decoder<readonly NormalizedEvent[]>;
//# sourceMappingURL=event.d.ts.map