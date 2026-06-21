// @gest/ingest-github / envelope
//
// Typed GitHub webhook envelope decoders. Unlike Slack, GitHub's event type is
// NOT in the body: it arrives in the X-GitHub-Event header, and the body is the
// raw event payload object. The envelope here pairs the header-supplied event
// name with the decoded payload and the cross-cutting metadata (repository,
// organization, installation, sender, action) every payload may carry.
//
// This module parses ALREADY-VERIFIED bytes into typed records, or a structured
// DecodeFailure. No untyped GitHub JSON leaves this package: callers branch on
// the closed event-name union and read normalized metadata, not raw fields.
//
// Hard rule: JSON.parse happens only AFTER signature verification (see verify.ts
// and ingest.ts). This module does not verify.
import { asJson, boolOf, decodeJsonBody, fail, isJsonObject, numOf, objOf, ok, pick, strOf, } from "@gest/ingest-core";
/** The first supported GitHub webhook event names (X-GitHub-Event values). */
export const GITHUB_EVENTS = [
    "ping",
    "issues",
    "issue_comment",
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment",
    "check_run",
    "check_suite",
    "workflow_run",
    "repository_dispatch",
];
/** Type guard for the closed event-name set. */
export function isGithubEvent(name) {
    return GITHUB_EVENTS.includes(name);
}
/**
 * Decode a webhook payload object given its header-supplied event name. The body
 * is the payload object directly (no outer wrapper). Unknown event names decode
 * with `supported: false` and the payload preserved opaquely, never dropped.
 */
export function decodeGithubEnvelope(eventName, payload) {
    const obj = asJson(payload);
    if (!isJsonObject(obj)) {
        return fail("", "expected github webhook payload object");
    }
    const action = typeof obj["action"] === "string" ? obj["action"] : undefined;
    const value = {
        event: eventName,
        supported: isGithubEvent(eventName),
        payload: obj,
        ...(action === undefined ? {} : { action }),
    };
    return ok(value);
}
/** Parse already-verified raw HTTP bytes into JSON, then decode the envelope. */
export function parseGithubBody(eventName, rawBody) {
    return decodeJsonBody(rawBody, (parsed) => decodeGithubEnvelope(eventName, parsed));
}
/** Extract repository identity, or undefined when the payload has none. */
export function repositoryOf(payload) {
    const repo = objOf(payload["repository"]);
    if (repo === undefined)
        return undefined;
    const owner = objOf(repo["owner"]);
    return {
        ...pick("id", numOf(repo["id"])),
        ...pick("nodeId", strOf(repo["node_id"])),
        ...pick("name", strOf(repo["name"])),
        ...pick("fullName", strOf(repo["full_name"])),
        ...pick("ownerLogin", owner === undefined ? undefined : strOf(owner["login"])),
        ...pick("private", boolOf(repo["private"])),
    };
}
/** Extract organization identity, or undefined when the payload has none. */
export function organizationOf(payload) {
    const org = objOf(payload["organization"]);
    if (org === undefined)
        return undefined;
    return {
        ...pick("id", numOf(org["id"])),
        ...pick("login", strOf(org["login"])),
        ...pick("nodeId", strOf(org["node_id"])),
    };
}
/** Extract installation identity, or undefined when the payload has none. */
export function installationOf(payload) {
    const inst = objOf(payload["installation"]);
    if (inst === undefined)
        return undefined;
    return {
        ...pick("id", numOf(inst["id"])),
        ...pick("nodeId", strOf(inst["node_id"])),
    };
}
/** Extract sender identity, or undefined when the payload has none. */
export function senderOf(payload) {
    const sender = objOf(payload["sender"]);
    if (sender === undefined)
        return undefined;
    return {
        ...pick("id", numOf(sender["id"])),
        ...pick("login", strOf(sender["login"])),
        ...pick("type", strOf(sender["type"])),
    };
}
//# sourceMappingURL=envelope.js.map