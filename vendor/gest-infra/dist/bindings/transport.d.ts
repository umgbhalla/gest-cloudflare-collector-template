import { type EffectHttpRequest, type EffectHttpResponse, type EffectHttpTransport } from "@gest/ingest-core";
/** The subset of the Fetch API this transport needs (injectable for tests). */
export interface FetchLike {
    (url: string, init: FetchInit): Promise<FetchResponseLike>;
}
export interface FetchInit {
    readonly method: string;
    readonly headers: readonly [string, string][];
    readonly body?: Uint8Array | string;
    readonly signal?: unknown;
}
export interface FetchResponseLike {
    readonly status: number;
    headers: {
        forEach(cb: (value: string, key: string) => void): void;
    };
    arrayBuffer(): Promise<ArrayBuffer>;
}
export type Clock = () => string;
/** Build an EffectHttpTransport from an injected fetch + clock. */
export declare class EffectHttpFetchTransport implements EffectHttpTransport {
    #private;
    constructor(fetchImpl: FetchLike, clock: Clock);
    send(request: EffectHttpRequest): Promise<EffectHttpResponse>;
}
//# sourceMappingURL=transport.d.ts.map