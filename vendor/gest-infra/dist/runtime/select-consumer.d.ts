import type { RuntimeConsumer } from "@gest/ingest-core";
/** The selectable runtime-consumer kinds. Default is the safe deliver-only one. */
export declare const RUNTIME_CONSUMER_KINDS: readonly ["deliver-only", "rules"];
export type RuntimeConsumerKind = (typeof RUNTIME_CONSUMER_KINDS)[number];
/** The default kind when RUNTIME_CONSUMER is unset or unrecognized. */
export declare const DEFAULT_RUNTIME_CONSUMER_KIND: RuntimeConsumerKind;
/**
 * Normalize an env string to a known kind, falling back to the safe default.
 * Unknown values never throw: an unset/typo'd env must NOT change behaviour into
 * an unexpected brain — it stays deliver-only (proposes nothing, sends nothing).
 */
export declare function runtimeConsumerKind(raw: string | undefined): RuntimeConsumerKind;
/**
 * Build the concrete RuntimeConsumer for a kind. The rules consumer is
 * constructed fresh (it is a pure function holder; no I/O capabilities); the
 * deliver-only consumer is the shared singleton. Both honour the same contract,
 * so the caller wires the result without knowing which brain it got.
 */
export declare function selectRuntimeConsumer(kind: RuntimeConsumerKind): RuntimeConsumer;
//# sourceMappingURL=select-consumer.d.ts.map