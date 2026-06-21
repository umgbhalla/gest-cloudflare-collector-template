// @gest/ingest-github / normalize
//
// Map a verified GitHub webhook envelope into the core's platform-neutral
// NormalizedEvent. The mapping is deterministic and total over the first
// supported events (docs/platforms/github.md). A GitHub event yields at most one
// normalized event with a closed family/kind (all in the `repository` family),
// plus an opaque source.github payload carrying the GitHub-specific detail.
// Events we do not map (ping handshake, unknown event names) yield `undefined`;
// the caller records the raw + dedupe but emits no normalized event, never a
// guess.
//
// No GitHub field is promoted to the top level; everything GitHub-specific lives
// under source.github (repository, organization, installation, sender, action,
// and the per-event entity identifiers), which the core treats as opaque JSON.
import { familyOf, numOf, objOf, occurredAtFromIso, ok, pick, strOf, } from "@gest/ingest-core";
import { installationOf, organizationOf, repositoryOf, senderOf, } from "./envelope.js";
/** Decoder version recorded on every normalized event for replay honesty. */
export const GITHUB_DECODER_VERSION = "github-decoder-1";
/**
 * Resolve the closed family/kind for a GitHub event name, or undefined when the
 * event has no neutral mapping (ping handshake, unknown names). Every supported
 * code-host event lands in the `repository` family.
 */
function mapKind(event) {
    const kind = resolveKind(event);
    return kind === undefined ? undefined : { kind, family: familyOf(kind) };
}
function resolveKind(event) {
    switch (event) {
        case "issues":
        case "issue_comment":
            return "repository.issue";
        case "pull_request":
        case "pull_request_review":
        case "pull_request_review_comment":
            return "repository.pull_request";
        case "check_run":
            return "repository.check_run";
        case "check_suite":
            return "repository.check_suite";
        case "workflow_run":
            return "repository.workflow_run";
        case "repository_dispatch":
            return "repository.dispatch";
        default:
            return undefined;
    }
}
/** Extract the conversation scope: repo full name, else org login, else delivery. */
function conversationOf(payload, identity) {
    const repo = repositoryOf(payload);
    if (repo?.fullName !== undefined)
        return repo.fullName;
    const org = organizationOf(payload);
    if (org?.login !== undefined)
        return org.login;
    return identity.deliveryId;
}
/** Account scope: org login, else repo owner, else installation id, else delivery. */
function accountOf(payload, identity) {
    const org = organizationOf(payload);
    if (org?.login !== undefined)
        return org.login;
    const repo = repositoryOf(payload);
    if (repo?.ownerLogin !== undefined)
        return repo.ownerLogin;
    const inst = installationOf(payload);
    if (inst?.id !== undefined)
        return `installation:${inst.id}`;
    return identity.deliveryId;
}
/** Per-event entity identifiers (issue/PR/review/check/workflow/commit). */
function entityOf(event, payload) {
    switch (event) {
        case "issues":
        case "issue_comment": {
            const issue = objOf(payload["issue"]);
            const comment = objOf(payload["comment"]);
            return {
                ...pick("issueNumber", issue && numOf(issue["number"])),
                ...pick("issueId", issue && numOf(issue["id"])),
                ...pick("commentId", comment && numOf(comment["id"])),
            };
        }
        case "pull_request":
        case "pull_request_review":
        case "pull_request_review_comment": {
            const pr = objOf(payload["pull_request"]);
            const review = objOf(payload["review"]);
            const comment = objOf(payload["comment"]);
            const head = pr ? objOf(pr["head"]) : undefined;
            return {
                ...pick("pullNumber", pr && numOf(pr["number"])),
                ...pick("pullId", pr && numOf(pr["id"])),
                ...pick("reviewId", review && numOf(review["id"])),
                ...pick("reviewCommentId", comment && numOf(comment["id"])),
                ...pick("headSha", head && strOf(head["sha"])),
            };
        }
        case "check_run": {
            const checkRun = objOf(payload["check_run"]);
            return {
                ...pick("checkRunId", checkRun && numOf(checkRun["id"])),
                ...pick("headSha", checkRun && strOf(checkRun["head_sha"])),
                ...pick("status", checkRun && strOf(checkRun["status"])),
            };
        }
        case "check_suite": {
            const suite = objOf(payload["check_suite"]);
            return {
                ...pick("checkSuiteId", suite && numOf(suite["id"])),
                ...pick("headSha", suite && strOf(suite["head_sha"])),
                ...pick("status", suite && strOf(suite["status"])),
            };
        }
        case "workflow_run": {
            const run = objOf(payload["workflow_run"]);
            return {
                ...pick("workflowRunId", run && numOf(run["id"])),
                ...pick("runNumber", run && numOf(run["run_number"])),
                ...pick("headSha", run && strOf(run["head_sha"])),
                ...pick("status", run && strOf(run["status"])),
                ...pick("conclusion", run && strOf(run["conclusion"])),
            };
        }
        case "repository_dispatch": {
            return {
                ...pick("dispatchType", strOf(payload["action"])),
                ...pick("clientPayload", payload["client_payload"]),
            };
        }
        default:
            return {};
    }
}
/** Actor id: sender login when present. */
function actorOf(payload) {
    return senderOf(payload)?.login;
}
/**
 * Occurrence time: best-effort from common updated_at/created_at fields, validated
 * through the shared occurredAt policy. A present-but-malformed/out-of-range ISO
 * timestamp on a signed delivery yields a DecodeFailure (not a silently dropped
 * occurredAt); no candidate at all -> ok(undefined).
 */
