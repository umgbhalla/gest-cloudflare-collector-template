// @gest/infra / alchemy / platform/admin secrets
//
// The platform signing keys, gateway admin token, and optional outbound dispatch
// token are declared as Cloudflare Worker `env` entries read from the deploy
// environment as Redacted values. NEVER hardcode a secret: every value is read
// from `process.env` at deploy time and wrapped in `Redacted.Redacted` so it is
// never logged and never serialized into state output.
//
// These map 1:1 to the per-route secrets the Worker consumes (see
// ../src/env.ts `WorkerEnv`): SLACK_SIGNING_SECRET, GITHUB_WEBHOOK_SECRET,
// DISCORD_PUBLIC_KEY, DISCORD_GATEWAY_ADMIN_TOKEN, TELEGRAM_SECRET_TOKEN. The
// platform adapters own the actual verification; infra only wires the binding.
//
// Why `env` (Redacted) and not a literal: the gate forbids secret literals in
// source. A missing key at deploy time is surfaced loudly (fail-closed) rather
// than silently shipping an empty secret — the same fail-closed posture the guard
// enforces at request time.
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
export const SECRET_ENV_VARS = {
    SLACK_SIGNING_SECRET: "GEST_SLACK_SIGNING_SECRET",
    GITHUB_WEBHOOK_SECRET: "GEST_GITHUB_WEBHOOK_SECRET",
    DISCORD_PUBLIC_KEY: "GEST_DISCORD_PUBLIC_KEY",
    DISCORD_GATEWAY_ADMIN_TOKEN: "GEST_DISCORD_GATEWAY_ADMIN_TOKEN",
    TELEGRAM_SECRET_TOKEN: "GEST_TELEGRAM_SECRET_TOKEN",
    SLACK_BOT_TOKEN: "GEST_SLACK_BOT_TOKEN",
};
export const SECRET_BINDING_NAMES = Object.keys(SECRET_ENV_VARS);
function enabled(input) {
    if (input === true)
        return true;
    if (input === false || input === undefined)
        return false;
    return input.webhooks === true || input.gateway === true;
}
export function requiredSecretBindings(options = {}) {
    const platforms = options.platforms;
    if (platforms === undefined)
        return SECRET_BINDING_NAMES;
    const bindings = [];
    if (enabled(platforms.slack))
        bindings.push("SLACK_SIGNING_SECRET");
    if (enabled(platforms.github))
        bindings.push("GITHUB_WEBHOOK_SECRET");
    if (enabled(platforms.discord)) {
        bindings.push("DISCORD_PUBLIC_KEY");
        if (typeof platforms.discord === "object" && platforms.discord.gateway === true) {
            bindings.push("DISCORD_GATEWAY_ADMIN_TOKEN");
        }
    }
    if (enabled(platforms.telegram))
        bindings.push("TELEGRAM_SECRET_TOKEN");
    if (options.slackOutbound === true)
        bindings.push("SLACK_BOT_TOKEN");
    return bindings;
}
/**
 * Read one signing secret from the deploy environment as a Redacted value.
 * Fail-closed: an absent or empty env var throws at deploy time rather than
 * shipping an empty secret. `read` is injectable so the offline plan/dry-run can
 * supply a fake environment without touching the real process env.
 */
export function readSecret(binding, read = (name) => process.env[name]) {
    const envVar = SECRET_ENV_VARS[binding];
    const value = read(envVar);
    if (value === undefined || value === "") {
        throw new Error(`infra/alchemy/secrets: ${binding} is required but env var ${envVar} is unset or empty. ` +
            `Export it before \`alchemy deploy\` (e.g. GEST_SLACK_SIGNING_SECRET=...). Never hardcode it.`);
    }
    return Redacted.make(value);
}
/**
 * Read the required platform/admin secrets as a Worker `env` map of Redacted
 * values, ready to spread into the Worker resource's `env`. Each value is read
 * from the deploy environment; nothing is hardcoded.
 */
export function readPlatformSecrets(read = (name) => process.env[name], required = SECRET_BINDING_NAMES) {
    const out = {};
    for (const binding of required) {
        out[binding] = readSecret(binding, read);
    }
    return out;
}
//# sourceMappingURL=secrets.js.map