// @gest/ingest-github / ingest
//
// The platform-adapter entry point that ties verification, envelope decoding,
// identity, and normalization together WITHOUT touching storage, tokens, or a
// runtime. A provider adapter supplies the captured bytes + provider metadata.
// This function returns durable records (RawDelivery, native key, NormalizedEvent)
// for the caller to persist raw-first and process.
//
// Gest boundaries kept here:
// - Verifies the X-Hub-Signature-256 over exact bytes BEFORE parsing JSON.
// - Never dispatches, decides, or mints a token; only verify + decode + normalize
//   + key.
// - ping is surfaced as a typed handshake outcome, not auto-answered, so the
//   provider adapter owns the HTTP response.
// - A rejected/missing signature yields a "rejected" outcome whose raw delivery
//   carries audit metadata only (no attacker-controlled body).
import { buildRawDelivery, normalizedEventOf, } from "@gest/ingest-core";
import { installationOf, parseGithubBody, } from "./envelope.js";
import { GITHUB_EVENT_HEADER, verifyGithubRequest } from "./verify.js";
import { deliveryContentKey, deliveryIdentityOf, } from "./identity.js";
import { normalizeGithubEvent } from "./normalize.js";
/**
 * Ingest a GitHub webhook HTTP request: verify over raw bytes, then (only on a
 * verified signature) parse and decode the payload using the X-GitHub-Event
 * header. Returns durable records for the caller to persist raw-first. A
 * rejected/missing signature yields a "rejected" outcome whose raw delivery
 * carries audit metadata only (no body).
 */
export function ingestGithubHttp(request, provider, verifyOpts, env) {
    const verification = verifyGithubRequest(request, verifyOpts);
    const sig = verification.signature;
    if (!verification.verified) {
        // Source-truth rule: do not persist the attacker-controlled body.
        const raw = buildRaw(request, provider, env, sig, verification.retry, undefined);
        return { kind: "rejected", raw, reason: sig.reason ?? "signature not verified" };
    }
    // Identity comes from headers (delivery id + event name are mandatory).
    const identity = deliveryIdentityOf(request.headers);
    const bodyText = new TextDecoder().decode(request.rawBody);
    const raw = buildRaw(request, provider, env, sig, verification.retry, bodyText, identity);
    if (identity === undefined) {
        return { kind: "ignored", raw, reason: "missing x-github-delivery or x-github-event header" };
    }
    const eventName = request.headers[GITHUB_EVENT_HEADER] ?? identity.eventName;
    const decoded = parseGithubBody(eventName, request.rawBody);
    if (!decoded.ok) {
        return { kind: "ignored", raw, reason: "payload decode failed" };
    }
    const envelope = decoded.value;
    // Tenant-isolation binding: the verified signature proves the body is authentic
    // for SOME hook secret, NOT that it belongs to env.tenant. Bind the signed
    // installation (body) / installation-target (header) to what the caller resolved
    // the tenant + secret for; reject on mismatch so a wrong-tenant route can never
    // durably write a verified record under env.tenant. (See GithubIngestEnv.)
    const binding = checkInstallationBinding(env, envelope, identity);
    if (binding !== undefined) {
        // Do not persist a verified body under a tenant the install does not belong to.
        const rejectRaw = buildRaw(request, provider, env, sig, verification.retry, undefined);
        return { kind: "rejected", raw: rejectRaw, reason: binding };
    }
    // Dedupe anchor is the CONTENT key, not the per-attempt delivery id: a GitHub
    // redelivery replays identical bytes under a new X-GitHub-Delivery GUID, so only
    // a content-derived key collapses it to one consumer run + one effect.
    const nativeKey = deliveryContentKey(identity, env.bodyHash);
    if (eventName === "ping") {
        const zen = typeof envelope.payload["zen"] === "string" ? envelope.payload["zen"] : undefined;
        return {
            kind: "ping",
            raw,
            identity,
            nativeKey,
            ...(zen === undefined ? {} : { zen }),
        };
    }
    // Ack path: a malformed-but-signed payload (DecodeFailure) folds to "no event"
    // like an unsupported event — the raw is durable and the ack must not 500. The
    // consumer seam re-derives and surfaces the failure.
    const event = normalizedEventOf(normalizeGithubEvent(envelope, {
        tenant: env.tenant,
        rawId: env.rawId,
        // GitHub webhook: the X-Hub-Signature-256 HMAC over exact bytes was verified.
        verified: true,
        signatureKind: "verified",
        receivedAt: env.receivedAt,
        nativeKey,
        identity,
    }));
    return event === undefined
        ? { kind: "event", raw, envelope, identity, nativeKey }
        : { kind: "event", raw, envelope, identity, nativeKey, event };
}
/**
 * Bind the signed installation to the routing tenant. Returns a rejection reason
 * string when an expected installation/installation-target id was supplied and the
 * signed delivery does not match it; returns undefined when the binding holds (or
 * the caller opted out by supplying neither, e.g. a single-installation route).
 */
function checkInstallationBinding(env, envelope, identity) {
    if (env.expectedInstallationId !== undefined) {
        const signedId = installationOf(envelope.payload)?.id;
        if (signedId === undefined) {
            return "signed payload carries no installation id to bind to the routing tenant";
        }
        if (String(signedId) !== String(env.expectedInstallationId)) {
            return "signed installation id does not match the routing tenant's installation";
        }
    }
    if (env.expectedInstallationTargetId !== undefined) {
        const targetId = identity.installationTargetId;
        if (targetId === undefined) {
            return "delivery carries no installation-target id to bind to the routing tenant";
        }
        if (targetId !== env.expectedInstallationTargetId) {
            return "installation-target id does not match the routing tenant";
        }
    }
    return undefined;
}
function buildRaw(request, provider, env, signature, retry, body, identity) {
    // account + installRef are identity-derived (platform-side); core owns the common
    // shape + no-attacker-body policy. The rejected path passes body=undefined.
    return buildRawDelivery({ rawId: env.rawId, tenant: env.tenant, receivedAt: env.receivedAt, provider, headers: request.headers, bodyHash: env.bodyHash, signature, retry, ...(body === undefined ? {} : { body }) }, {
        platform: "github",
        transport: "http",
        account: identity?.installationTargetId ?? identity?.hookId ?? provider.requestId,
        ...(identity === undefined ? {} : { installRef: identity.deliveryId }),
    });
}
//# sourceMappingURL=ingest.js.map