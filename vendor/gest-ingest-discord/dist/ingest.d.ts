import { type IngestHttpRequest, type NormalizedEvent, type ProviderMeta, type RawDelivery } from "@gest/ingest-core";
import { type DiscordInteraction, type GatewayContext, type GatewayEventEnvelope, type GatewayFrame } from "./envelope.js";
import { type DiscordVerifyOptions } from "./verify.js";
/** Caller-supplied id/clock inputs so ingest stays deterministic and testable. */
export interface DiscordIngestEnv {
    readonly tenant: string;
    /** Stable raw delivery id assigned by the provider adapter. */
    readonly rawId: string;
    /** ISO receive time recorded on the raw delivery and normalized event. */
    readonly receivedAt: string;
    /** Stable hash of the exact bytes (provider/local computes it). */
    readonly bodyHash: string;
}
/** Outcome of ingesting an HTTP interaction delivery. */
export type DiscordHttpIngest = {
    readonly kind: "ping";
    readonly raw: RawDelivery;
    readonly interaction: DiscordInteraction;
} | {
    readonly kind: "rejected";
    readonly raw: RawDelivery;
    readonly reason: string;
} | {
    readonly kind: "interaction";
    readonly raw: RawDelivery;
    readonly interaction: DiscordInteraction;
    readonly nativeKey: string;
    readonly event: NormalizedEvent;
} | {
    readonly kind: "ignored";
    readonly raw: RawDelivery;
    readonly reason: string;
};
/**
 * Ingest a Discord HTTP interaction request: verify the Ed25519 signature over
 * raw bytes, then (only on a verified signature) parse and decode the
 * interaction. Returns durable records for the caller to persist raw-first. A
 * rejected/expired/missing/unsupported signature yields a "rejected" outcome
 * whose raw delivery carries audit metadata only (no attacker-controlled body).
 *
 * PING (type 1) is returned as a typed "ping" outcome; the provider adapter
 * answers with a PONG. It is not a runtime event, so no normalized event is
 * produced.
 */
export declare function ingestDiscordHttp(request: IngestHttpRequest, provider: ProviderMeta, verifyOpts: DiscordVerifyOptions, env: DiscordIngestEnv): DiscordHttpIngest;
/** Outcome of decoding a gateway frame as a long-running runner input. */
export type DiscordGatewayIngest = {
    readonly kind: "control";
    readonly frame: GatewayFrame;
    readonly reason: string;
} | {
    readonly kind: "event";
    readonly frame: GatewayFrame;
    readonly envelope: GatewayEventEnvelope;
    readonly nativeKey: string;
    /** Absent when the event type is outside the first supported set. */
    readonly event?: NormalizedEvent;
} | {
    readonly kind: "undecodable";
    readonly reason: string;
};
/**
 * Decode a Discord gateway frame for a long-running runner. The gateway has no
 * per-frame HTTP signature (the websocket is authenticated at IDENTIFY time), so
 * the signature verdict for these is "not-applicable". Non-dispatch control
 * frames (HELLO/HEARTBEAT_ACK/RECONNECT/INVALID_SESSION) are returned as
 * "control" for the runner to handle (heartbeat/resume). Dispatch frames are
 * keyed and normalized; unsupported event types still produce an envelope + key.
 */
export declare function ingestDiscordGateway(frameInput: unknown, ctx: GatewayContext, env: Pick<DiscordIngestEnv, "tenant" | "rawId" | "receivedAt">): DiscordGatewayIngest;
//# sourceMappingURL=ingest.d.ts.map