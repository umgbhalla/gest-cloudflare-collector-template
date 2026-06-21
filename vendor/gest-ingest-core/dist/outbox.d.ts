import { type Json } from "./json.js";
import { type Decoder } from "./decode.js";
import { type Platform } from "./platform.js";
/** Lifecycle state of an outbox entry. */
export declare const OUTBOX_STATES: readonly ["pending", "sending", "sent", "retry", "failed"];
export type OutboxState = (typeof OUTBOX_STATES)[number];
/** One dispatch attempt against the platform API. */
export interface OutboxAttempt {
    readonly attempt: number;
    readonly startedAt: string;
    /** Outcome status: native HTTP-like status or effect-kind status. */
    readonly status?: number;
    /** Stable hash of the response body, for replay/audit. */
    readonly responseHash?: string;
    /** True when the platform reported a rate-limit on this attempt. */
    readonly rateLimited?: boolean;
    /** Retry-after seconds the platform asked for, structured not log-only. */
    readonly retryAfterSeconds?: number;
    readonly error?: string;
}
export declare const decodeOutboxAttempt: Decoder<OutboxAttempt>;
/**
 * A proposed (and tracked) side effect. `requestBody` is the typed platform
 * effect payload, opaque to the core. Rate buckets are platform-owned and
 * explicit via `rateKeys`.
 *
 * Credentials are a capability boundary (mirroring the GitHub installation-token
 * pattern): the outbox carries an OPAQUE `credentialRef` only. Tokens are never
 * baked into the row, parsed out of a rate key, or stored by the core. A
 * dispatcher resolves the ref to a live credential through an injected
 * `EffectCredentialCapability` at send time.
 */
export interface Outbox {
    readonly outboxId: string;
    readonly idempotencyKey: string;
    readonly platform: Platform;
    /** Tenant the effect belongs to (multi-tenant isolation). */
    readonly tenant: string;
    /** Platform account/workspace/install the effect targets. */
    readonly account: string;
    /**
     * Opaque platform-owned credential/install pointer. Examples:
     *   slack:bot:T123:A123 | github:installation:123456 | telegram:bot:987654
     * Resolved to a live token by an injected capability; never parsed by core.
     */
    readonly credentialRef: string;
    /** Native API method or effect kind, e.g. "chat.postMessage". */
    readonly method: string;
    /** Channel/chat/thread/user/resource the effect targets. */
    readonly destination: string;
    /**
     * Legacy single rate-limit bucket. SUPERSEDED by `rateKeys`; kept for
     * back-compat with rows/migrations written before multi-bucket dispatch.
     * New dispatch logic must read `rateKeys`.
     * @deprecated use {@link rateKeys}
     */
    readonly rateKey: string;
    /**
     * Rate-limit buckets this effect counts against, explicit and platform-owned.
     * A single effect may touch several buckets (e.g. workspace + channel).
     */
    readonly rateKeys: readonly string[];
    /** Stable hash of the effect request, for dedupe and replay. */
    readonly requestHash: string;
    /** Typed platform effect payload, opaque to the core. */
    readonly requestBody: Json;
    /** Source event id or runtime decision id that caused this effect. */
    readonly causedById: string;
    /** Stable effect order within a single decision (0-based). */
    readonly effectIndex: number;
    readonly state: OutboxState;
    readonly attempts: readonly OutboxAttempt[];
    /** Earliest retry/schedule time (ISO-8601). Persisted, optional. */
    readonly notBefore?: string;
    /** When this row was created (ISO-8601). */
    readonly createdAt: string;
    /** Fencing token for the current `sending` lease, when claimed. */
    readonly leaseId?: string;
    /** Expiry of the current `sending` lease (ISO-8601), when claimed. */
    readonly leaseExpiresAt?: string;
    /**
     * Earlier outbox ids (from earlier proposals in the SAME decision) that must
     * reach a terminal-sent state before this row dispatches. An ordering hint the
     * core records verbatim and the dispatcher enforces at claim time; it is never
     * a result-reference (no native id of an unsent message is ever fabricated).
     */
    readonly dependsOnOutboxIds?: readonly string[];
}
export declare const decodeOutboxState: Decoder<OutboxState>;
export declare const decodeOutbox: Decoder<Outbox>;
//# sourceMappingURL=outbox.d.ts.map