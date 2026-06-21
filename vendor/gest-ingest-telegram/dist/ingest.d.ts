import { type IngestHttpRequest, type NormalizedEvent, type ProviderMeta, type RawDelivery } from "@gest/ingest-core";
import { type TelegramUpdate } from "./envelope.js";
import { type TelegramTransport } from "./normalize.js";
import { type TelegramVerifyOptions } from "./verify.js";
/** Caller-supplied id/clock/identity inputs so ingest stays deterministic. */
export interface TelegramIngestEnv {
    readonly tenant: string;
    /** Numeric bot id; the account scope and part of the dedupe identity. */
    readonly botId: string;
    /** Stable raw delivery id assigned by the provider adapter. */
    readonly rawId: string;
    /** ISO receive time recorded on the raw delivery and normalized event. */
    readonly receivedAt: string;
    /** Stable hash of the exact bytes (provider/local computes it). */
    readonly bodyHash: string;
}
/** Outcome of ingesting a single webhook delivery. */
export type TelegramWebhookIngest = {
    readonly kind: "rejected";
    readonly raw: RawDelivery;
    readonly reason: string;
} | {
    readonly kind: "ignored";
    readonly raw: RawDelivery;
    readonly update?: TelegramUpdate;
    readonly nativeKey?: string;
    readonly reason: string;
} | {
    readonly kind: "update";
    readonly raw: RawDelivery;
    readonly update: TelegramUpdate;
    readonly nativeKey: string;
    readonly event: NormalizedEvent;
};
/**
 * Ingest a Telegram webhook request: authenticate the secret-token header, then
 * (only on a verified token) parse and decode the Update. Returns durable records
 * for the caller to persist raw-first. A non-verified token yields a "rejected"
 * outcome whose raw delivery carries audit metadata only (no attacker body).
 *
 * A decoded update whose content kind is outside the supported set yields an
 * "ignored" outcome that STILL carries the native dedupe key, so the caller can
 * record the raw + claim the key (at-least-once dedupe) without emitting an event.
 */
export declare function ingestTelegramWebhook(request: IngestHttpRequest, provider: ProviderMeta, verifyOpts: TelegramVerifyOptions, env: TelegramIngestEnv): TelegramWebhookIngest;
/** A single decoded polling update plus its durable records. */
export interface TelegramPolledUpdate {
    readonly update: TelegramUpdate;
    readonly nativeKey: string;
    /** Absent when the content kind is outside the supported set. */
    readonly event?: NormalizedEvent;
}
/** Outcome of ingesting a getUpdates polling batch. */
export type TelegramPollingIngest = {
    readonly kind: "undecodable";
    readonly raw: RawDelivery;
    readonly reason: string;
} | {
    readonly kind: "batch";
    readonly raw: RawDelivery;
    readonly updates: readonly TelegramPolledUpdate[];
};
/**
 * Ingest a getUpdates polling batch. The bot owns the (authenticated) getUpdates
 * call, so the signature verdict is "not-applicable"; the body is already
 * trusted. Each Update in the batch is keyed (same rule as webhook) and
 * normalized; unsupported content kinds still produce a key for at-least-once
 * dedupe but no normalized event.
 *
 * The caller advances the getUpdates `offset` ONLY after durably recording this
 * batch's raw + keys; that, plus the bot-id+update-id dedupe key, is what makes a
 * re-fetched update collapse to one claim (at-least-once, not exactly-once).
 */
export declare function ingestTelegramPolling(rawBody: Uint8Array, provider: ProviderMeta, env: TelegramIngestEnv): TelegramPollingIngest;
export type { TelegramTransport };
//# sourceMappingURL=ingest.d.ts.map