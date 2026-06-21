// @gest/infra / runtime consumer
//
// The deliver-only default RuntimeConsumer (ADR-0004 runtime boundary). The
// consumer is the pluggable decision brain that lives OUTSIDE ingest-core; the
// concrete brain a deployment drives is now chosen by the @gest/client consumer
// registry (defineConsumer + ConsumerRegistry in client.ts / entry.ts), not by a
// string-switch here. This module owns only the safe baseline brain every
// deployment falls back to: deliver-only, which records that an event was seen and
// proposes ZERO effects, so nothing is ever sent.
export const DEFAULT_RUNTIME_VERSION = "infra-default-1";
/**
 * Deliver-only consumer: records that an event was seen, proposes nothing. The
 * default wiring and the replay/dry-run baseline (zero proposals means zero side
 * effects regardless of dryRun). Deterministic: decisionId derives from the event
 * id only, so the same event always yields the same decision and replay is honest.
 * A plain object literal — one instance, no class ceremony for a stateless brain.
 */
export const defaultRuntimeConsumer = {
    runtimeVersion: DEFAULT_RUNTIME_VERSION,
    consume(event, _context) {
        return {
            decisionId: `dec_${event.eventId}`,
            runtimeVersion: DEFAULT_RUNTIME_VERSION,
            acted: false,
            proposals: [],
            metadata: { kind: "deliver-only", eventId: event.eventId, eventKind: event.kind },
        };
    },
};
/** The default consumer kind: the safe deliver-only brain the registry falls back to. */
export const DEFAULT_RUNTIME_CONSUMER_KIND = "deliver-only";
//# sourceMappingURL=runtime.js.map