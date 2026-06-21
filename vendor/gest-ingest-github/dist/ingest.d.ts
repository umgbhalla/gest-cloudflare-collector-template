import { type IngestHttpRequest, type NormalizedEvent, type ProviderMeta, type RawDelivery } from "@gest/ingest-core";
import { type GithubEnvelope } from "./envelope.js";
import { type GithubVerifyOptions } from "./verify.js";
import { type GithubDeliveryIdentity } from "./identity.js";
/** Caller-supplied id/clock inputs so ingest stays deterministic and testable. */
export interface GithubIngestEnv {
    readonly tenant: string;
    /** Stable raw delivery id assigned by the provider adapter. */
    readonly rawId: string;
    /** ISO receive time recorded on the raw delivery and normalized event. */
    readonly receivedAt: string;
    /** Stable hash of the exact bytes (provider/local computes it). */
    readonly bodyHash: string;
    /**
     * HARD CALLER OBLIGATION (tenant isolation). The GitHub webhook secret is the
     * ONLY authenticator and the installation id lives in the BODY, so a verified
     * signature alone does NOT prove the delivery belongs to `tenant`. The caller
     * MUST resolve `tenant` + the chosen `webhookSecret` from the SAME signed
     * installation and pass that installation's identity here. ingest then binds
     * the signed installation in the verified payload to these expected values and
     * REJECTS (kind:"rejected", no verified record written under `tenant`) on any
     * mismatch.
     *
     * Provide at least one. Per-installation (or per-hook) secret selection is
     * mandatory: a single shared GitHub-App secret cannot be used as the tenant
     * authenticator, because a body signed for installation A would then verify
     * under tenant B's route. See docs/security-privacy.md and docs/platforms/github.md.
     *
     * When BOTH are omitted, no binding is enforced — only acceptable for a
     * single-tenant deployment with exactly one installation behind the route.
     */
    readonly expectedInstallationId?: string | number;
    /** Expected X-GitHub-Hook-Installation-Target-ID the tenant+secret resolve to. */
    readonly expectedInstallationTargetId?: string;
}
/** Outcome of ingesting a GitHub webhook HTTP delivery. */
export type GithubHttpIngest = {
    readonly kind: "ping";
    readonly raw: RawDelivery;
    readonly identity: GithubDeliveryIdentity;
    readonly nativeKey: string;
    /** GitHub ping zen string, when present, for a friendly handshake reply. */
    readonly zen?: string;
} | {
    readonly kind: "rejected";
    readonly raw: RawDelivery;
    readonly reason: string;
} | {
    readonly kind: "event";
    readonly raw: RawDelivery;
    readonly envelope: GithubEnvelope;
    readonly identity: GithubDeliveryIdentity;
    readonly nativeKey: string;
    /** Absent when the event name is outside the first supported set. */
    readonly event?: NormalizedEvent;
} | {
    readonly kind: "ignored";
    readonly raw: RawDelivery;
    readonly reason: string;
};
/**
 * Ingest a GitHub webhook HTTP request: verify over raw bytes, then (only on a
 * verified signature) parse and decode the payload using the X-GitHub-Event
 * header. Returns durable records for the caller to persist raw-first. A
 * rejected/missing signature yields a "rejected" outcome whose raw delivery
 * carries audit metadata only (no body).
 */
export declare function ingestGithubHttp(request: IngestHttpRequest, provider: ProviderMeta, verifyOpts: GithubVerifyOptions, env: GithubIngestEnv): GithubHttpIngest;
//# sourceMappingURL=ingest.d.ts.map