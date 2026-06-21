// @gest/ingest-slack / effects
//
// Slack outbox effect encoding. A runtime consumer composes effect intents; this
// module turns an explicit, runtime-requested intent into a typed EffectProposal
// the core records in the outbox (the ONLY side-effect path). Hard rule: effects
// are encoded ONLY when the runtime explicitly requests them. This module never
// invents an effect from an inbound event; it just shapes what the runtime asked
// for into the core contract, with stable idempotency keys and rate keys.
//
// Supported methods (and ONLY these):
//   - chat.postMessage
//   - chat.update
//   - reactions.add
//   - reactions.remove
//   - conversations.archive
//
// Rate keys are explicit and platform-owned (gest hard rule). Slack rate-limits
// per Web API method AND, for posting, per channel; we encode BOTH facets into a
// composite rate key so a dispatcher can bucket on either.
import {} from "@gest/ingest-core";
/** The closed set of Slack effects this adapter can encode. */
export const SLACK_EFFECT_METHODS = [
    "chat.postMessage",
    "chat.update",
    "reactions.add",
    "reactions.remove",
    "conversations.archive",
];
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
export function rateKeysForSlackEffect(scope, intent) {
    if (intent.method === "chat.postMessage") {
        return [methodRateKey(scope, intent.method), channelPostRateKey(scope, intent.channel)];
    }
    return [methodRateKey(scope, intent.method)];
}
/**
 * Rate key for a Web API method, scoped to the install. Slack tiers limits per
 * method per workspace, so the bucket is `slack:method:{scope}:{method}`.
 */
export function methodRateKey(scope, method) {
    return `slack:method:${scope}:${method}`;
}
/**
 * Rate key for posting into a specific channel. Slack additionally limits message
 * posting per channel (~1 msg/sec), so posting effects carry a channel bucket:
 * `slack:channel-post:{scope}:{channel}`.
 */
export function channelPostRateKey(scope, channel) {
    return `slack:channel-post:${scope}:${channel}`;
}
/**
 * Choose the rate key for an effect. Posting methods bucket per channel (the
 * tighter limit); other methods bucket per Web API method.
 */
export function rateKeyForEffect(scope, intent) {
    if (intent.method === "chat.postMessage") {
        return channelPostRateKey(scope, intent.channel);
    }
    return methodRateKey(scope, intent.method);
}
/** The destination an effect targets (always the channel for our methods). */
function destinationOf(intent) {
    return intent.channel;
}
/** Build the typed Slack request body for an intent (opaque to the core). */
function requestBodyOf(intent) {
    switch (intent.method) {
        case "chat.postMessage":
            return {
                channel: intent.channel,
                text: intent.text,
                ...(intent.threadTs === undefined ? {} : { thread_ts: intent.threadTs }),
                ...(intent.blocks === undefined ? {} : { blocks: intent.blocks }),
            };
        case "chat.update":
            return {
                channel: intent.channel,
                ts: intent.ts,
                text: intent.text,
                ...(intent.blocks === undefined ? {} : { blocks: intent.blocks }),
            };
        case "reactions.add":
        case "reactions.remove":
            return { channel: intent.channel, timestamp: intent.timestamp, name: intent.name };
        case "conversations.archive":
            return { channel: intent.channel };
    }
}
/**
 * Encode an explicit, runtime-requested Slack effect into an EffectProposal. The
 * idempotency key binds the method + request body + seed, so retries of the same
 * intent collapse while a different intent gets a distinct key. The proposal is
 * NOT dispatched here; the runtime feeds it to `proposalsToOutbox` (core).
 */
export function encodeSlackEffect(intent, ctx) {
    const requestBody = requestBodyOf(intent);
    const requestHash = ctx.hash(requestBody);
    const idempotencyKey = ctx.hash({
        seed: ctx.idempotencySeed,
        method: intent.method,
        requestHash,
    });
    const proposal = {
        platform: "slack",
        method: intent.method,
        destination: destinationOf(intent),
        idempotencyKey,
        rateKey: rateKeyForEffect(ctx.scope, intent),
        rateKeys: rateKeysForSlackEffect(ctx.scope, intent),
        credentialRef: ctx.credentialRef ?? `slack:bot:${ctx.scope}`,
        requestHash,
        requestBody,
    };
    return proposal;
}
//# sourceMappingURL=effects.js.map