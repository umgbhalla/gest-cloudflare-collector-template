// @gest/ingest-core / replay
//
// Replay reprocesses raw or canonical state with NO external side effects and
// reports decoder version, normalized event ids, runtime version, and a stable
// output hash. Replay is a first-class contract, not a debugging afterthought.
// The core defines the request/report shapes and the capability surface; the
// actual decode/normalize/dry-run logic lives in platform and runtime adapters.
import { decodeArray, decodeBoolean, decodeEnum, decodeIsoTimestamp, decodeNonEmptyString, decodeNonNegativeInt, decodeObject, decodeString, field, optionalField, } from "./decode.js";
import { decodePlatform } from "./platform.js";
/** What a replay reprocesses and how far it carries the pipeline. */
export const REPLAY_MODES = [
    /** Re-decode raw deliveries; verify platform schemas. */
    "raw-decode",
    /** Re-decode and re-normalize; rebuild canonical events. */
    "normalize",
    /** Re-run the runtime consumer as a dry run; compare decisions. */
    "runtime-dry-run",
    /** Inspect outbox intent and results without dispatching. */
    "outbox-audit",
    /** Recompute derived projections from the journal. */
    "projection-rebuild",
];
export const decodeReplayMode = decodeEnum(REPLAY_MODES);
export const decodeReplayRequest = decodeObject({
    mode: field(decodeReplayMode),
    rawIds: optionalField(decodeArray(decodeNonEmptyString)),
    from: optionalField(decodeIsoTimestamp),
    to: optionalField(decodeIsoTimestamp),
    tenant: optionalField(decodeNonEmptyString),
    account: optionalField(decodeNonEmptyString),
    platform: optionalField(decodePlatform),
    decoderVersion: optionalField(decodeNonEmptyString),
    runtimeVersion: optionalField(decodeNonEmptyString),
});
export const decodeReplayError = decodeObject({
    rawId: field(decodeNonEmptyString),
    stage: field(decodeReplayMode),
    message: field(decodeString),
});
export const decodeReplayReport = decodeObject({
    replayId: field(decodeNonEmptyString),
    mode: field(decodeReplayMode),
    inputCount: field(decodeNonNegativeInt),
    eventIds: field(decodeArray(decodeNonEmptyString)),
    decoderVersion: optionalField(decodeNonEmptyString),
    runtimeVersion: optionalField(decodeNonEmptyString),
    errors: field(decodeArray(decodeReplayError)),
    outputHash: field(decodeNonEmptyString),
    sideEffectsSuppressed: field(decodeBoolean),
});
//# sourceMappingURL=replay.js.map