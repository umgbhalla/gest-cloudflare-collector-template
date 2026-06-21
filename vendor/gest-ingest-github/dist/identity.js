// @gest/ingest-github / identity
//
// Event identity and dedupe keying. The core never derives a native key (that is
// a platform concern); this module owns the GitHub key rule and exposes it as a
// string the core's dedupe store claims.
//
// Dedupe keys (per docs/platforms/github.md):
//
//   per-attempt id:  github:webhook:{app_or_hook_id}:{delivery_id}
//   content key:     github:webhook:{app_or_hook_id}:{eventName}:{bodyHash}
//
// IMPORTANT GitHub semantics: X-GitHub-Delivery is a per-DELIVERY GUID. Every
// delivery — first delivery, an automatic retry, AND a manual redelivery from the
// dashboard/API — is assigned a NEW X-GitHub-Delivery GUID. The original and a
// redelivery are linked ONLY via the REST "hook deliveries" API (its `guid` /
// `redelivery` fields); the inbound webhook headers carry NO redelivery marker and
// NO stable cross-attempt id. So delivery_id is NOT stable across redeliveries and
// must not be the sole dedupe anchor.
//
// Because of this the dedupe anchor that actually collapses a redelivery is the
// CONTENT key: a redelivery replays the identical body bytes, so hashing the body
// (with the event name + app/hook id prefix) yields the same key on every attempt.
// The per-attempt delivery key remains useful as an audit/install ref but is not
// the collision anchor. Both keys are prefixed with the app/hook id (X-GitHub-Hook-ID,
// or the installation target id for an App) so deliveries from different hooks can
// never collide.
import {} from "@gest/ingest-core";
import { GITHUB_DELIVERY_HEADER, GITHUB_HOOK_ID_HEADER, GITHUB_INSTALLATION_TARGET_ID_HEADER, } from "./verify.js";
/**
 * Lift the durable identity from headers. Returns undefined when the mandatory
 * X-GitHub-Delivery or X-GitHub-Event header is absent (a malformed delivery the
 * caller must reject rather than guess a key for).
 */
export function deliveryIdentityOf(headers) {
    const deliveryId = headers[GITHUB_DELIVERY_HEADER];
    const eventName = headers["x-github-event"];
    if (deliveryId === undefined || eventName === undefined)
        return undefined;
    const hookId = headers[GITHUB_HOOK_ID_HEADER];
    const targetId = headers[GITHUB_INSTALLATION_TARGET_ID_HEADER];
    return {
        deliveryId,
        eventName,
        ...(hookId === undefined ? {} : { hookId }),
        ...(targetId === undefined ? {} : { installationTargetId: targetId }),
    };
}
/**
 * The app-or-hook id used as the dedupe key prefix. Prefer the hook id; fall back
 * to the installation target id (App-level deliveries); else "unknown" so the key
 * never silently collapses across hooks.
 */
export function appOrHookId(identity) {
    return identity.hookId ?? identity.installationTargetId ?? "unknown";
}
/**
 * Per-attempt delivery key for a GitHub webhook delivery:
 *   github:webhook:{app_or_hook_id}:{delivery_id}
 *
 * NOTE: because X-GitHub-Delivery is a fresh GUID on every redelivery, this key
 * is DISTINCT per attempt and therefore does NOT collapse a redelivery. It is an
 * audit/install reference. Use deliveryContentKey for the dedupe collision anchor.
 */
export function deliveryDedupeKey(identity) {
    return `github:webhook:${appOrHookId(identity)}:${identity.deliveryId}`;
}
/**
 * Content-derived native dedupe key, the anchor that collapses a redelivery:
 *   github:webhook:{app_or_hook_id}:{eventName}:{bodyHash}
 *
 * A manual/auto redelivery replays the identical body bytes under a new delivery
 * GUID, so hashing the body (scoped by event name + app/hook id) yields the SAME
 * key on every attempt. `bodyHash` is the stable hash of the exact bytes the
 * provider already computed (e.g. "sha256:...").
 */
export function deliveryContentKey(identity, bodyHash) {
    return `github:webhook:${appOrHookId(identity)}:${identity.eventName}:${bodyHash}`;
}
//# sourceMappingURL=identity.js.map