// @gest/infra / bindings / D1EventJournal
//
// The production D1 implementation of the consumer's append-once event journal +
// runtime record log (LocalEventJournal contract). Binding glue only: it persists
// the canonical events and runtime records the consumer produces, keyed for
// append-once semantics (event_id / record_id PRIMARY KEY -> INSERT OR IGNORE).
//
// The structured columns mirror the 0001 schema (so the rows are queryable), and
// the full neutral record is round-tripped through the core decoders on read so
// no untyped record escapes. No platform/runtime policy lives here.
import { decodeCanonicalEvent, decodeRuntimeRecord, orThrow } from "@gest/ingest-core";
function rowToEvent(row) {
    return orThrow("journal_event", decodeCanonicalEvent({
        eventId: row.event_id,
        platform: row.platform,
        rawId: row.raw_id,
        nativeKey: row.native_key,
        decoderVersion: row.decoder_version,
        occurredAt: row.occurred_at,
        tenant: row.tenant,
        account: row.account,
        source: JSON.parse(row.source),
    }));
}
function rowToRecord(row) {
    return orThrow("journal_record", decodeRuntimeRecord({
        recordId: row.record_id,
        eventId: row.event_id,
        runtimeVersion: row.runtime_version,
        producedAt: row.produced_at,
        decision: JSON.parse(row.decision),
    }));
}
export class D1EventJournal {
    #db;
    constructor(db) {
        this.#db = db;
    }
    async appendEvent(event) {
        // Append-once on event_id.
        await this.#db
            .prepare(`INSERT OR IGNORE INTO journal_event
           (event_id, platform, raw_id, native_key, decoder_version, occurred_at, tenant, account, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(event.eventId, event.platform, event.rawId, event.nativeKey, event.decoderVersion, event.occurredAt, event.tenant, event.account, JSON.stringify(event.source))
            .run();
    }
    async appendRuntimeRecord(record) {
        // Append-once on record_id.
        await this.#db
            .prepare(`INSERT OR IGNORE INTO journal_record
           (record_id, event_id, runtime_version, produced_at, decision)
         VALUES (?, ?, ?, ?, ?)`)
            .bind(record.recordId, record.eventId, record.runtimeVersion, record.producedAt, JSON.stringify(record.decision))
            .run();
    }
    async readEvent(eventId) {
        const row = await this.#db
            .prepare(`SELECT * FROM journal_event WHERE event_id = ?`)
            .bind(eventId)
            .first();
        return row ? rowToEvent(row) : undefined;
    }
    async listEvents() {
        const res = await this.#db.prepare(`SELECT * FROM journal_event`).all();
        return res.results.map(rowToEvent);
    }
    async listRecords() {
        const res = await this.#db.prepare(`SELECT * FROM journal_record`).all();
        return res.results.map(rowToRecord);
    }
}
//# sourceMappingURL=journal.js.map