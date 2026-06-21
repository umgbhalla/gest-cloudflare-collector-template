import type { RuntimeConsumer } from "@gest/ingest-core";
export declare const DEFAULT_RUNTIME_VERSION = "infra-default-1";
/**
 * Deliver-only consumer: records that an event was seen, proposes nothing. The
 * default wiring and the replay/dry-run baseline (zero proposals means zero side
 * effects regardless of dryRun). Deterministic: decisionId derives from the event
 * id only, so the same event always yields the same decision and replay is honest.
 * A plain object literal — one instance, no class ceremony for a stateless brain.
 */
export declare const defaultRuntimeConsumer: RuntimeConsumer;
/** The default consumer kind: the safe deliver-only brain the registry falls back to. */
export declare const DEFAULT_RUNTIME_CONSUMER_KIND = "deliver-only";
//# sourceMappingURL=runtime.d.ts.map