// @gest/infra / bindings / CloudflareRawStore
//
// Concrete CloudflareRawStore: a D1 metadata row + an R2 blob keyed by bodyHash.
// This is the real binding the Worker uses. It is deployment glue only; it stores
// the neutral RawDelivery record the platform adapter produced and never inspects
// the payload.
//
// Layout:
//   - D1 table `raw_delivery` holds the metadata (one row per rawId), including
//     the JSON-encoded signature/retry/provider/headers and a bodyHash pointer.
//   - R2 holds the exact body bytes at key `body/{bodyHash}` ONLY when the raw
//     record carries a body. Rejected-signature deliveries arrive with no body by
//     contract, so no blob is written for them (verify-before-parse preserved).
//
// Idempotency: insert is keyed on rawId. A second put of the same rawId reports
// inserted=false and never mutates source truth.
import { decodeRawDelivery, orThrow } from "@gest/ingest-core";
const TABLE = "raw_delivery";
/** R2 object key for a body blob. */
export function bodyKey(bodyHash) {
    return `body/${bodyHash}`;
}
export class D1R2RawStore {
    #db;
    #bucket;
    #clock;
    constructor(db, bucket, clock) {
        this.#db = db;
        this.#bucket = bucket;
        this.#clock = clock;
    }
    async put(raw) {
        // Write the body blob first (keyed by bodyHash), only when present. Rejected
        // deliveries carry no body, so no attacker-controlled bytes are ever stored.
        // R2 writes keyed by bodyHash are naturally idempotent, so a concurrent
        // duplicate delivery overwriting the same key is harmless.
        if (raw.body !== undefined) {
            await this.#bucket.put(bodyKey(raw.bodyHash), raw.body, {
                customMetadata: { rawId: raw.rawId, platform: raw.platform },
            });
        }
        const insertedAt = this.#clock();
        // The metadata column carries the full neutral record MINUS the body (the body
        // lives in R2). On read-back we re-attach the body from R2.
        const { body: _body, ...meta } = raw;
        // INSERT OR IGNORE then SELECT: no SELECT-then-INSERT race (Oracle review,
        // "Fix raw.put() race before live"). Two concurrent duplicate deliveries can
        // both reach here; exactly one INSERT wins, the other is a no-op. We learn
        // which won by comparing the persisted inserted_at to the one we proposed.
        await this.#db
            .prepare(`INSERT OR IGNORE INTO ${TABLE} (raw_id, body_hash, has_body, inserted_at, metadata) VALUES (?, ?, ?, ?, ?)`)
            .bind(raw.rawId, raw.bodyHash, raw.body === undefined ? 0 : 1, insertedAt, JSON.stringify(meta))
            .run();
        const row = await this.#db
            .prepare(`SELECT inserted_at FROM ${TABLE} WHERE raw_id = ?`)
            .bind(raw.rawId)
            .first();
        const persistedAt = row?.inserted_at ?? insertedAt;
        return { rawId: raw.rawId, inserted: persistedAt === insertedAt, insertedAt: persistedAt };
    }
    /**
     * Read a raw delivery back, re-attaching the R2 body when one was stored. Used by
     * the queue consumer's "load raw" step. Returns undefined when the rawId is
     * unknown. Decodes through the neutral decoder so no untyped record escapes.
     */
    async get(rawId) {
        const row = await this.#db
            .prepare(`SELECT raw_id, body_hash, has_body, inserted_at, metadata FROM ${TABLE} WHERE raw_id = ?`)
            .bind(rawId)
            .first();
        if (!row)
            return undefined;
        const meta = JSON.parse(row.metadata);
        if (row.has_body === 1) {
            const obj = await this.#bucket.get(bodyKey(row.body_hash));
            if (obj)
                meta["body"] = await obj.text();
        }
        return orThrow("raw delivery (D1/R2 read-back)", decodeRawDelivery(meta));
    }
}
//# sourceMappingURL=raw-store.js.map