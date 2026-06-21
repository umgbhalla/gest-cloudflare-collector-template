import { type Decoder } from "./decode.js";
/** Request to claim a native event key. */
export interface DedupeRequest {
    /** Platform-owned native dedupe key, globally unique per delivery identity. */
    readonly key: string;
    /** Raw delivery this claim is for. */
    readonly rawId: string;
    /** Caller's current time (ISO-8601), for deterministic retention math. */
    readonly now: string;
    /** Retention window in seconds before the key may be reclaimed. */
    readonly retentionSeconds: number;
}
export declare const decodeDedupeRequest: Decoder<DedupeRequest>;
/**
 * Result of a dedupe claim. `duplicate` is the single source of truth: true when
 * the key was already held within its retention window, false on first
 * observation. "claimed" (first observation) is exactly `!duplicate` — derive it
 * at call sites via {@link wasClaimed} rather than storing a second, redundant
 * bit that must be kept in lockstep. `firstRawId` points at the original raw
 * delivery that won the claim, so duplicates remain inspectable.
 */
export interface DedupeClaim {
    readonly key: string;
    readonly duplicate: boolean;
    /** Raw id that originally won this key. */
    readonly firstRawId?: string;
    /** When the original claim was granted (ISO-8601). */
    readonly claimedAt?: string;
}
/** True when this claim was a first observation (i.e. not a duplicate). */
export declare function wasClaimed(claim: DedupeClaim): boolean;
export declare const decodeDedupeClaim: Decoder<DedupeClaim>;
//# sourceMappingURL=dedupe.d.ts.map