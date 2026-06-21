import { type EffectCredential, type EffectCredentialCapability, type EffectCredentialRequest } from "@gest/ingest-core";
import type { SecretsStore } from "../env.js";
/** Where a bot token comes from. Both are injected; nothing is a literal here. */
export interface SlackCredentialSources {
    /** Cloudflare Secrets Store binding (preferred). */
    readonly secrets?: SecretsStore;
    /** Worker secret-env fallback value (e.g. local dev). */
    readonly botTokenEnv?: string;
    /**
     * Map a Slack credentialRef to the Secrets Store entry name. Default maps every
     * Slack ref to one workspace entry ("slack_bot_token") for the vertical slice;
     * a multi-install deployment overrides this to derive a per-team entry name.
     */
    readonly secretNameFor?: (credentialRef: string) => string;
}
/**
 * The Slack credential capability. Resolves only `platform: "slack"` refs; any
 * other platform throws (fail-loud) so a missing codec/resolver never silently
 * sends an unauthenticated request. Tokens are wrapped as `SecretString` and
 * returned as a `bearer` credential the pure Slack codec consumes.
 */
export declare class SlackEffectCredentialCapability implements EffectCredentialCapability {
    #private;
    constructor(sources: SlackCredentialSources);
    resolveEffectCredential(input: EffectCredentialRequest): Promise<EffectCredential>;
}
//# sourceMappingURL=credentials.d.ts.map