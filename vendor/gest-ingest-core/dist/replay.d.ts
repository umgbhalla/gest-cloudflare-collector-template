import { type Decoder } from "./decode.js";
import { type Platform } from "./platform.js";
/** What a replay reprocesses and how far it carries the pipeline. */
export declare const REPLAY_MODES: readonly ["raw-decode", "normalize", "runtime-dry-run", "outbox-audit", "projection-rebuild"];
export type ReplayMode = (typeof REPLAY_MODES)[number];
/** Inputs that select what to replay. All effect dispatch is suppressed. */
export interface ReplayRequest {
    readonly mode: ReplayMode;
    /** Explicit raw delivery ids to replay, when targeting specific deliveries. */
    readonly rawIds?: readonly string[];
    /** Inclusive time range start (ISO-8601). */
    readonly from?: string;
    /** Inclusive time range end (ISO-8601). */
    readonly to?: string;
    readonly tenant?: string;
    readonly account?: string;
    readonly platform?: Platform;
    /** Pin a decoder version for deterministic replay. */
    readonly decoderVersion?: string;
    /** Pin a runtime version for deterministic dry runs. */
    readonly runtimeVersion?: string;
}
export declare const decodeReplayMode: Decoder<ReplayMode>;
export declare const decodeReplayRequest: Decoder<ReplayRequest>;
/** A per-delivery error encountered during replay. */
export interface ReplayError {
    readonly rawId: string;
    readonly stage: ReplayMode;
    readonly message: string;
}
export declare const decodeReplayError: Decoder<ReplayError>;
/**
 * Replay report. `outputHash` is the stable hash of the deterministic output so
 * two replays of the same inputs with pinned versions can be compared exactly.
 */
export interface ReplayReport {
    readonly replayId: string;
    readonly mode: ReplayMode;
    /** Count of raw deliveries considered. */
    readonly inputCount: number;
    /** Canonical event ids produced (normalize / runtime-dry-run modes). */
    readonly eventIds: readonly string[];
    readonly decoderVersion?: string;
    readonly runtimeVersion?: string;
    readonly errors: readonly ReplayError[];
    /** Stable hash of the deterministic replay output. */
    readonly outputHash: string;
    /** True when no external side effect was performed (always expected true). */
    readonly sideEffectsSuppressed: boolean;
}
export declare const decodeReplayReport: Decoder<ReplayReport>;
/** The replay capability surface (no implementation in the core). */
export interface ReplayApi {
    replay(request: ReplayRequest): Promise<ReplayReport>;
}
//# sourceMappingURL=replay.d.ts.map