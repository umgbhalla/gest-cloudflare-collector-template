// @gest/ingest-dispatch
//
// Provider-neutral generic effect-dispatch loop. Imports ONLY @gest/ingest-core.
//
// Invariants this package keeps (see docs/research/oracle-slack-live-dispatch.md):
// - Platform-agnostic: the caller registers platform codecs (e.g. `{ slack }`);
//   the loop never imports a platform package. No Cloudflare, no Slack, no fetch,
//   no env baked in. Network I/O happens only through the injected transport;
//   credentials resolve only through the injected capability.
// - Side effects flow ONLY through the outbox, at-least-once with idempotency,
//   never claiming global exactly-once external side effects.
// - HTTP status alone is NOT the effect result — the platform codec owns native
//   body interpretation and returns the DispatchDecision the loop applies.
// - Dry-run never dispatches: with `dryRun`, the loop claims nothing and sends
//   nothing (mirrors core `assertNoDispatchInDryRun`).
export { dispatchReady } from "./loop.js";
// Reference / test-only in-memory stores + transport (offline-testable loop).
export { FakeClock, MemoryDispatchDlq, MemoryOutboxDispatchStore, MemoryRateLimitStore, MemoryTransport, jsonResponse, memoryStores, } from "./memory.js";
//# sourceMappingURL=index.js.map