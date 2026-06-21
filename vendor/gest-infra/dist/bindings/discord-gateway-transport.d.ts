import type { GatewaySocket, GatewaySocketHandlers, GatewayTransport } from "../worker/discord-gateway-do.js";
/** The platform WebSocket surface we drive (subset of the Workers WebSocket). */
export interface WorkerWebSocket {
    accept(): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: "message" | "close" | "error", listener: (event: WorkerWsEvent) => void): void;
}
/** A structural event off the Workers WebSocket. */
export interface WorkerWsEvent {
    readonly data?: unknown;
    readonly code?: number;
    readonly reason?: string;
    readonly message?: string;
}
/** A structural fetch Response that may carry a `webSocket` on a 101 upgrade. */
export interface UpgradeResponse {
    readonly status: number;
    readonly webSocket: WorkerWebSocket | null;
    json(): Promise<unknown>;
}
/** The subset of fetch used for the gateway-bot lookup + the WS upgrade. */
export interface GatewayFetch {
    (url: string, init?: GatewayFetchInit): Promise<UpgradeResponse>;
}
export interface GatewayFetchInit {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
}
/** Construction inputs for the real transport. */
export interface DiscordGatewayTransportOptions {
    /** The isolate's global `fetch` (injected so it is testable). */
    readonly fetch: GatewayFetch;
    /** Gateway API version (v1 pins 10). */
    readonly apiVersion?: number;
}
/**
 * The production transport. Resolves the ws url via `GET {base}/gateway/bot`
 * (unless a RESUME `urlOverride` is given), then upgrades to a WebSocket with the
 * 401 workaround and wires the DO's handlers onto it.
 */
export declare class DiscordGatewayTransport implements GatewayTransport {
    #private;
    constructor(opts: DiscordGatewayTransportOptions);
    open(input: {
        readonly botToken: string;
        readonly gatewayBaseUrl: string;
        readonly urlOverride?: string;
        readonly handlers: GatewaySocketHandlers;
    }): Promise<GatewaySocket>;
}
//# sourceMappingURL=discord-gateway-transport.d.ts.map