import type { CanonicalEvent, RuntimeRecord } from "@gest/ingest-core";
import type { LocalEventJournal } from "../stores.js";
import type { D1Database } from "../env.js";
export declare class D1EventJournal implements LocalEventJournal {
    #private;
    constructor(db: D1Database);
    appendEvent(event: CanonicalEvent): Promise<void>;
    appendRuntimeRecord(record: RuntimeRecord): Promise<void>;
    readEvent(eventId: string): Promise<CanonicalEvent | undefined>;
    listEvents(): Promise<readonly CanonicalEvent[]>;
    listRecords(): Promise<readonly RuntimeRecord[]>;
}
//# sourceMappingURL=journal.d.ts.map