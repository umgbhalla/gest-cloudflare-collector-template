import * as Redacted from "effect/Redacted";
/**
 * The env var names that carry each Worker secret at deploy time.
 *
 * Four are inbound SIGNING secrets (verify-before-parse on the fetch ack path).
 * The fifth, SLACK_BOT_TOKEN, is the OUTBOUND dispatch credential the dispatcher's
 * EffectCredentialCapability resolves by the outbox row's opaque credentialRef —
 * the live Slack write token. It is the vertical-slice credential; a multi-install
 * deployment moves it into the Cloudflare Secrets Store keyed per workspace
 * WITHOUT changing the capability boundary. Every value is read from env at deploy
 * time as a Redacted; NEVER a literal in source.
 */
export declare const SECRET_ENV_VARS: {
    readonly SLACK_SIGNING_SECRET: "GEST_SLACK_SIGNING_SECRET";
    readonly GITHUB_WEBHOOK_SECRET: "GEST_GITHUB_WEBHOOK_SECRET";
    readonly DISCORD_PUBLIC_KEY: "GEST_DISCORD_PUBLIC_KEY";
    readonly DISCORD_GATEWAY_ADMIN_TOKEN: "GEST_DISCORD_GATEWAY_ADMIN_TOKEN";
    readonly TELEGRAM_SECRET_TOKEN: "GEST_TELEGRAM_SECRET_TOKEN";
    readonly SLACK_BOT_TOKEN: "GEST_SLACK_BOT_TOKEN";
};
/** The Worker binding names these secrets are exposed under (see WorkerEnv). */
export type SecretBindingName = keyof typeof SECRET_ENV_VARS;
export declare const SECRET_BINDING_NAMES: SecretBindingName[];
export type PlatformName = "slack" | "github" | "discord" | "telegram";
export type EnabledPlatformConfig = boolean | {
    readonly webhooks?: boolean;
    readonly gateway?: boolean;
};
export type EnabledPlatforms = Readonly<Partial<Record<PlatformName, EnabledPlatformConfig>>>;
export interface RequiredSecretOptions {
    readonly platforms?: EnabledPlatforms;
    /** Slack outbound dispatch is optional for collector-only deployments. */
    readonly slackOutbound?: boolean;
}
export declare function requiredSecretBindings(options?: RequiredSecretOptions): readonly SecretBindingName[];
/**
 * Read one signing secret from the deploy environment as a Redacted value.
 * Fail-closed: an absent or empty env var throws at deploy time rather than
 * shipping an empty secret. `read` is injectable so the offline plan/dry-run can
 * supply a fake environment without touching the real process env.
 */
export declare function readSecret(binding: SecretBindingName, read?: (name: string) => string | undefined): Redacted.Redacted<string>;
/**
 * Read the required platform/admin secrets as a Worker `env` map of Redacted
 * values, ready to spread into the Worker resource's `env`. Each value is read
 * from the deploy environment; nothing is hardcoded.
 */
export declare function readPlatformSecrets(read?: (name: string) => string | undefined, required?: readonly SecretBindingName[]): Partial<Record<SecretBindingName, Redacted.Redacted<string>>>;
//# sourceMappingURL=secrets.d.ts.map