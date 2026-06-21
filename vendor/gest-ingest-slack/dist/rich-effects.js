// @gest/ingest-slack / rich effect encoding (pure, I/O-free)
//
// The uniform "send a rich message to Slack" entry point. A runtime consumer
// authors ONE neutral `GestRichMessage` (text | markdown | card | blocks) and
// calls `encodeSlackRichPost` to get a typed `EffectProposal` for the outbox —
// the same single call no matter which authored kind it carries. The native
// Block Kit / mrkdwn fan-out happens HERE, at effect-ENCODE time, via an
// INJECTED `PlatformMessageRenderer`. Rendering is never deferred to dispatch.
//
// Boundary rules (ADR-0005 + gest unified outbound):
// - This module imports ONLY @gest/ingest-core. It does NOT import the render
//   bridge (`@gest/render-chat-sdk-slack`) or chat-sdk. The renderer is a
//   capability the caller/infra injects through the neutral
//   `PlatformMessageRenderer` contract, so ingest-slack stays chat-sdk-free.
// - The outbox row carries the FINAL native request body the renderer produced.
//   `requestHash` is `hash({ rendererVersion, requestBody })`, so it is BOUND to
//   the renderer version: a renderer/version bump moves the body and/or the hash.
// - Rendering is pure + deterministic + version-pinned, so a replay that
//   re-derives the same proposal (same message + same rendererVersion) yields the
//   identical `requestBody` and the identical `requestHash` — replay-stable.
// - Effects are encoded ONLY when the runtime explicitly requests them; this
//   never invents an effect from an inbound event. It just shapes the request.
import {} from "@gest/ingest-core";
import { channelPostRateKey, methodRateKey, } from "./effects.js";
/** The single rich-post method this encoder targets. */
export const SLACK_RICH_POST_METHOD = "chat.postMessage";
/** Map the intent's Slack `thread_ts` to the renderer's neutral thread ref. */
function threadRefOf(intent) {
    return intent.threadTs === undefined ? undefined : { threadId: intent.threadTs };
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
export function encodeSlackRichPost(intent, ctx) {
    if (ctx.renderer.platform !== "slack") {
        throw new Error(`encodeSlackRichPost requires a slack renderer, got "${ctx.renderer.platform}"`);
    }
    const renderInput = {
        method: intent.method,
        destination: intent.channel,
        message: intent.message,
        ...(threadRefOf(intent) === undefined ? {} : { threadRef: threadRefOf(intent) }),
    };
    const rendered = ctx.renderer.render(renderInput);
    const requestBody = rendered.requestBody;
    // requestHash is BOUND to the renderer version: same message + same version =>
    // same body => same hash (replay-stable); a renderer bump moves the hash even
    // if the body is byte-identical.
    const requestHash = ctx.hash({
        rendererVersion: rendered.rendererVersion,
        requestBody,
    });
    // Idempotency binds the seed + method + renderer-bound request hash, so retries
    // of the same authored intent at the same renderer version collapse, while a
    // changed message (or renderer version) gets a distinct key.
    const idempotencyKey = ctx.hash({
        seed: ctx.idempotencySeed,
        method: intent.method,
        requestHash,
    });
    // Slack tiers postMessage limits per method (workspace) AND per channel; carry
    // BOTH buckets (reusing the existing Slack rate-key logic). Legacy single
    // `rateKey` is the tighter channel-post bucket.
    const channelRateKey = channelPostRateKey(ctx.scope, intent.channel);
    const rateKeys = [
        methodRateKey(ctx.scope, intent.method),
        channelRateKey,
    ];
    const proposal = {
        platform: "slack",
        method: intent.method,
        destination: intent.channel,
        idempotencyKey,
        rateKey: channelRateKey,
        rateKeys,
        credentialRef: ctx.credentialRef ?? `slack:bot:${ctx.scope}`,
        requestHash,
        requestBody,
    };
    return proposal;
}
//# sourceMappingURL=rich-effects.js.map