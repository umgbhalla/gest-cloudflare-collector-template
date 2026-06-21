import { type Json } from "./json.js";
import { type Decoder } from "./decode.js";
import { type Platform } from "./platform.js";
import { type EventSource } from "./event.js";
/**
 * Canonical, platform-neutral event. The top level carries only neutral
 * identity. Platform payloads are namespaced under `source` so no platform can
 * leak fields into the shared shape.
 */
export interface CanonicalEvent {
    readonly eventId: string;
    readonly platform: Platform;
    /** Raw delivery this event was decoded from. */
    readonly rawId: string;
    /** Native event key (from the platform adapter), for correlation/dedupe. */
    readonly nativeKey: string;
    /** Decoder version that produced this event, for replay honesty. */
    readonly decoderVersion: string;
    /** Logical occurrence time the platform reported (ISO-8601). */
    readonly occurredAt: string;
    /** Tenant/account scope, mirrored from the raw delivery. */
    readonly tenant: string;
    readonly account: string;
    /**
     * Platform-namespaced source data. Keyed by platform; value is opaque typed
     * JSON owned by that platform adapter. The core never reads inside it. Shares
     * the single canonical {@link EventSource} contract + decoder with the
     * normalized event, so the "source keys must be valid platforms" rule has one
     * source of truth.
     */
    readonly source: EventSource;
}
export declare const decodeCanonicalEvent: Decoder<CanonicalEvent>;
/**
 * A runtime record: the outcome of a consumer acting on a canonical event. The
 * core stores it opaquely. `decision` is typed JSON the runtime owns; the core
 * does not interpret it (no ep-effect/AxAgent/Claude/OpenAI knowledge).
 */
export interface RuntimeRecord {
    readonly recordId: string;
    /** Event this record responds to. */
    readonly eventId: string;
    /** Runtime/consumer version, for replay comparison. */
    readonly runtimeVersion: string;
    readonly producedAt: string;
    /** Opaque decision payload owned by the runtime consumer. */
    readonly decision: Json;
}
export declare const decodeRuntimeRecord: Decoder<RuntimeRecord>;
/** The journal capability surface, as a contract (no implementation here). */
export interface EventJournal {
    appendEvent(event: CanonicalEvent): Promise<void>;
    appendRuntimeRecord(record: RuntimeRecord): Promise<void>;
    readEvent(eventId: string): Promise<CanonicalEvent | undefined>;
}
//# sourceMappingURL=journal.d.ts.map