// @gest/infra / bindings / EffectCredentialCapability (Slack)
//
// Resolves an outbox row's OPAQUE `credentialRef` to a live bot token at send
// time. This is the credential capability boundary the Oracle review + the gest
// hard rules require (mirroring the GitHub installation-token pattern): the token
// is never baked into a row, never parsed out of a rate key, and never stored in
// a core/platform package. It is materialized in-memory only, here, in infra —
// the ONE layer allowed to wire platform + provider + credentials.
//
// The Slack credentialRef shape is `slack:bot:{team}:{app}` (see the Slack effect
// encoder's scope). For the vertical slice we resolve a single workspace bot
// token from a Cloudflare Secrets Store entry (preferred) or a Worker secret env
// fallback. A multi-install resolver later keys the secret name off team/app from
// the ref WITHOUT changing this boundary or the dispatcher.
import { asSecret, } from "@gest/ingest-core";
const DEFAULT_SECRET_NAME = "slack_bot_token";
/**
 * The Slack credential capability. Resolves only `platform: "slack"` refs; any
 * other platform throws (fail-loud) so a missing codec/resolver never silently
 * sends an unauthenticated request. Tokens are wrapped as `SecretString` and
 * returned as a `bearer` credential the pure Slack codec consumes.
 */
export class SlackEffectCredentialCapability {
    #sources;
    constructor(sources) {
        this.#sources = sources;
    }
    async resolveEffectCredential(input) {
        if (input.platform !== "slack") {
            throw new Error(`infra: no credential resolver registered for platform "${input.platform}" (slack-only vertical slice)`);
        }
        const token = await this.#resolveToken(input.credentialRef);
        if (token === undefined || token === "") {
            throw new Error(`infra: no Slack bot token resolved for credentialRef "${input.credentialRef}". ` +
                `Bind a Secrets Store entry or set SLACK_BOT_TOKEN; never hardcode it.`);
        }
        return { kind: "bearer", token: asSecret(token) };
    }
    async #resolveToken(credentialRef) {
        if (this.#sources.secrets !== undefined) {
            const name = (this.#sources.secretNameFor ?? (() => DEFAULT_SECRET_NAME))(credentialRef);
            try {
                const value = await this.#sources.secrets.get(name).get();
                if (value !== "")
                    return value;
            }
            catch {
                // Fall through to the env fallback below.
            }
        }
        return this.#sources.botTokenEnv;
    }
}
//# sourceMappingURL=credentials.js.map