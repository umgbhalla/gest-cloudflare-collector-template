import { type NormalizedEvent, type NormalizeResult, type SignatureKind } from "@gest/ingest-core";
import { type GithubEnvelope } from "./envelope.js";
import type { GithubDeliveryIdentity } from "./identity.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export declare const GITHUB_DECODER_VERSION = "github-decoder-1";
/** Inputs needed to place a GitHub event into the neutral tenant/account model. */
export interface GithubNormalizeContext {
    /** Product tenant the install belongs to. */
    readonly tenant: string;
    /** Raw delivery id (durable source truth) this event came from. */
    readonly rawId: string;
    /**
     * True when the raw delivery's HMAC signature (X-Hub-Signature-256) was
     * cryptographically verified. GitHub is HTTP-webhook only — there is no
     * connect-time/socket path — so a delivered event is always HMAC-verified
     * (`signatureKind: "verified"`).
     */
    readonly verified: boolean;
    /** The signature verdict kind from the raw delivery, threaded onto provenance. */
    readonly signatureKind: SignatureKind;
    /** When the core received the delivery (ISO-8601). */
    readonly receivedAt: string;
    /** Native dedupe key the identity module computed. */
    readonly nativeKey: string;
    /** Delivery identity lifted from headers (delivery id, hook id, event name). */
    readonly identity: GithubDeliveryIdentity;
}
/**
 * Normalize a GitHub envelope into a NormalizedEvent.
 *
 * Three outcomes, kept distinct (see NormalizeResult):
 *  - `undefined`     -> the event is outside the first supported set (ping/unknown;
 *                       genuinely unsupported, not an error).
 *  - `DecodeFailure` -> a supported but malformed-but-signed payload (e.g. a
 *                       garbage/out-of-range entity timestamp).
 *  - `ok(event)`     -> the normalized event.
 *
 * All GitHub-specific detail is preserved opaquely under source.github
 * (repository, organization, installation, sender, action, entity identifiers, and
 * the full payload).
 */
export declare function normalizeGithubEvent(envelope: GithubEnvelope, ctx: GithubNormalizeContext): NormalizeResult<NormalizedEvent> | undefined;
//# sourceMappingURL=normalize.d.ts.map