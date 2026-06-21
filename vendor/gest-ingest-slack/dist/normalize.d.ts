import { type NormalizedEvent, type NormalizeResult, type SignatureKind } from "@gest/ingest-core";
import type { SlackEventCallback } from "./envelope.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export declare const SLACK_DECODER_VERSION = "slack-decoder-1";
/** Inputs needed to place a Slack event into the neutral tenant/account model. */
export interface SlackNormalizeContext {
    /** Product tenant the install belongs to. */
    readonly tenant: string;
    /** Raw delivery id (durable source truth) this event came from. */
    readonly rawId: string;
    /**
     * True ONLY when the delivery's HMAC signature was cryptographically verified
     * (the HTTP path). Socket Mode frames carry NO per-frame signature (the
     * websocket is authenticated at connect time), so they MUST set `verified:
     * false` with `signatureKind: "not-applicable"`. Connect-time transport trust
     * is not signature verification and must not satisfy an "ignore unverified"
     * runtime gate.
     */
    readonly verified: boolean;
    /** The signature verdict kind from the raw delivery, threaded onto provenance. */
    readonly signatureKind: SignatureKind;
    /** When the core received the delivery (ISO-8601). */
    readonly receivedAt: string;
    /** Native dedupe key the identity module computed. */
    readonly nativeKey: string;
}
/**
 * Normalize a Slack event_callback into a NormalizedEvent.
 *
 * Three outcomes, kept distinct (see NormalizeResult):
 *  - `undefined`        -> the inner event is OUTSIDE the first supported set
 *                          (genuinely unsupported; not an error).
 *  - `DecodeFailure`    -> the event IS supported but the signed payload is
 *                          malformed (e.g. a garbage/out-of-range ts). The caller
 *                          turns this into a graceful, observable outcome.
 *  - `ok(event)`        -> the normalized event.
 *
 * The Slack-specific detail is preserved opaquely under source.slack (auth
 * context + inner event + identity).
 */
export declare function normalizeSlackEvent(envelope: SlackEventCallback, ctx: SlackNormalizeContext): NormalizeResult<NormalizedEvent> | undefined;
//# sourceMappingURL=normalize.d.ts.map