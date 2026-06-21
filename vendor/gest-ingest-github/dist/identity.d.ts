import { type HeaderMap } from "@gest/ingest-core";
/** Identity fields lifted from a verified GitHub delivery's headers. */
export interface GithubDeliveryIdentity {
    /**
     * X-GitHub-Delivery: a per-DELIVERY GUID. A NEW value is assigned on every
     * delivery, including automatic retries and manual redeliveries; it is NOT
     * stable across redeliveries (that linkage exists only in the REST deliveries
     * API). Use the content key (deliveryContentKey) to collapse a redelivery.
     */
    readonly deliveryId: string;
    /** X-GitHub-Hook-ID when present (the webhook config id). */
    readonly hookId?: string;
    /** X-GitHub-Hook-Installation-Target-ID (the App/org/repo the hook targets). */
    readonly installationTargetId?: string;
    /** X-GitHub-Event header value. */
    readonly eventName: string;
}
/**
 * Lift the durable identity from headers. Returns undefined when the mandatory
 * X-GitHub-Delivery or X-GitHub-Event header is absent (a malformed delivery the
 * caller must reject rather than guess a key for).
 */
export declare function deliveryIdentityOf(headers: HeaderMap): GithubDeliveryIdentity | undefined;
/**
 * The app-or-hook id used as the dedupe key prefix. Prefer the hook id; fall back
 * to the installation target id (App-level deliveries); else "unknown" so the key
 * never silently collapses across hooks.
 */
export declare function appOrHookId(identity: GithubDeliveryIdentity): string;
/**
 * Per-attempt delivery key for a GitHub webhook delivery:
 *   github:webhook:{app_or_hook_id}:{delivery_id}
 *
 * NOTE: because X-GitHub-Delivery is a fresh GUID on every redelivery, this key
 * is DISTINCT per attempt and therefore does NOT collapse a redelivery. It is an
 * audit/install reference. Use deliveryContentKey for the dedupe collision anchor.
 */
export declare function deliveryDedupeKey(identity: GithubDeliveryIdentity): string;
/**
 * Content-derived native dedupe key, the anchor that collapses a redelivery:
 *   github:webhook:{app_or_hook_id}:{eventName}:{bodyHash}
 *
 * A manual/auto redelivery replays the identical body bytes under a new delivery
 * GUID, so hashing the body (scoped by event name + app/hook id) yields the SAME
 * key on every attempt. `bodyHash` is the stable hash of the exact bytes the
 * provider already computed (e.g. "sha256:...").
 */
export declare function deliveryContentKey(identity: GithubDeliveryIdentity, bodyHash: string): string;
//# sourceMappingURL=identity.d.ts.map