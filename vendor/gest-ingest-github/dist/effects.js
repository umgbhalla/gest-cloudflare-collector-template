// @gest/ingest-github / effects
//
// GitHub outbox effect encoding. A runtime consumer composes effect intents; this
// module turns an explicit, runtime-requested intent into a typed EffectProposal
// the core records in the outbox (the ONLY side-effect path). Hard rule: effects
// are encoded ONLY when the runtime explicitly requests them. This module never
// invents an effect from an inbound event; it just shapes what the runtime asked
// for into the core contract, with stable idempotency keys and rate keys.
//
// Supported effect patterns (and ONLY these):
//   - issue comment            (POST /repos/{owner}/{repo}/issues/{number}/comments)
//   - PR review comment        (POST /repos/{owner}/{repo}/pulls/{number}/comments)
//   - check run output         (POST/PATCH /repos/{owner}/{repo}/check-runs[/{id}])
//   - commit status            (POST /repos/{owner}/{repo}/statuses/{sha})
//   - repository_dispatch      (POST /repos/{owner}/{repo}/dispatches)
//
// Token minting is a CAPABILITY BOUNDARY (gest hard rule): this module encodes the
// effect WITHOUT a token. The dispatcher mints/refreshes the installation token at
// send time via the capability in capability.ts. No token, expiry, or refresh
// logic appears here or anywhere in ingest-core.
//
// Rate keys are explicit and platform-owned. GitHub rate-limits per installation
// (and secondarily on content creation), so effects bucket per installation +
// method facet.
import {} from "@gest/ingest-core";
/** The closed set of GitHub effect methods this adapter can encode. */
export const GITHUB_EFFECT_METHODS = [
    "issues.createComment",
    "pulls.createReviewComment",
    "checks.createRun",
    "checks.updateRun",
    "repos.createCommitStatus",
    "repos.createDispatchEvent",
];
/**
 * Rate key for an effect method, scoped to the installation. GitHub tiers limits
 * per installation, so the bucket is `github:install:{installationId}:{method}`.
 */
export function methodRateKey(installationId, method) {
    return `github:install:${installationId}:${method}`;
}
/**
 * Rate key for content-creation effects (comments/dispatch), which hit GitHub's
 * secondary content-creation limit per repo:
 * `github:content:{installationId}:{owner}/{repo}`.
 */
export function contentRateKey(installationId, repo) {
    return `github:content:${installationId}:${repo.owner}/${repo.repo}`;
}
/**
 * Choose the rate key for an effect. Content-creation methods bucket per repo (the
 * tighter secondary limit); other methods bucket per installation + method.
 */
export function rateKeyForEffect(installationId, intent) {
    switch (intent.method) {
        case "issues.createComment":
        case "pulls.createReviewComment":
        case "repos.createDispatchEvent":
            return contentRateKey(installationId, intent.repo);
        default:
            return methodRateKey(installationId, intent.method);
    }
}
/** The destination an effect targets: owner/repo plus the entity suffix. */
function destinationOf(intent) {
    const base = `${intent.repo.owner}/${intent.repo.repo}`;
    switch (intent.method) {
        case "issues.createComment":
            return `${base}#issue:${intent.issueNumber}`;
        case "pulls.createReviewComment":
            return `${base}#pull:${intent.pullNumber}`;
        case "checks.createRun":
            return `${base}@${intent.headSha}`;
        case "checks.updateRun":
            return `${base}#check-run:${intent.checkRunId}`;
        case "repos.createCommitStatus":
            return `${base}@${intent.sha}`;
        case "repos.createDispatchEvent":
            return `${base}#dispatch:${intent.eventType}`;
    }
}
/** Build the typed GitHub request body for an intent (opaque to the core). */
function requestBodyOf(intent) {
    switch (intent.method) {
        case "issues.createComment":
            return {
                owner: intent.repo.owner,
                repo: intent.repo.repo,
                issue_number: intent.issueNumber,
                body: intent.body,
            };
        case "pulls.createReviewComment":
            return {
                owner: intent.repo.owner,
                repo: intent.repo.repo,
                pull_number: intent.pullNumber,
                body: intent.body,
                commit_id: intent.commitId,
                path: intent.path,
                ...(intent.line === undefined ? {} : { line: intent.line }),
            };
        case "checks.createRun":
            return {
                owner: intent.repo.owner,
                repo: intent.repo.repo,
                name: intent.name,
                head_sha: intent.headSha,
                ...(intent.status === undefined ? {} : { status: intent.status }),
                ...(intent.conclusion === undefined ? {} : { conclusion: intent.conclusion }),
                ...(intent.output === undefined ? {} : { output: intent.output }),
            };
        case "checks.updateRun":
            return {
                owner: intent.repo.owner,
                repo: intent.repo.repo,
                check_run_id: intent.checkRunId,
                ...(intent.status === undefined ? {} : { status: intent.status }),
                ...(intent.conclusion === undefined ? {} : { conclusion: intent.conclusion }),
                ...(intent.output === undefined ? {} : { output: intent.output }),
            };
        case "repos.createCommitStatus":
            return {
                owner: intent.repo.owner,
                repo: intent.repo.repo,
                sha: intent.sha,
                state: intent.state,
                context: intent.context,
                ...(intent.description === undefined ? {} : { description: intent.description }),
                ...(intent.targetUrl === undefined ? {} : { target_url: intent.targetUrl }),
            };
        case "repos.createDispatchEvent":
            return {
                owner: intent.repo.owner,
                repo: intent.repo.repo,
                event_type: intent.eventType,
                ...(intent.clientPayload === undefined ? {} : { client_payload: intent.clientPayload }),
            };
    }
}
/**
 * Encode an explicit, runtime-requested GitHub effect into an EffectProposal. The
 * idempotency key binds the method + request body + seed, so retries of the same
 * intent collapse while a different intent gets a distinct key. The proposal is
 * NOT dispatched here and carries NO token; the runtime feeds it to
 * `proposalsToOutbox` (core), and the dispatcher mints the installation token at
 * send time (see capability.ts).
 */
export function encodeGithubEffect(intent, ctx) {
    const requestBody = requestBodyOf(intent);
    const requestHash = ctx.hash(requestBody);
    const idempotencyKey = ctx.hash({
        seed: ctx.idempotencySeed,
        method: intent.method,
        requestHash,
    });
    const rateKey = rateKeyForEffect(ctx.installationId, intent);
    const proposal = {
        platform: "github",
        method: intent.method,
        destination: destinationOf(intent),
        idempotencyKey,
        rateKey,
        rateKeys: [rateKey],
        credentialRef: ctx.credentialRef ?? `github:installation:${ctx.installationId}`,
        requestHash,
        requestBody,
    };
    return proposal;
}
//# sourceMappingURL=effects.js.map