import { type SqlStorage, type Tracer } from "@gest/ingest-core";
import { type GatewaySessionState, type GatewayContext } from "@gest/ingest-discord";
import type { CloudflareQueue } from "@gest/ingest-cloudflare";
/**
 * A minimal outbound WebSocket the DO drives. The real implementation is the
 * Workers WebSocket from the fetch-Upgrade 401 workaround; the unit test passes a
 * fake in-memory socket. The DO only sends JSON frames and receives decoded
 * message / close / error callbacks.
 */
export interface GatewaySocket {
    /** Send a JSON-encoded gateway frame. */
    send(data: string): void;
    /** Close the socket with a code (≠1000/1001 keeps a session resumable). */
    close(code: number, reason?: string): void;
}
/** Callbacks the DO registers on a freshly opened socket. */
export interface GatewaySocketHandlers {
    onMessage(data: string): void | Promise<void>;
    onClose(code: number, reason: string): void | Promise<void>;
    onError(message: string): void | Promise<void>;
}
/**
 * Opens the outbound gateway connection. Production resolves the ws url from
 * `GET {gatewayBaseUrl}/gateway/bot` then connects via the fetch-Upgrade approach
 * (401-not-101 workaround). The transport is injectable so the unit test connects
 * to an in-memory fake; the local emulate harness connects to its localhost ws.
 */
export interface GatewayTransport {
    /**
     * Open a socket to the gateway and register handlers. `urlOverride` is the
     * RESUME target (`resume_gateway_url`) when reconnecting a session; when absent
     * the transport resolves the base ws url from `GET {gatewayBaseUrl}/gateway/bot`.
     */
    open(input: {
        readonly botToken: string;
        readonly gatewayBaseUrl: string;
        readonly urlOverride?: string;
        readonly handlers: GatewaySocketHandlers;
    }): Promise<GatewaySocket>;
}
/** The DO alarm + storage surface we depend on (structural, offline-safe). */
export interface GatewayDurableObjectState {
    readonly storage: {
        readonly sql: SqlStorage;
        setAlarm(scheduledTime: number): Promise<void> | void;
        getAlarm(): Promise<number | null> | number | null;
    };
}
/** Public control credentials supplied to `connect()`. */
export interface GatewayConnectCredentials {
    readonly botToken: string;
    readonly applicationId: string;
    readonly intents?: number;
    /** Real wss://gateway.discord.gg in prod; the emulate ws url in tests. */
    readonly gatewayBaseUrl: string;
    readonly tenant: string;
    readonly shard?: readonly [number, number];
}
/** The status snapshot `status()` returns. */
export interface GatewayStatus {
    readonly connected: boolean;
    readonly phase: GatewaySessionState["phase"];
    readonly sessionId?: string;
    readonly lastSequence?: number;
    readonly resumeGatewayUrl?: string;
    readonly heartbeatIntervalMs?: number;
    readonly nextHeartbeatAt?: number;
    readonly terminal?: string;
}
/** Everything the DO needs beyond its state, injected for offline testing. */
export interface GatewayRunnerDeps {
    readonly transport: GatewayTransport;
    readonly queue: CloudflareQueue;
    /** Wall clock (ms). Injected so tests are deterministic. */
    now(): number;
    /** ISO clock for record timestamps. Defaults to `new Date(now()).toISOString()`. */
    isoNow?(): string;
    /** Jitter factor in [0,1) for the FIRST heartbeat schedule. Defaults to 0. */
    jitter?(): number;
    /** Stable rawId for a gateway frame; defaults to a deterministic derivation. */
    rawIdFor?(nativeKey: string): string;
    /**
     * Domain tracer for the gateway stages (connect / frame decode / tick heartbeat
     * / enqueue delivery). Defaults to the NoopTracer for offline tests; the deployed
     * DO injects the native CloudflareTracer. The WS bytes + DO SQLite are
     * CF-auto-traced; these custom spans cover the protocol/domain stages only.
     */
    readonly tracer?: Tracer;
}
/**
 * The Discord gateway Runner Durable Object. One instance per (tenant, bot)
 * connection (the Worker routes via idFromName). Its single-threaded execution is
 * the serialization point for the gateway session; its alarm keeps it alive
 * (preventing idle eviction) and satisfies Discord's op-1 heartbeat.
 */
export declare class DiscordGatewayRunner {
    #private;
    constructor(state: GatewayDurableObjectState, deps: GatewayRunnerDeps);
    /**
     * Begin a connection with the given credentials. Persists the config + a fresh
     * session, opens the socket, and schedules the keep-alive alarm. Idempotent: a
     * second connect with the same credentials re-opens cleanly.
     */
    connect(credentials: GatewayConnectCredentials): Promise<GatewayStatus>;
    /** Close the socket cleanly and stop heartbeating. Keeps no resumable session. */
    disconnect(): Promise<GatewayStatus>;
    /** A credential-free snapshot of the connection lifecycle. */
    status(): GatewayStatus;
    /**
     * The DO alarm handler. Runs at ~heartbeat_interval: it (a) reconnects a dead
     * socket (eviction/redeploy killed it) using the persisted RESUME state, then
     * (b) drives the pure machine's `onTick` to emit a heartbeat or detect a zombie.
     * It ALWAYS re-arms the next alarm so the DO never idle-evicts while connected.
     */
    alarm(): Promise<void>;
}
/** The GatewayContext the ingest seam needs (re-exported for the real transport). */
export type { GatewayContext };
//# sourceMappingURL=discord-gateway-do.d.ts.map