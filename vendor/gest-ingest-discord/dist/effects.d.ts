import { type EffectProposal, type HashFn, type Json } from "@gest/ingest-core";
/** The closed set of Discord effects this adapter can encode. */
export declare const DISCORD_EFFECT_METHODS: readonly ["interaction.response", "interaction.followup", "interaction.edit_response", "channel.message", "channel.reaction", "thread.message"];
export type DiscordEffectMethod = (typeof DISCORD_EFFECT_METHODS)[number];
/** Discord interaction callback type codes for an interaction.response effect. */
export declare const CALLBACK_TYPES: {
    readonly PONG: 1;
    readonly CHANNEL_MESSAGE_WITH_SOURCE: 4;
    readonly DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5;
    readonly DEFERRED_UPDATE_MESSAGE: 6;
    readonly UPDATE_MESSAGE: 7;
    readonly APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8;
    readonly MODAL: 9;
};
export type CallbackType = (typeof CALLBACK_TYPES)[keyof typeof CALLBACK_TYPES];
/** Common context every effect needs to be addressable and rate-keyed. */
export interface DiscordEffectContext {
    /** Application (bot) id the token belongs to; part of every rate bucket. */
    readonly applicationId: string;
    /**
     * Caller-stable idempotency seed. Same intent + same seed => same key, so
     * at-least-once dispatch never double-sends. Usually the causing decision id.
     */
    readonly idempotencySeed: string;
    /** Stable hash function (e.g. @gest/ingest-local hashJson). */
    readonly hash: HashFn;
    /**
     * Opaque credential/install pointer the dispatcher resolves to a token via an
     * injected capability (NEVER a raw token). Defaults to `discord:bot:{applicationId}`.
     */
    readonly credentialRef?: string;
}
/** Initial response to an interaction (including a defer). */
export interface InteractionResponseIntent {
    readonly method: "interaction.response";
    /** Interaction id, recorded for correlation. */
    readonly interactionId: string;
    /** One-time interaction token the response is sent against. */
    readonly interactionToken: string;
    /** Discord interaction callback type (4=message, 5=defer, 9=modal, ...). */
    readonly callbackType: CallbackType;
    /** Opaque callback data (content/components/embeds/choices), passed through. */
    readonly data?: Json;
}
/** A follow-up message on the interaction token. */
export interface InteractionFollowupIntent {
    readonly method: "interaction.followup";
    readonly interactionToken: string;
    readonly content?: string;
    readonly data?: Json;
}
/** Edit of the original interaction response. */
export interface InteractionEditResponseIntent {
    readonly method: "interaction.edit_response";
    readonly interactionToken: string;
    readonly content?: string;
    readonly data?: Json;
}
/** Create a message in a channel. */
export interface ChannelMessageIntent {
    readonly method: "channel.message";
    readonly channelId: string;
    readonly content?: string;
    readonly data?: Json;
}
/** Add a reaction to a message in a channel. */
export interface ChannelReactionIntent {
    readonly method: "channel.reaction";
    readonly channelId: string;
    readonly messageId: string;
    /** URL-form emoji, e.g. "fire" or a custom "name:id". */
    readonly emoji: string;
}
/** Create a message in a thread (a thread is a channel id in Discord). */
export interface ThreadMessageIntent {
    readonly method: "thread.message";
    readonly threadId: string;
    readonly content?: string;
    readonly data?: Json;
}
export type DiscordEffectIntent = InteractionResponseIntent | InteractionFollowupIntent | InteractionEditResponseIntent | ChannelMessageIntent | ChannelReactionIntent | ThreadMessageIntent;
/**
 * Rate key for an interaction-token route. Discord buckets interaction responses/
 * follow-ups by the interaction (its token is the major parameter):
 *   discord:interaction:{application_id}:{method}:{token}
 */
export declare function interactionRateKey(applicationId: string, method: DiscordEffectMethod, token: string): string;
/**
 * Rate key for a channel route. Discord buckets channel routes by channel id (the
 * major parameter): `discord:channel:{application_id}:{method}:{channel}`.
 */
export declare function channelRateKey(applicationId: string, method: DiscordEffectMethod, channelId: string): string;
/** Choose the rate key for an effect (interaction routes vs channel routes). */
export declare function rateKeyForEffect(applicationId: string, intent: DiscordEffectIntent): string;
/**
 * Encode an explicit, runtime-requested Discord effect into an EffectProposal.
 * The idempotency key binds the method + request body + seed, so retries of the
 * same intent collapse while a different intent gets a distinct key. The proposal
 * is NOT dispatched here; the runtime feeds it to `proposalsToOutbox` (core).
 */
export declare function encodeDiscordEffect(intent: DiscordEffectIntent, ctx: DiscordEffectContext): EffectProposal;
//# sourceMappingURL=effects.d.ts.map