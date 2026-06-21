import type { NormalizedEvent, ReplayContext, RuntimeConsumer, RuntimeDecision } from "@gest/ingest-core";
export declare const DEFAULT_RUNTIME_VERSION = "infra-default-1";
/**
 * Deliver-only consumer: records that an event was seen, proposes nothing. Useful
 * as the default wiring and as the replay/dry-run baseline (zero proposals means
 * zero side effects regardless of dryRun).
 */
export declare class DefaultRuntimeConsumer implements RuntimeConsumer {
    readonly runtimeVersion = "infra-default-1";
    consume(event: NormalizedEvent, _context: ReplayContext): RuntimeDecision;
}
/** Singleton default consumer for the common wiring path. */
export declare const defaultRuntimeConsumer: RuntimeConsumer;
//# sourceMappingURL=default-consumer.d.ts.map