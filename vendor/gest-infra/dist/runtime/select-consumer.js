// @gest/infra / runtime / consumer selector
//
// The config switch that picks WHICH RuntimeConsumer the queue consumer drives
// (ADR-0004 runtime boundary). The consumer is the pluggable decision brain that
// lives OUTSIDE ingest-core: this module is the one place infra binds a concrete
// consumer into the wiring. The choice is deployment glue, never policy — every
// option satisfies the SAME core RuntimeConsumer contract, so the consumer ->
// outbox -> dispatch stages are identical regardless of which one is selected.
//
//   "deliver-only" (DEFAULT): the trivial no-op consumer. Records that an event
//     was seen and proposes ZERO effects. Safe baseline; nothing is ever sent.
//   "rules": @gest/consumer-rules, the deterministic example brain. On a Slack
//     app_mention it proposes a chat.postMessage reply (built via the Slack
//     effect encoder, with a real idempotencyKey / rateKeys / credentialRef);
//     every other event is acted:false with zero proposals.
//
// To plug your OWN agent/runtime: implement the core RuntimeConsumer interface in
// its own package (import @gest/ingest-core + the platform effect encoder you
// need, NOT a provider package), add a case here, and select it via the
// RUNTIME_CONSUMER env var. No consumer/dispatch code changes.
import { createSlackReplyConsumer } from "@gest/consumer-rules";
import { defaultRuntimeConsumer } from "./default-consumer.js";
/** The selectable runtime-consumer kinds. Default is the safe deliver-only one. */
export const RUNTIME_CONSUMER_KINDS = ["deliver-only", "rules"];
/** The default kind when RUNTIME_CONSUMER is unset or unrecognized. */
export const DEFAULT_RUNTIME_CONSUMER_KIND = "deliver-only";
/**
 * Normalize an env string to a known kind, falling back to the safe default.
 * Unknown values never throw: an unset/typo'd env must NOT change behaviour into
 * an unexpected brain — it stays deliver-only (proposes nothing, sends nothing).
 */
export function runtimeConsumerKind(raw) {
    return raw !== undefined && RUNTIME_CONSUMER_KINDS.includes(raw)
        ? raw
        : DEFAULT_RUNTIME_CONSUMER_KIND;
}
/**
 * Build the concrete RuntimeConsumer for a kind. The rules consumer is
 * constructed fresh (it is a pure function holder; no I/O capabilities); the
 * deliver-only consumer is the shared singleton. Both honour the same contract,
 * so the caller wires the result without knowing which brain it got.
 */
export function selectRuntimeConsumer(kind) {
    switch (kind) {
        case "rules":
            return createSlackReplyConsumer();
        case "deliver-only":
            return defaultRuntimeConsumer;
    }
}
//# sourceMappingURL=select-consumer.js.map