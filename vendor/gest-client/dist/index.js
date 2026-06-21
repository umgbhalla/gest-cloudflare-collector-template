// @gest/client — facade CONTRACT types (no runtime).
//
// These are the small, pure types that BOTH the wiring facade (@gest/infra) and
// the DX skin (@gest/bot, @gest/tools) need to agree on: how a consumer is built
// (the ConsumerEnv it receives), how it is registered (ConsumerDefinition), and
// the renderer registry it may render through. They live in this LEAF package —
// depending only on @gest/ingest-core — so the DX packages can reference the
// facade contract WITHOUT a project-reference edge up into the heavy, cloud-bound
// @gest/infra package (which itself references the example consumer). That edge
// would form a tsc project-reference cycle; this leaf breaks it.
//
// HARD SCOPE: pure types only. No createGest, no defineConsumer runtime, no cloud
// bindings, no transport, no LLM/inference/loop. @gest/infra RE-EXPORTS these and
// provides the runtime (createGest/defineConsumer) over them; the DX skin imports
// them TYPE-ONLY. `ConsumerEnv`/`ConsumerDefinition` are generic over the bound
// deployment env (default `unknown`) so the DX skin stays env-agnostic while
// @gest/infra refines `Env = WorkerEnv` at its own call sites.
export {};
//# sourceMappingURL=index.js.map