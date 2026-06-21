import { type EffectProposal, type HashFn, type Json } from "@gest/ingest-core";
/** The closed set of Slack effects this adapter can encode. */
export declare const SLACK_EFFECT_METHODS: readonly ["chat.postMessage", "chat.update", "reactions.add", "reactions.remove", "conversations.archive"];
export type SlackEffectMethod = (typeof SLACK_EFFECT_METHODS)[number];
/** Common context every effect needs to be addressable and rate-keyed. */
export interface SlackEffectContext {
    /** Workspace/enterprise scope (the install the token belongs to). */
    readonly scope: string;
    /**
     * Caller-stable idempotency seed. Same intent + same seed => same key, so
     * at-least-once dispatch never double-sends. Usually the causing decision id.
     */
    readonly idempotencySeed: string;
    /** Stable hash function (e.g. @gest/ingest-local hashJson). */
    readonly hash: HashFn;
    /**
     * Opaque credential/install pointer the dispatcher resolves to a bot token via
     * an injected capability (NEVER a raw token here). Defaults to a scope-derived
     * ref `slack:bot:{scope}` when the caller does not supply one.
     */
    readonly credentialRef?: string;
}
/**
 * Rate buckets an effect counts against. Slack tiers limits per Web API method
 * per workspace AND, for posting, additionally per channel. A `chat.postMessage`
 * row therefore counts against BOTH the method bucket and the channel-post
 * bucket; a dispatcher must only send the row when ALL returned buckets are
 * currently available (and defer the row if any is throttled). Every other
 * method counts against the single method bucket.
 *
 * Order is [method, channel-post] so the broader workspace bucket is listed
 * first; callers must treat the list as a set, not rely on positional meaning.
 */
export declare function rateKeysForSlackEffect(scope: string, intent: SlackEffectIntent): readonly string[];
export interface PostMessageIntent {
    readonly method: "chat.postMessage";
    readonly channel: string;
    readonly text: string;
    readonly threadTs?: string;
    /** Opaque Slack blocks/attachments passed through untouched. */
    readonly blocks?: Json;
}
export interface UpdateMessageIntent {
    readonly method: "chat.update";
    readonly channel: string;
    readonly ts: string;
    readonly text: string;
    readonly blocks?: Json;
}
export interface ReactionIntent {
    readonly method: "reactions.add" | "reactions.remove";
    readonly channel: string;
    readonly timestamp: string;
    readonly name: string;
}
export interface ArchiveIntent {
    readonly method: "conversations.archive";
    readonly channel: string;
}
export type SlackEffectIntent = PostMessageIntent | UpdateMessageIntent | ReactionIntent | ArchiveIntent;
/**
 * Rate key for a Web API method, scoped to the install. Slack tiers limits per
 * method per workspace, so the bucket is `slack:method:{scope}:{method}`.
 */
export declare function methodRateKey(scope: string, method: SlackEffectMethod): string;
/**
 * Rate key for posting into a specific channel. Slack additionally limits message
 * posting per channel (~1 msg/sec), so posting effects carry a channel bucket:
 * `slack:channel-post:{scope}:{channel}`.
 */
export declare function channelPostRateKey(scope: string, channel: string): string;
/**
 * Choose the rate key for an effect. Posting methods bucket per channel (the
 * tighter limit); other methods bucket per Web API method.
 */
export declare function rateKeyForEffect(scope: string, intent: SlackEffectIntent): string;
/**
 * Encode an explicit, runtime-requested Slack effect into an EffectProposal. The
 * idempotency key binds the method + request body + seed, so retries of the same
 * intent collapse while a different intent gets a distinct key. The proposal is
 * NOT dispatched here; the runtime feeds it to `proposalsToOutbox` (core).
 */
export declare function encodeSlackEffect(intent: SlackEffectIntent, ctx: SlackEffectContext): EffectProposal;
//# sourceMappingURL=effects.d.ts.map