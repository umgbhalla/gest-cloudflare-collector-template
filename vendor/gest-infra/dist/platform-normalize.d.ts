import type { DecodeFailure, NormalizedEvent, Platform, RawDelivery } from "@gest/ingest-core";
/** Decoder version the produced canonical event records, per platform. */
export declare const DECODER_VERSIONS: Readonly<Record<Platform, string>>;
/** Context the normalize step rebuilds from the stored raw + the work payload. */
export interface NormalizeContext {
    readonly tenant: string;
    readonly rawId: string;
    readonly receivedAt: string;
    readonly nativeKey: string;
}
/**
 * The consumer-side outcome of re-normalizing a stored raw delivery. THREE arms,
 * each a distinct downstream policy:
 *  - "event"       -> a canonical event was rebuilt; journal it and run the runtime.
 *  - "unsupported" -> nothing to do: body absent (rejected delivery), JSON/header
 *                     that no longer decodes, or an event type outside the supported
 *                     set. The raw stays durable; the consumer simply skips.
 *  - "undecodable" -> the raw is signed/trusted but the payload is MALFORMED (e.g. a
 *                     garbage/out-of-range ts). This is the ONE post-verify
 *                     decode-failure arm: the consumer journals it as undecodable
 *                     and tags the span — it does NOT 500 and does NOT silently lose
 *                     the raw (already durable). Carries the field-path issues.
 *
 * Collapsing the platform normalizers' `NormalizeResult<T> | undefined` into this
 * shape is the SAME seam for every platform, so malformed-input policy is decided
 * in exactly one place (this module + the consumer that reads it).
 */
export type NormalizeOutcome = {
    readonly kind: "event";
    readonly event: NormalizedEvent;
} | {
    readonly kind: "unsupported";
} | {
    readonly kind: "undecodable";
    readonly failure: DecodeFailure;
};
/**
 * Rebuild the NormalizedEvent from a stored raw delivery, as a NormalizeOutcome.
 * The verdict carried onto the event provenance mirrors the raw record: verified
 * iff the stored signature kind is "verified". This performs NO signature
 * re-verification and NO side effects — replay-safe decode + normalize only.
 */
export declare function normalizeFromRaw(raw: RawDelivery, ctx: NormalizeContext): NormalizeOutcome;
/**
 * Derive the OPTIONAL message-level dedupe key for a normalized event, dispatched
 * per platform. This is the DISTINCT message-dedupe layer (separate keys + TTL
 * from delivery-level dedupe); the platform adapter owns the derivation. For the
 * Slack vertical slice only Slack is wired; the other platforms return undefined
 * (no message dedupe) until they are slotted in — with no dispatcher changes.
 */
export declare function messageDedupeKeyFor(event: NormalizedEvent): string | undefined;
//# sourceMappingURL=platform-normalize.d.ts.map