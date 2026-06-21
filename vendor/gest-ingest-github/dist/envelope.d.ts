import { type Decoder, type JsonObject } from "@gest/ingest-core";
/** The first supported GitHub webhook event names (X-GitHub-Event values). */
export declare const GITHUB_EVENTS: readonly ["ping", "issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment", "check_run", "check_suite", "workflow_run", "repository_dispatch"];
export type GithubEvent = (typeof GITHUB_EVENTS)[number];
/** Type guard for the closed event-name set. */
export declare function isGithubEvent(name: string): name is GithubEvent;
/** A decoded GitHub webhook envelope: header event name + verified payload. */
export interface GithubEnvelope {
    /** Event name from X-GitHub-Event (closed set when supported, else opaque). */
    readonly event: string;
    /** True when `event` is in the first-supported set. */
    readonly supported: boolean;
    /** Payload `action` field when present (e.g. "opened", "created"). */
    readonly action?: string;
    /** The full payload object, kept opaque for source.github. */
    readonly payload: JsonObject;
}
/**
 * Decode a webhook payload object given its header-supplied event name. The body
 * is the payload object directly (no outer wrapper). Unknown event names decode
 * with `supported: false` and the payload preserved opaquely, never dropped.
 */
export declare function decodeGithubEnvelope(eventName: string, payload: unknown): ReturnType<Decoder<GithubEnvelope>>;
/** Parse already-verified raw HTTP bytes into JSON, then decode the envelope. */
export declare function parseGithubBody(eventName: string, rawBody: Uint8Array): ReturnType<Decoder<GithubEnvelope>>;
/** Repository identity extracted from a payload (when present). */
export interface GithubRepositoryRef {
    readonly id?: number;
    readonly nodeId?: string;
    readonly name?: string;
    readonly fullName?: string;
    readonly ownerLogin?: string;
    readonly private?: boolean;
}
/** Organization identity (when the event is org-scoped). */
export interface GithubOrganizationRef {
    readonly id?: number;
    readonly login?: string;
    readonly nodeId?: string;
}
/** Installation identity (GitHub App installation id). */
export interface GithubInstallationRef {
    readonly id?: number;
    readonly nodeId?: string;
}
/** Sender identity (the actor that triggered the event). */
export interface GithubSenderRef {
    readonly id?: number;
    readonly login?: string;
    readonly type?: string;
}
/** Extract repository identity, or undefined when the payload has none. */
export declare function repositoryOf(payload: JsonObject): GithubRepositoryRef | undefined;
/** Extract organization identity, or undefined when the payload has none. */
export declare function organizationOf(payload: JsonObject): GithubOrganizationRef | undefined;
/** Extract installation identity, or undefined when the payload has none. */
export declare function installationOf(payload: JsonObject): GithubInstallationRef | undefined;
/** Extract sender identity, or undefined when the payload has none. */
export declare function senderOf(payload: JsonObject): GithubSenderRef | undefined;
//# sourceMappingURL=envelope.d.ts.map