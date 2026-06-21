import type { LaneLease } from "@gest/ingest-core";
import type { CloudflareLane } from "@gest/ingest-cloudflare";
import type { DurableObjectNamespace } from "../env.js";
/** Internal request shapes the DO understands at its /acquire and /release routes. */
export interface LaneAcquireRequest {
    readonly op: "acquire";
    readonly subject: string;
    readonly holder: string;
    readonly ttlSeconds: number;
}
export interface LaneReleaseRequest {
    readonly op: "release";
    readonly subject: string;
    readonly holder: string;
    readonly fencingToken: string;
}
export declare class DurableObjectLane implements CloudflareLane {
    #private;
    constructor(ns: DurableObjectNamespace);
    acquire(subject: string, holder: string, ttlSeconds: number): Promise<LaneLease>;
    release(subject: string, holder: string, fencingToken: string): Promise<boolean>;
}
//# sourceMappingURL=lane.d.ts.map