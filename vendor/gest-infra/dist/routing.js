// @gest/infra / routing
//
// Maps an inbound request PATH to the platform it belongs to. The path is used
// ONLY for routing (never for trust); verification is owned by the platform
// adapter downstream. A path with no platform match yields `undefined`, which the
// fetch handler maps to a 404 (not-found) outcome.
/** Canonical webhook route prefixes, one per platform. */
export const PLATFORM_ROUTES = {
    slack: "/webhooks/slack",
    github: "/webhooks/github",
    discord: "/webhooks/discord",
    telegram: "/webhooks/telegram",
};
/** Resolve the platform a request path targets, or undefined when unrouted. */
export function platformForPath(path) {
    for (const [platform, prefix] of Object.entries(PLATFORM_ROUTES)) {
        if (path === prefix || path.startsWith(`${prefix}/`))
            return platform;
    }
    return undefined;
}
//# sourceMappingURL=routing.js.map