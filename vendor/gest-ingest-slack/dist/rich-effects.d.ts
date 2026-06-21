import { type EffectProposal, type GestRichMessage, type HashFn, type PlatformMessageRenderer } from "@gest/ingest-core";
/** The single rich-post method this encoder targets. */
export declare const SLACK_RICH_POST_METHOD: "chat.postMessage";
/**
 * A runtime-authored request to post a rich message to Slack. The author writes
 * ONE `GestRichMessage`; the renderer fans it out to the native body. `threadTs`
 * is the optional Slack thread anchor (mapped to the renderer's neutral
 * `GestThreadRef`).
 */
export interface SlackRichPostIntent {
    readonly method: typeof SLACK_RICH_POST_METHOD;
    /** Slack channel id the message targets (also the rate-key + destination). */
    readonly channel: string;
    /** Optional Slack `thread_ts` to reply in-thread. */
    readonly threadTs?: string;
    /** The authored, platform-neutral message. */
    readonly message: GestRichMessage;
}
/**
 * Context `encodeSlackRichPost` needs. The renderer is INJECTED — ingest-slack
 * never imports the render package; the caller/infra supplies a pure,
 * version-pinned `PlatformMessageRenderer` for "slack". Everything else mirrors
 * the plain `SlackEffectContext`: scope (the install the token belongs to), a
 * caller-stable idempotency seed, a stable hash fn, and an optional opaque
 * credential ref.
 */
export interface SlackRichPostContext {
    /**
     * The injected Slack renderer. Pure + deterministic + version-pinned. Its
     * `rendererVersion` is mixed into `requestHash`, so replay stays stable and a
     * renderer bump is visible in the hash. Must target platform "slack".
     */
    readonly renderer: PlatformMessageRenderer;
    /** Workspace/enterprise scope (the install the token belongs to). */
    readonly scope: string;
    /** Caller-stable idempotency seed; same intent + seed => same key. */
    readonly idempotencySeed: string;
    /** Stable hash function (e.g. @gest/ingest-local hashJson). */
    readonly hash: HashFn;
    /**
     * Opaque credential/install pointer the dispatcher resolves to a bot token via
     * an injected capability (NEVER a raw token). Defaults to `slack:bot:{scope}`.
     */
    readonly credentialRef?: string;
}
/**
 * Encode a runtime-requested rich Slack post into an `EffectProposal` whose
 * `requestBody` is the FINAL native Block Kit / mrkdwn body the injected renderer
 * produced, and whose `requestHash` is bound to the renderer version.
 *
 * Path: GestRichMessage -> renderer.render(...) -> native body -> EffectProposal.
 * The proposal is NOT dispatched here; the runtime feeds it to `proposalsToOutbox`
 * (core), which records a pending outbox row carrying that exact body + hash.
 *
 * Determinism / replay-stability: the only non-constant inputs are the message,
 * the channel/thread, the scope/seed, and the renderer (pure + version-pinned).
 * Re-running with the same inputs re-derives the identical body, hence the
 * identical `requestHash` and `idempotencyKey`.
 *
 * Throws if the injected renderer does not target Slack: silently encoding a
 * non-Slack body into a Slack effect would produce a row the Slack codec cannot
 * dispatch correctly. Failing here keeps the wiring bug at the boundary.
 */
export declare function encodeSlackRichPost(intent: SlackRichPostIntent, ctx: SlackRichPostContext): EffectProposal;
//# sourceMappingURL=rich-effects.d.ts.map