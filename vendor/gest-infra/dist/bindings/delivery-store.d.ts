import type { ClaimDeliveryWork, CompleteDeliveryWork, DeliveryGateStore, DeliveryWork, DeliveryWorkClaim, FailDeliveryWork, MessageDedupeClaim, MessageDedupeRequest, MessageDedupeStore, PrepareDeliveryRequest, PrepareDeliveryResult } from "@gest/ingest-core";
import type { D1Database } from "../env.js";
export declare class D1DeliveryGateStore implements DeliveryGateStore {
    #private;
    constructor(db: D1Database);
    prepareDelivery(input: PrepareDeliveryRequest): Promise<PrepareDeliveryResult>;
    markEnqueued(input: {
        readonly workId: string;
        readonly now: string;
    }): Promise<void>;
    listUnenqueued(input: {
        readonly now: string;
        readonly limit: number;
    }): Promise<readonly DeliveryWork[]>;
    listRepairable(input: {
        readonly now: string;
        readonly limit: number;
    }): Promise<readonly DeliveryWork[]>;
    claimWork(input: ClaimDeliveryWork): Promise<DeliveryWorkClaim | undefined>;
    completeWork(input: CompleteDeliveryWork): Promise<void>;
    failWork(input: FailDeliveryWork): Promise<void>;
    /** Read-only snapshot for assertions/repair. */
    getWork(workId: string): Promise<DeliveryWork | undefined>;
}
export declare class D1MessageDedupeStore implements MessageDedupeStore {
    #private;
    constructor(db: D1Database);
    claim(request: MessageDedupeRequest): Promise<MessageDedupeClaim>;
}
//# sourceMappingURL=delivery-store.d.ts.map