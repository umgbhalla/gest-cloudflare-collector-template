import { type EffectProposal, type HashFn, type Json } from "@gest/ingest-core";
/** The closed set of GitHub effect methods this adapter can encode. */
export declare const GITHUB_EFFECT_METHODS: readonly ["issues.createComment", "pulls.createReviewComment", "checks.createRun", "checks.updateRun", "repos.createCommitStatus", "repos.createDispatchEvent"];
export type GithubEffectMethod = (typeof GITHUB_EFFECT_METHODS)[number];
/** Common context every effect needs to be addressable and rate-keyed. */
export interface GithubEffectContext {
    /** Installation id the token belongs to (the rate + auth scope). */
    readonly installationId: string;
    /**
     * Caller-stable idempotency seed. Same intent + same seed => same key, so
     * at-least-once dispatch never double-sends. Usually the causing decision id.
     */
    readonly idempotencySeed: string;
    /** Stable hash function (e.g. @gest/ingest-local hashJson). */
    readonly hash: HashFn;
    /**
     * Opaque credential/install pointer the dispatcher resolves to an installation
     * token via the existing installation-token capability (NEVER a raw token).
     * Defaults to `github:installation:{installationId}`.
     */
    readonly credentialRef?: string;
}
/** A repository coordinate every effect targets. */
export interface RepoCoord {
    readonly owner: string;
    readonly repo: string;
}
export interface IssueCommentIntent {
    readonly method: "issues.createComment";
    readonly repo: RepoCoord;
    readonly issueNumber: number;
    readonly body: string;
}
export interface ReviewCommentIntent {
    readonly method: "pulls.createReviewComment";
    readonly repo: RepoCoord;
    readonly pullNumber: number;
    readonly body: string;
    /** Commit the comment is anchored to. */
    readonly commitId: string;
    readonly path: string;
    readonly line?: number;
}
export interface CreateCheckRunIntent {
    readonly method: "checks.createRun";
    readonly repo: RepoCoord;
    readonly name: string;
    readonly headSha: string;
    readonly status?: string;
    readonly conclusion?: string;
    /** Check run output block (title/summary/text/annotations), opaque pass-through. */
    readonly output?: Json;
}
export interface UpdateCheckRunIntent {
    readonly method: "checks.updateRun";
    readonly repo: RepoCoord;
    readonly checkRunId: number;
    readonly status?: string;
    readonly conclusion?: string;
    readonly output?: Json;
}
export interface CommitStatusIntent {
    readonly method: "repos.createCommitStatus";
    readonly repo: RepoCoord;
    readonly sha: string;
    readonly state: "error" | "failure" | "pending" | "success";
    readonly context: string;
    readonly description?: string;
    readonly targetUrl?: string;
}
export interface DispatchIntent {
    readonly method: "repos.createDispatchEvent";
    readonly repo: RepoCoord;
    readonly eventType: string;
    readonly clientPayload?: Json;
}
export type GithubEffectIntent = IssueCommentIntent | ReviewCommentIntent | CreateCheckRunIntent | UpdateCheckRunIntent | CommitStatusIntent | DispatchIntent;
/**
 * Rate key for an effect method, scoped to the installation. GitHub tiers limits
 * per installation, so the bucket is `github:install:{installationId}:{method}`.
 */
export declare function methodRateKey(installationId: string, method: GithubEffectMethod): string;
/**
 * Rate key for content-creation effects (comments/dispatch), which hit GitHub's
 * secondary content-creation limit per repo:
 * `github:content:{installationId}:{owner}/{repo}`.
 */
export declare function contentRateKey(installationId: string, repo: RepoCoord): string;
/**
 * Choose the rate key for an effect. Content-creation methods bucket per repo (the
 * tighter secondary limit); other methods bucket per installation + method.
 */
export declare function rateKeyForEffect(installationId: string, intent: GithubEffectIntent): string;
/**
 * Encode an explicit, runtime-requested GitHub effect into an EffectProposal. The
 * idempotency key binds the method + request body + seed, so retries of the same
 * intent collapse while a different intent gets a distinct key. The proposal is
 * NOT dispatched here and carries NO token; the runtime feeds it to
 * `proposalsToOutbox` (core), and the dispatcher mints the installation token at
 * send time (see capability.ts).
 */
export declare function encodeGithubEffect(intent: GithubEffectIntent, ctx: GithubEffectContext): EffectProposal;
//# sourceMappingURL=effects.d.ts.map