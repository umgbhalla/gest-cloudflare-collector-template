import type { RawDelivery, RawInsertResult } from "@gest/ingest-core";
import type { CloudflareRawStore } from "@gest/ingest-cloudflare";
import type { D1Database, R2Bucket } from "../env.js";
/** Clock for insertedAt; injectable for deterministic tests. */
export type Clock = () => string;
/** R2 object key for a body blob. */
export declare function bodyKey(bodyHash: string): string;
export declare class D1R2RawStore implements CloudflareRawStore {
    #private;
    constructor(db: D1Database, bucket: R2Bucket, clock: Clock);
    put(raw: RawDelivery): Promise<RawInsertResult>;
    /**
     * Read a raw delivery back, re-attaching the R2 body when one was stored. Used by
     * the queue consumer's "load raw" step. Returns undefined when the rawId is
     * unknown. Decodes through the neutral decoder so no untyped record escapes.
     */
    get(rawId: string): Promise<RawDelivery | undefined>;
}
//# sourceMappingURL=raw-store.d.ts.map