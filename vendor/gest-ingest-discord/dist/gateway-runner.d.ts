import { type Json, type JsonObject } from "@gest/ingest-core";
import { type DiscordGatewayIngest, type DiscordIngestEnv } from "./ingest.js";
/**
 * v1 default intents bitfield:
 *   GUILDS(1) | GUILD_MESSAGES(512) | GUILD_MESSAGE_REACTIONS(1024) |
 *   GUILD_MEMBERS(2) | MESSAGE_CONTENT(32768) = 34307.
 */
export declare const DISCORD_DEFAULT_INTENTS = 34307;
/** v1 single shard: this connection is shard 0 of 1. */
export declare const DISCORD_V1_SHARD: readonly [number, number];
/**
 * Close codes that keep the session resumable: reconnect and RESUME (op 6).
 * From docs/research/discord-full-spec.md §1.6.
 */
export declare const RESUMABLE_CLOSE_CODES: ReadonlySet<number>;
/**
 * Close codes that force a FRESH session (discard session_id/seq) on reconnect:
 * 4007 (invalid seq) and 4009 (session timed out). Still "reconnect", but as a
 * brand-new IDENTIFY rather than a RESUME.
 */
export declare const FRESH_SESSION_CLOSE_CODES: ReadonlySet<number>;
/**
 * Fatal close codes: stop the runner with a typed terminal error. No reconnect.
 * From docs/research/discord-full-spec.md §1.6.
 */
export declare const FATAL_CLOSE_CODES: ReadonlySet<number>;
/**
 * Static config the runner needs, supplied once by the DO. Holds NO live socket
 * and NO clock; the token is a credential the DO injects and is never persisted
 * by this pure module.
 */
export interface GatewayRunnerConfig {
    /** Bot token used in IDENTIFY/RESUME `d.token`. */
    readonly token: string;
    /** Application (bot) id, for the gateway event envelope. */
    readonly applicationId: string;
    /** IDENTIFY intents bitfield. Defaults to {@link DISCORD_DEFAULT_INTENTS}. */
    readonly intents?: number;
    /** Shard tuple [id, count]. Defaults to {@link DISCORD_V1_SHARD}. */
    readonly shard?: readonly [number, number];
    /** Tenant carried onto produced raw deliveries / normalized events. */
    readonly tenant: string;
    /** IDENTIFY connection properties (os/browser/device). Defaults provided. */
    readonly properties?: GatewayIdentifyProperties;
}
export interface GatewayIdentifyProperties {
    readonly os: string;
    readonly browser: string;
    readonly device: string;
}
/**
 * The persisted, durable session snapshot. The DO writes this to SQLite after
 * every step so that after eviction/redeploy the next alarm reconnects with the
 * right RESUME state. Everything here is plain data (no socket, no clock).
 */
export interface GatewaySessionState {
    /** Phase of the connection lifecycle. */
    readonly phase: GatewayPhase;
    /** Captured at READY; absent until then. */
    readonly sessionId?: string;
    /** Captured at READY; the URL a RESUME must target. */
    readonly resumeGatewayUrl?: string;
    /** Last sequence `s` from any op-0 DISPATCH (the heartbeat/resume cursor). */
    readonly lastSequence?: number;
    /** HELLO heartbeat interval in ms; absent before HELLO. */
    readonly heartbeatIntervalMs?: number;
    /**
     * Clock value (ms) at which the next heartbeat is due. The DO compares its
     * alarm time against this. Absent before HELLO schedules the first beat.
     */
    readonly nextHeartbeatAt?: number;
    /**
     * Clock value (ms) when the last op-1 HEARTBEAT was sent and is awaiting an
     * op-11 ACK. Absent when no beat is pending (cleared by ACK). Used for zombie
     * detection (no ACK within 2x interval).
     */
    readonly heartbeatPendingSince?: number;
    /** Whether the previously sent heartbeat has been ACKed. */
    readonly lastHeartbeatAcked: boolean;
}
/** Lifecycle phase of the gateway connection. */
export type GatewayPhase = 
/** No socket logic yet; awaiting `onConnect`. */
"idle"
/** IDENTIFY/RESUME sent after HELLO; awaiting READY/RESUMED. */
 | "identifying" | "resuming"
/** READY captured; steady state, receiving dispatches + heartbeating. */
 | "ready"
/** Terminal: a fatal close code stopped the runner. */
 | "fatal";
