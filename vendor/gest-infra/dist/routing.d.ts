import type { Platform } from "@gest/ingest-core";
/** Canonical webhook route prefixes, one per platform. */
export declare const PLATFORM_ROUTES: Readonly<Record<Platform, string>>;
/** Resolve the platform a request path targets, or undefined when unrouted. */
export declare function platformForPath(path: string): Platform | undefined;
//# sourceMappingURL=routing.d.ts.map