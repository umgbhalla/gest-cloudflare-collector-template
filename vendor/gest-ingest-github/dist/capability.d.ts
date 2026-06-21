/** A minted installation access token plus its expiry. Never persisted by ingest. */
export interface InstallationToken {
    /** The bearer token. Short-lived; treated as a secret, never logged/stored. */
    readonly token: string;
    /** ISO-8601 expiry GitHub returned. The dispatcher refreshes before this. */
    readonly expiresAt: string;
    /** Installation id the token authorizes. */
    readonly installationId: string;
}
/**
 * The token-minting capability the dispatcher provides. Implemented OUTSIDE the
 * ingest path (in an app/dispatcher), it handles JWT signing, the
 * /app/installations/{id}/access_tokens call, expiry, and refresh. Ingest only
 * holds this type so the boundary is enforceable, not buried in a helper.
 */
export interface InstallationTokenCapability {
    /**
     * Mint (or return a still-valid cached) installation token for the given id.
     * `now` is passed so the implementation can decide refresh deterministically in
     * tests. The result is used immediately by the dispatcher and discarded; ingest
     * never sees or stores it.
     */
    mintInstallationToken(installationId: string, now: string): Promise<InstallationToken>;
}
/**
 * Guard a dispatch site against accidentally embedding a token in an ingest-built
 * effect proposal. Effect proposals are tokenless by contract; this throws if a
 * caller tries to smuggle a token field into a request body, keeping the
 * capability boundary honest. Pure check, no I/O.
 */
export declare function assertTokenlessRequestBody(requestBody: unknown): void;
//# sourceMappingURL=capability.d.ts.map