/** A fresh state for a runner that has never connected. */
export declare function initialSessionState(): GatewaySessionState;
/** A gateway control/command frame to send on the socket (already JSON-shaped). */
export type OutboundFrame = JsonObject;
/**
 * What to do with the socket. `reconnect: false` is a clean/terminal stop. When
 * `reconnect: true`, `resume: true` means reopen to `resumeGatewayUrl` and send
 * op 6; `resume: false` means reopen and re-IDENTIFY (fresh session).
 */
export interface CloseAction {
    /** WebSocket close code to send (≠1000/1001 keeps a session resumable). */
    readonly code: number;
    /** Human reason, for audit/logs. */
    readonly reason: string;
    /** Whether the DO should reopen a socket after closing. */
    readonly reconnect: boolean;
    /** When reconnecting: RESUME (true) vs fresh IDENTIFY (false). */
    readonly resume: boolean;
    /** When reconnecting+resuming: the URL to target. */
    readonly resumeGatewayUrl?: string;
    /** Set on a fatal stop: the typed terminal error. */
    readonly terminal?: GatewayTerminalError;
}
/** Typed terminal error for a fatal close code. */
export interface GatewayTerminalError {
    readonly kind: "fatal-close";
    readonly code: number;
    readonly name: GatewayFatalName;
    readonly message: string;
}
export type GatewayFatalName = "authentication-failed" | "invalid-shard" | "sharding-required" | "invalid-api-version" | "invalid-intents" | "disallowed-intents" | "unknown-fatal";
/** The result of one machine step. The DO applies each field. */
export interface GatewayStep {
    /** Next session snapshot to persist. */
    readonly sessionUpdate: GatewaySessionState;
    /** Control/command frames to write to the socket, in order. */
    readonly sendFrames: readonly OutboundFrame[];
    /** Decoded DISPATCH outcomes to persist + feed into the delivery gate. */
    readonly rawDeliveries: readonly DiscordGatewayIngest[];
    /** Socket action, when the machine wants the socket closed. */
    readonly closeAction?: CloseAction;
    /**
     * Diagnostic notes (e.g. "accept-and-ignore op 3"). Pure data for audit; the
     * DO may log or drop these.
     */
    readonly notes: readonly string[];
}
/**
 * Per-frame ingest identity the DO supplies (a stable raw id + receive time).
 * Mirrors the HTTP path's env; the rawId/receivedAt come from the DO, not here,
 * to keep this module clock-free and id-free.
 */
export type GatewayFrameEnv = Pick<DiscordIngestEnv, "rawId" | "receivedAt">;
/**
 * Begin (or resume) a connection. Called by the DO immediately after the socket
 * opens, BEFORE any frame is read. This does NOT send IDENTIFY/RESUME yet — that
 * happens on HELLO (op 10), per the lifecycle. It only resets per-connection
 * heartbeat state while preserving any resumable session (session_id/seq/url).
 */
export declare function onConnect(state: GatewaySessionState, _config: GatewayRunnerConfig): GatewayStep;
/**
 * Drive the machine with a single decoded frame from the socket plus the current
 * clock value `now` (ms) and a `jitter` factor in [0, 1) used ONLY for the first
 * heartbeat schedule on HELLO. `frameEnv` supplies the DO-assigned raw id +
 * receive time for any DISPATCH outcome.
 *
 * `frameInput` is the raw JSON frame (object) off the socket; the machine
 * decodes it via the existing pure decoder. Unparseable frames are accept-and-
 * ignored (noted), never crash.
 */
export declare function onFrame(state: GatewaySessionState, config: GatewayRunnerConfig, frameInput: Json, ctx: {
    readonly now: number;
    readonly jitter: number;
    readonly frameEnv: GatewayFrameEnv;
}): GatewayStep;
/**
 * Clock tick driven by the DO's alarm. Decides: (a) zombie? (no op-11 ACK within
 * 2x interval since the pending beat) -> close (resumable) + reconnect+resume;
 * (b) heartbeat due? (now >= nextHeartbeatAt) -> send op 1, mark pending,
 * schedule the next beat. Returns no frames when nothing is due yet.
 */
export declare function onTick(state: GatewaySessionState, _config: GatewayRunnerConfig, now: number): GatewayStep;
/**
 * A close frame arrived from the server (or the socket errored). Apply the
 * close-code policy: fatal -> stop with a typed terminal error; resumable ->
 * reconnect (RESUME, or fresh session for 4007/4009); 1000/1001 -> clean stop;
 * anything else -> conservative reconnect+resume.
 */
export declare function onClose(state: GatewaySessionState, code: number, reason?: string): GatewayStep;
//# sourceMappingURL=gateway-runner.d.ts.map