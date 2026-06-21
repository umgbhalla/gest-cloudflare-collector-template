// @gest/infra / runtime / default consumer
//
// A trivial, deliver-only RuntimeConsumer so the wiring is runnable with NO agent
// runtime. It makes a deterministic no-op decision: it acts=false and proposes
// zero effects. This keeps the consumer + outbox stages exercisable end-to-end
// (journal append, decision record, replay) without baking any agent framework
// into infra — the real runtime is swapped in later by passing a different
// RuntimeConsumer to the consumer wiring.
//
// Determinism: decisionId is derived from the event id only; metadata is a fixed
// shape. The same event always yields the same decision, so replay comparison is
// honest.
export const DEFAULT_RUNTIME_VERSION = "infra-default-1";
/**
 * Deliver-only consumer: records that an event was seen, proposes nothing. Useful
 * as the default wiring and as the replay/dry-run baseline (zero proposals means
 * zero side effects regardless of dryRun).
 */
export class DefaultRuntimeConsumer {
    runtimeVersion = DEFAULT_RUNTIME_VERSION;
    consume(event, _context) {
        return {
            decisionId: `dec_${event.eventId}`,
            runtimeVersion: this.runtimeVersion,
            acted: false,
            proposals: [],
            metadata: { kind: "deliver-only", eventId: event.eventId, eventKind: event.kind },
        };
    }
}
/** Singleton default consumer for the common wiring path. */
export const defaultRuntimeConsumer = new DefaultRuntimeConsumer();
//# sourceMappingURL=default-consumer.js.map