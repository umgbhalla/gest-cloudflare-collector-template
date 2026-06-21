import type { IngestHttpRequest, NormalizedEvent, Platform, ProviderMeta, RawDelivery } from "@gest/ingest-core";
import { TELEGRAM_SECRET_HEADER } from "@gest/ingest-telegram";
/** Per-platform secrets/config the verifiers need, resolved at the route edge. */
export interface PlatformSecrets {
    readonly slackSigningSecret?: string;
    readonly githubWebhookSecret?: string;
    readonly discordPublicKeyHex?: string;
    readonly telegramSecretToken?: string;
    readonly telegramBotId?: string;
    /** Caller epoch seconds for skew math (Slack/Discord); inject for determinism. */
    readonly nowEpochSeconds: number;
    /** Allowed Slack timestamp skew (defaults to the adapter default when unset). */
    readonly slackMaxSkewSeconds?: number;
}
/** Deterministic env the platform ingest entrypoints need. */
export interface IngestIdEnv {
    readonly tenant: string;
    readonly rawId: string;
    readonly receivedAt: string;
    readonly bodyHash: string;
}
/**
 * The neutral outcome of a platform ingest. `verified` is the single gate the ack
 * path uses to decide whether to dedupe + enqueue. A handshake (Slack
 * url_verification / Discord ping / GitHub ping) carries an optional `responseBody`
 * the provider echoes back with a 200, instead of enqueuing work.
 */
export type PlatformIngestOutcome = {
    readonly verified: false;
    readonly raw: RawDelivery;
    readonly reason: string;
} | {
    readonly verified: true;
    readonly handshake: true;
    readonly raw: RawDelivery;
    /** Body the provider returns verbatim (challenge echo / pong / zen). */
    readonly responseBody?: string;
} | {
    readonly verified: true;
    readonly handshake: false;
    readonly raw: RawDelivery;
    readonly nativeKey: string;
    /** Absent when the event is outside the supported normalization set. */
    readonly event?: NormalizedEvent;
};
/**
 * Run the routed platform's verifier + ingest. Throws a deployment-config error
 * (not a silent trust) when a required secret is missing — the fetch guard already
 * fail-closes on a missing secret BEFORE this is called, so reaching here without
 * one is a wiring bug.
 */
export declare function platformIngest(platform: Platform, request: IngestHttpRequest, provider: ProviderMeta, secrets: PlatformSecrets, env: IngestIdEnv): PlatformIngestOutcome;
/** Re-export the telegram secret header so the guard can recognize it if needed. */
export { TELEGRAM_SECRET_HEADER };
//# sourceMappingURL=platform-ingest.d.ts.map