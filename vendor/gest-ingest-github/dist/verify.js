// @gest/ingest-github / verify
//
// GitHub webhook request verification. CRITICAL invariant (gest hard rule): the
// signature is checked against the EXACT raw bytes BEFORE any JSON parse. Nothing
// in this module calls JSON.parse; it operates on `IngestHttpRequest.rawBody` and
// the normalized header map only. The verdict it returns is recorded on the raw
// delivery (durable source truth) so replay and audit stay honest.
//
// GitHub signing scheme ("github-sha256"):
//   sig    = "sha256=" + hex(HMAC_SHA256(webhookSecret, rawBody))
//   header = X-Hub-Signature-256
//
// GitHub signs the EXACT request body bytes with the per-hook/app webhook secret.
// There is no timestamp in the scheme; replay protection comes from delivery-id
// dedupe (see identity.ts), not from a skew window. We compare in constant time
// and never throw on a bad signature (that is normal attacker/probe traffic).
import { createHmac } from "node:crypto";
import { splitSignatureCandidates, verifyCandidates, verifiedSignature, rejectVerdict, } from "@gest/ingest-core";
/** Signing scheme name recorded on every GitHub signature verdict. */
export const GITHUB_SIGNATURE_SCHEME = "github-sha256";
/** Header names GitHub attaches to a webhook delivery. */
export const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";
export const GITHUB_EVENT_HEADER = "x-github-event";
export const GITHUB_DELIVERY_HEADER = "x-github-delivery";
export const GITHUB_HOOK_ID_HEADER = "x-github-hook-id";
export const GITHUB_INSTALLATION_TARGET_ID_HEADER = "x-github-hook-installation-target-id";
export const GITHUB_INSTALLATION_TARGET_TYPE_HEADER = "x-github-hook-installation-target-type";
/**
 * Verify a GitHub webhook request over its exact bytes. Returns a structured
 * verdict; it NEVER throws on a bad signature and NEVER parses the body. The
 * caller stores the verdict on the raw delivery and decides what to do with a
 * non-"verified" result.
 */
export function verifyGithubRequest(request, opts) {
    const retry = captureRetryMeta(request.headers);
    const presented = request.headers[GITHUB_SIGNATURE_HEADER];
    if (presented === undefined) {
        return reject("missing", retry, "missing x-hub-signature-256 header");
    }
    // GitHub sends a single signature header; split is defensive (yields one
    // candidate) and keeps the multi-candidate path uniform across adapters.
    const candidates = splitSignatureCandidates(presented);
    if (candidates.some((c) => !c.startsWith("sha256="))) {
        return reject("rejected", retry, "signature is not a sha256= digest", opts.keyId);
    }
    // Accept against the current secret OR any still-valid previous secret during an
    // overlapping rotation. Compared in constant time inside verifyCandidates.
    const secrets = [opts.webhookSecret, ...(opts.previousSecrets ?? [])];
    const expecteds = secrets.map((s) => computeSignature(s, request.rawBody));
    const verdict = verifyCandidates(candidates, expecteds);
    if (!verdict.verified) {
        return reject("rejected", retry, "hmac mismatch", opts.keyId);
    }
    const signature = verifiedSignature(GITHUB_SIGNATURE_SCHEME, {
        keyId: opts.keyId,
        candidatesPresented: verdict.candidatesPresented,
        candidateMatched: verdict.candidateMatched,
    });
    return { signature, retry, verified: true };
}
/** Compute the GitHub `sha256=` signature over the exact body bytes. */
export function computeSignature(webhookSecret, rawBody) {
    const mac = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    return `sha256=${mac}`;
}
/**
 * Capture GitHub's per-attempt retry metadata from the inbound webhook headers.
 *
 * GitHub conveys NO redelivery/retry signal on the inbound webhook: every delivery
 * (first delivery, automatic retry, and manual redelivery) arrives with a NEW
 * X-GitHub-Delivery GUID and NO redelivery-flag header. The only place a delivery's
 * redelivery status is exposed is the REST "hook deliveries" API (the `guid` and
 * `redelivery` fields), which is a repair-time concern, not an inbound header.
 *
 * Therefore the inbound path can never honestly populate a retry count, and this
 * always returns { count: 0 }. Redelivery detection lives in the dedupe layer: a
 * redelivery of identical bytes collapses on the content-derived native key (see
 * identity.ts), not on a fabricated header.
 */
export function captureRetryMeta(_headers) {
    return { count: 0 };
}
// GitHub-local reject wrapper over core rejectVerdict (binds the GitHub scheme).
function reject(kind, retry, reason, keyId) {
    return rejectVerdict(GITHUB_SIGNATURE_SCHEME, retry, kind, reason, keyId);
}
//# sourceMappingURL=verify.js.map