function occurredAtOf(event, payload) {
    const candidates = [
        { entity: "comment", obj: objOf(payload["comment"]) },
        { entity: "review", obj: objOf(payload["review"]) },
        { entity: "issue", obj: objOf(payload["issue"]) },
        { entity: "pull_request", obj: objOf(payload["pull_request"]) },
        { entity: "check_run", obj: objOf(payload["check_run"]) },
        { entity: "check_suite", obj: objOf(payload["check_suite"]) },
        { entity: "workflow_run", obj: objOf(payload["workflow_run"]) },
    ];
    for (const c of candidates) {
        if (c.obj === undefined)
            continue;
        const field = strOf(c.obj["updated_at"]) !== undefined ? "updated_at" : "created_at";
        const ts = strOf(c.obj["updated_at"]) ?? strOf(c.obj["created_at"]);
        if (ts !== undefined)
            return occurredAtFromIso(ts, `payload.${c.entity}.${field}`);
    }
    void event;
    return ok(undefined);
}
/**
 * Normalize a GitHub envelope into a NormalizedEvent.
 *
 * Three outcomes, kept distinct (see NormalizeResult):
 *  - `undefined`     -> the event is outside the first supported set (ping/unknown;
 *                       genuinely unsupported, not an error).
 *  - `DecodeFailure` -> a supported but malformed-but-signed payload (e.g. a
 *                       garbage/out-of-range entity timestamp).
 *  - `ok(event)`     -> the normalized event.
 *
 * All GitHub-specific detail is preserved opaquely under source.github
 * (repository, organization, installation, sender, action, entity identifiers, and
 * the full payload).
 */
export function normalizeGithubEvent(envelope, ctx) {
    const mapping = mapKind(envelope.event);
    if (mapping === undefined)
        return undefined;
    const payload = envelope.payload;
    const account = accountOf(payload, ctx.identity);
    const conversation = conversationOf(payload, ctx.identity);
    const actor = actorOf(payload);
    const occurred = occurredAtOf(envelope.event, payload);
    if (!occurred.ok)
        return occurred;
    const occurredAt = occurred.value;
    const repository = repositoryOf(payload);
    const organization = organizationOf(payload);
    const installation = installationOf(payload);
    const sender = senderOf(payload);
    const source = {
        deliveryId: ctx.identity.deliveryId,
        eventName: envelope.event,
        ...(ctx.identity.hookId === undefined ? {} : { hookId: ctx.identity.hookId }),
        ...(ctx.identity.installationTargetId === undefined
            ? {}
            : { installationTargetId: ctx.identity.installationTargetId }),
        ...(envelope.action === undefined ? {} : { action: envelope.action }),
        ...(repository === undefined ? {} : { repository: repository }),
        ...(organization === undefined ? {} : { organization: organization }),
        ...(installation === undefined ? {} : { installation: installation }),
        ...(sender === undefined ? {} : { sender: sender }),
        entity: entityOf(envelope.event, payload),
        payload,
    };
    const event = {
        eventId: ctx.identity.deliveryId,
        platform: "github",
        family: mapping.family,
        kind: mapping.kind,
        tenant: ctx.tenant,
        account,
        conversationId: conversation,
        receivedAt: ctx.receivedAt,
        provenance: {
            verified: ctx.verified,
            signatureKind: ctx.signatureKind,
            rawId: ctx.rawId,
            decoderVersion: GITHUB_DECODER_VERSION,
            nativeKey: ctx.nativeKey,
        },
        source: { github: source },
        ...(actor === undefined ? {} : { actorId: actor }),
        ...(occurredAt === undefined ? {} : { occurredAt }),
    };
    return ok(event);
}
//# sourceMappingURL=normalize.js.map