// @gest/ingest-discord / effects
//
// Discord outbox effect encoding. A runtime consumer composes effect intents;
// this module turns an explicit, runtime-requested intent into a typed
// EffectProposal the core records in the outbox (the ONLY side-effect path). Hard
// rule: effects are encoded ONLY when the runtime explicitly requests them. This
// module never invents an effect from an inbound event; it just shapes what the
// runtime asked for into the core contract, with stable idempotency keys and rate
// keys.
//
// Supported effects (and ONLY these):
//   - interaction.response       (initial response to an interaction, incl. defer)
//   - interaction.followup       (a follow-up message on the interaction token)
//   - interaction.edit_response  (edit the original interaction response)
//   - channel.message            (create a message in a channel)
//   - channel.reaction           (add a reaction to a message)
//   - thread.message             (create a message in a thread)
//
// Rate keys are explicit and platform-owned (gest hard rule). Discord rate-limits
// per route + major parameter (channel id, or the interaction token for
// interaction routes), so we encode that bucket into the rate key. Interaction
// responses ALSO observe a global 3-second deadline; the runtime owns the timing,
// not this encoder.
import { isJsonObject } from "@gest/ingest-core";
/** The closed set of Discord effects this adapter can encode. */
export const DISCORD_EFFECT_METHODS = [
    "interaction.response",
    "interaction.followup",
    "interaction.edit_response",
    "channel.message",
    "channel.reaction",
    "thread.message",
];
/** Discord interaction callback type codes for an interaction.response effect. */
export const CALLBACK_TYPES = {
    PONG: 1,
    CHANNEL_MESSAGE_WITH_SOURCE: 4,
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
    DEFERRED_UPDATE_MESSAGE: 6,
    UPDATE_MESSAGE: 7,
    APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
    MODAL: 9,
};
/**
 * Rate key for an interaction-token route. Discord buckets interaction responses/
 * follow-ups by the interaction (its token is the major parameter):
 *   discord:interaction:{application_id}:{method}:{token}
 */
export function interactionRateKey(applicationId, method, token) {
    return `discord:interaction:${applicationId}:${method}:${token}`;
}
/**
 * Rate key for a channel route. Discord buckets channel routes by channel id (the
 * major parameter): `discord:channel:{application_id}:{method}:{channel}`.
 */
export function channelRateKey(applicationId, method, channelId) {
    return `discord:channel:${applicationId}:${method}:${channelId}`;
}
/** Choose the rate key for an effect (interaction routes vs channel routes). */
export function rateKeyForEffect(applicationId, intent) {
    switch (intent.method) {
        case "interaction.response":
        case "interaction.followup":
        case "interaction.edit_response":
            return interactionRateKey(applicationId, intent.method, intent.interactionToken);
        case "channel.message":
        case "channel.reaction":
            return channelRateKey(applicationId, intent.method, intent.channelId);
        case "thread.message":
            return channelRateKey(applicationId, intent.method, intent.threadId);
    }
}
/** The destination an effect targets (channel/thread id, or the interaction). */
function destinationOf(intent) {
    switch (intent.method) {
        case "interaction.response":
        case "interaction.followup":
        case "interaction.edit_response":
            return intent.interactionToken;
        case "channel.message":
        case "channel.reaction":
            return intent.channelId;
        case "thread.message":
            return intent.threadId;
    }
}
/** Build the typed Discord request body for an intent (opaque to the core). */
function requestBodyOf(intent) {
    switch (intent.method) {
        case "interaction.response":
            return {
                type: intent.callbackType,
                ...(intent.data === undefined ? {} : { data: intent.data }),
            };
        case "interaction.followup":
        case "interaction.edit_response":
        case "channel.message":
        case "thread.message":
            // Non-callback message routes expect message fields (content, embeds,
            // components, allowed_mentions, flags) at the TOP LEVEL of the body, not
            // nested under `data` (only the callback route nests under `data`).
            return {
                ...(intent.content === undefined ? {} : { content: intent.content }),
                ...(isJsonObject(intent.data) ? intent.data : {}),
            };
        case "channel.reaction":
            return { messageId: intent.messageId, emoji: intent.emoji };
    }
}
/**
 * Encode an explicit, runtime-requested Discord effect into an EffectProposal.
 * The idempotency key binds the method + request body + seed, so retries of the
 * same intent collapse while a different intent gets a distinct key. The proposal
 * is NOT dispatched here; the runtime feeds it to `proposalsToOutbox` (core).
 */
export function encodeDiscordEffect(intent, ctx) {
    const requestBody = requestBodyOf(intent);
    const requestHash = ctx.hash(requestBody);
    const idempotencyKey = ctx.hash({
        seed: ctx.idempotencySeed,
        method: intent.method,
        destination: destinationOf(intent),
        requestHash,
    });
    const rateKey = rateKeyForEffect(ctx.applicationId, intent);
    const proposal = {
        platform: "discord",
        method: intent.method,
        destination: destinationOf(intent),
        idempotencyKey,
        rateKey,
        rateKeys: [rateKey],
        credentialRef: ctx.credentialRef ?? `discord:bot:${ctx.applicationId}`,
        requestHash,
        requestBody,
    };
    return proposal;
}
//# sourceMappingURL=effects.js.map