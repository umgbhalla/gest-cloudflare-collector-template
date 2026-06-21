import { type IngestHttpRequest, type NormalizedEvent, type ProviderMeta, type RawDelivery } from "@gest/ingest-core";
import { type SlackEventCallback, type SlackEventsApiEnvelope, type SocketModeEnvelope } from "./envelope.js";
import { type SlackVerifyOptions } from "./verify.js";
/** Caller-supplied id/clock inputs so ingest stays deterministic and testable. */
export interface SlackIngestEnv {
    readonly tenant: string;
    /** Stable raw delivery id assigned by the provider adapter. */
    readonly rawId: string;
    /** ISO receive time recorded on the raw delivery and normalized event. */
    readonly receivedAt: string;
    /** Stable hash of the exact bytes (provider/local computes it). */
    readonly bodyHash: string;
}
/** Outcome of ingesting an HTTP Events API delivery. */
export type SlackHttpIngest = {
    readonly kind: "url_verification";
    readonly raw: RawDelivery;
    /** The challenge the provider adapter must echo back as the HTTP response. */
    readonly challenge: string;
} | {
    readonly kind: "rejected";
    readonly raw: RawDelivery;
    readonly reason: string;
} | {
    readonly kind: "event";
    readonly raw: RawDelivery;
    readonly envelope: SlackEventCallback;
    readonly nativeKey: string;
    /** Absent when the inner event is outside the first supported set. */
    readonly event?: NormalizedEvent;
} | {
    readonly kind: "ignored";
    readonly raw: RawDelivery;
    readonly envelope: SlackEventsApiEnvelope;
    readonly reason: string;
};
/**
 * Ingest a Slack Events API HTTP request: verify over raw bytes, then (only on a
 * verified signature) parse and decode the envelope. Returns durable records for
 * the caller to persist raw-first. A rejected/expired/missing signature yields a
 * "rejected" outcome whose raw delivery carries audit metadata only (no body).
 */
export declare function ingestSlackHttp(request: IngestHttpRequest, provider: ProviderMeta, verifyOpts: SlackVerifyOptions, env: SlackIngestEnv): SlackHttpIngest;
/** Outcome of decoding a Socket Mode frame as a long-running runner input. */
export type SlackSocketIngest = {
    readonly kind: "ack-only";
    readonly frame: SocketModeEnvelope;
    readonly raw: RawDelivery;
    readonly reason: string;
} | {
    readonly kind: "event";
    readonly frame: SocketModeEnvelope;
    readonly raw: RawDelivery;
    readonly envelope: SlackEventCallback;
    readonly nativeKey: string;
    readonly event?: NormalizedEvent;
} | {
    readonly kind: "undecodable";
    readonly reason: string;
};
/**
 * Decode a Socket Mode frame for a long-running runner. Socket Mode has no
 * per-frame HTTP signature: the websocket is authenticated at connect time, so
 * the signature verdict is "not-applicable" (NOT "verified" — connect-time trust
 * is not a per-message HMAC). The runner must still ack by envelope_id (carried
 * on the frame). Non-event frames (hello/disconnect) and non-event_callback
 * payloads are ack-only.
 *
 * Raw-first capture (ADR 0002): on every decodable outcome this returns a durable
 * RawDelivery built over the EXACT frame bytes (env.bodyHash) with the
 * "not-applicable" signature verdict and native retry meta, so socket frames are
 * replayable from source truth just like HTTP deliveries. Only an undecodable
 * frame is raw-less (consistent with not persisting unparseable input).
 *
 * Dedupe: the claim key is the SAME stable HTTP key (eventDedupeKey:
 * `slack:event:{api_app_id}:{scope}:{event_id}`). envelope_id is NOT folded into
 * the claim — Slack does not guarantee a stable envelope_id across reconnect/
 * redelivery, so folding it would let the same logical event be consumed twice.
 * envelope_id (and inner ts) are recorded as correlation metadata only.
 */
export declare function ingestSlackSocket(frameInput: unknown, provider: ProviderMeta, env: Pick<SlackIngestEnv, "tenant" | "rawId" | "receivedAt" | "bodyHash">): SlackSocketIngest;
//# sourceMappingURL=ingest.d.ts.map