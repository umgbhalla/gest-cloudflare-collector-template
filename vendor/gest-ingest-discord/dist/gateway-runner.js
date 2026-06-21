// @gest/ingest-discord / gateway-runner
//
// The PURE Discord gateway state machine. It owns the gateway PROTOCOL logic
// (HELLO/IDENTIFY/RESUME, sequence tracking, heartbeat scheduling + zombie
// detection, op-7/op-9 reconnect decisions, and the close-code resumable/fatal
// split) WITHOUT owning a socket, a clock, storage, or any provider/cloudflare
// code. It imports ONLY @gest/ingest-core.
//
// Design (injectable-socket): the infra Durable Object owns the real WebSocket,
// the alarm, and SQLite. It feeds this module decoded frames, the current time
// (a clock value, never `Date.now()` here), and the persisted session state, and
// applies what the module returns:
//
//   - sendFrames    : control frames to write to the socket (IDENTIFY/RESUME/
//                     HEARTBEAT). Already JSON-shaped gateway payloads.
//   - rawDeliveries : decoded DISPATCH outcomes (envelope + dedupe key +
//                     optional normalized event) the DO persists raw-first and
//                     feeds into the SAME delivery-gate the HTTP ack-path uses.
//   - sessionUpdate : the new persisted session snapshot (session_id, last_seq,
//                     resume_gateway_url, heartbeat timers) to write to storage.
//   - closeAction   : when the machine wants the socket closed (zombie / op7 /
//                     op9 / fatal close), with whether to reconnect and resume.
//
// There is NO timer here: the DO drives an alarm and calls `onTick(state, now)`.
// All randomness (heartbeat jitter, op-9 re-IDENTIFY delay) is injected so the
// machine is deterministic and testable with a fake frame source.
import { isJsonObject, strOf, } from "@gest/ingest-core";
import { GATEWAY_OPCODES, decodeGatewayFrame, } from "./envelope.js";
import { ingestDiscordGateway, } from "./ingest.js";
// ---------------------------------------------------------------------------
// v1 wire constants (docs/research/discord-full-spec.md §1.7, §6).
// ---------------------------------------------------------------------------
/**
 * v1 default intents bitfield:
 *   GUILDS(1) | GUILD_MESSAGES(512) | GUILD_MESSAGE_REACTIONS(1024) |
 *   GUILD_MEMBERS(2) | MESSAGE_CONTENT(32768) = 34307.
 */
export const DISCORD_DEFAULT_INTENTS = 34307;
/** v1 single shard: this connection is shard 0 of 1. */
export const DISCORD_V1_SHARD = [0, 1];
/**
 * Close codes that keep the session resumable: reconnect and RESUME (op 6).
 * From docs/research/discord-full-spec.md §1.6.
 */
export const RESUMABLE_CLOSE_CODES = new Set([
    4000, 4001, 4002, 4003, 4005, 4007, 4008, 4009,
]);
/**
 * Close codes that force a FRESH session (discard session_id/seq) on reconnect:
 * 4007 (invalid seq) and 4009 (session timed out). Still "reconnect", but as a
 * brand-new IDENTIFY rather than a RESUME.
 */
export const FRESH_SESSION_CLOSE_CODES = new Set([4007, 4009]);
/**
 * Fatal close codes: stop the runner with a typed terminal error. No reconnect.
 * From docs/research/discord-full-spec.md §1.6.
 */
export const FATAL_CLOSE_CODES = new Set([
    4004, 4010, 4011, 4012, 4013, 4014,
]);
const DEFAULT_PROPERTIES = {
    os: "linux",
    browser: "gest",
    device: "gest",
};
/** A fresh state for a runner that has never connected. */
export function initialSessionState() {
    return { phase: "idle", lastHeartbeatAcked: true };
}
// ---------------------------------------------------------------------------
// Helpers: build outbound frames.
// ---------------------------------------------------------------------------
function identifyFrame(config) {
    const shard = config.shard ?? DISCORD_V1_SHARD;
    const props = config.properties ?? DEFAULT_PROPERTIES;
    return {
        op: GATEWAY_OPCODES.IDENTIFY,
        d: {
            token: config.token,
            intents: config.intents ?? DISCORD_DEFAULT_INTENTS,
            // v1: json encoding, NO compression.
            compress: false,
            shard: [shard[0], shard[1]],
            properties: {
                os: props.os,
                browser: props.browser,
                device: props.device,
            },
        },
    };
}
function resumeFrame(config, sessionId, seq) {
    return {
        op: GATEWAY_OPCODES.RESUME,
        d: {
            token: config.token,
            session_id: sessionId,
            seq: seq ?? null,
        },
    };
}
function heartbeatFrame(lastSequence) {
    return {
        op: GATEWAY_OPCODES.HEARTBEAT,
        d: lastSequence ?? null,
    };
}
// ---------------------------------------------------------------------------
// Transitions.
// ---------------------------------------------------------------------------
/**
 * Begin (or resume) a connection. Called by the DO immediately after the socket
 * opens, BEFORE any frame is read. This does NOT send IDENTIFY/RESUME yet — that
 * happens on HELLO (op 10), per the lifecycle. It only resets per-connection
 * heartbeat state while preserving any resumable session (session_id/seq/url).
 */
export function onConnect(state, _config) {
    if (state.phase === "fatal") {
        return step(state, [], ["onConnect ignored: runner is in a terminal fatal state"]);
    }
    const resumable = canResume(state);
    // Preserve session_id/seq/url for a RESUME; clear per-connection heartbeat
    // timers (a new socket has not sent HELLO yet).
    const next = {
        phase: resumable ? "resuming" : "identifying",
        lastHeartbeatAcked: true,
        ...(state.sessionId === undefined ? {} : { sessionId: state.sessionId }),
        ...(state.resumeGatewayUrl === undefined ? {} : { resumeGatewayUrl: state.resumeGatewayUrl }),
        ...(state.lastSequence === undefined ? {} : { lastSequence: state.lastSequence }),
    };
    return step(next, [], [
        resumable
            ? "onConnect: existing session -> will RESUME on HELLO"
            : "onConnect: no session -> will IDENTIFY on HELLO",
    ]);
}
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
export function onFrame(state, config, frameInput, ctx) {
    if (state.phase === "fatal") {
        return step(state, [], ["onFrame ignored: runner is in a terminal fatal state"]);
    }
    const decoded = decodeGatewayFrame(frameInput);
    if (!decoded.ok) {
        return step(state, [], [
            `accept-and-ignore: undecodable frame (${decoded.issues.map((i) => i.message).join("; ")})`,
        ]);
    }
    const frame = decoded.value;
    switch (frame.op) {
        case GATEWAY_OPCODES.HELLO:
            return onHello(state, config, frame, ctx.now, ctx.jitter);
        case GATEWAY_OPCODES.HEARTBEAT:
            // Server requested an immediate beat (op 1, recv direction).
            return onServerHeartbeatRequest(state, ctx.now);
        case GATEWAY_OPCODES.HEARTBEAT_ACK:
            return onHeartbeatAck(state);
        case GATEWAY_OPCODES.DISPATCH:
            return onDispatch(state, config, frame, ctx.frameEnv);
        case GATEWAY_OPCODES.RECONNECT:
            return onReconnect(state);
        case GATEWAY_OPCODES.INVALID_SESSION:
            return onInvalidSession(state, frame);
        default:
            // Accept-and-ignore everything else (op 3 Presence, op 4 Voice, op 8
            // Request Guild Members are SEND-only; never crash on an unexpected recv).
            return step(state, [], [`accept-and-ignore: unhandled op ${frame.op}`]);
    }
}
/**
 * Clock tick driven by the DO's alarm. Decides: (a) zombie? (no op-11 ACK within
 * 2x interval since the pending beat) -> close (resumable) + reconnect+resume;
 * (b) heartbeat due? (now >= nextHeartbeatAt) -> send op 1, mark pending,
 * schedule the next beat. Returns no frames when nothing is due yet.
 */
export function onTick(state, _config, now) {
    if (state.phase === "fatal" || state.heartbeatIntervalMs === undefined) {
        return step(state, [], []);
    }
    const interval = state.heartbeatIntervalMs;
    // Zombie detection: a beat is pending (sent, not yet ACKed) and 2x interval
    // has elapsed since it was sent -> the connection is dead.
    if (state.heartbeatPendingSince !== undefined &&
        !state.lastHeartbeatAcked &&
        now - state.heartbeatPendingSince >= 2 * interval) {
        // Close with a code ≠ 1000/1001 so the session stays resumable, then
        // reconnect + RESUME.
        return zombieClose(state, now);
    }
    // Heartbeat due?
    if (state.nextHeartbeatAt !== undefined && now >= state.nextHeartbeatAt) {
        const next = {
            ...state,
            nextHeartbeatAt: now + interval,
            heartbeatPendingSince: now,
            lastHeartbeatAcked: false,
        };
        return step(next, [heartbeatFrame(state.lastSequence)], ["heartbeat due -> op 1 sent"]);
    }
    return step(state, [], []);
}
/**
 * A close frame arrived from the server (or the socket errored). Apply the
 * close-code policy: fatal -> stop with a typed terminal error; resumable ->
 * reconnect (RESUME, or fresh session for 4007/4009); 1000/1001 -> clean stop;
 * anything else -> conservative reconnect+resume.
 */
export function onClose(state, code, reason = "") {
    if (FATAL_CLOSE_CODES.has(code)) {
        const terminal = terminalErrorFor(code);
        const next = { ...state, phase: "fatal" };
        return {
            sessionUpdate: next,
            sendFrames: [],
            rawDeliveries: [],
            closeAction: {
                code,
                reason: reason || terminal.message,
                reconnect: false,
                resume: false,
                terminal,
            },
            notes: [`fatal close ${code} (${terminal.name}) -> stop`],
        };
    }
    // Clean closes: do NOT auto-resume.
    if (code === 1000 || code === 1001) {
        const next = initialSessionState();
        return {
            sessionUpdate: next,
            sendFrames: [],
            rawDeliveries: [],
            closeAction: { code, reason: reason || "clean close", reconnect: false, resume: false },
            notes: [`clean close ${code} -> stop (no auto-resume)`],
        };
    }
    const fresh = FRESH_SESSION_CLOSE_CODES.has(code);
    const resumable = RESUMABLE_CLOSE_CODES.has(code);
    // Resumable codes RESUME unless they force a fresh session; unknown/other
    // server-initiated codes default to a conservative reconnect+resume.
    const doResume = resumable && !fresh && canResume(state);
    const next = doResume ? resetForReconnect(state) : resetFresh();
    return {
        sessionUpdate: next,
        sendFrames: [],
        rawDeliveries: [],
        closeAction: {
            code,
            reason: reason || (fresh ? "resumable (fresh session)" : "resumable"),
            reconnect: true,
            resume: doResume,
            ...(doResume && state.resumeGatewayUrl !== undefined
                ? { resumeGatewayUrl: state.resumeGatewayUrl }
                : {}),
        },
        notes: [
            `close ${code} -> reconnect (${doResume ? "RESUME" : "fresh IDENTIFY"})`,
        ],
    };
}
// ---------------------------------------------------------------------------
// op handlers.
// ---------------------------------------------------------------------------
function onHello(state, config, frame, now, jitter) {
    const intervalMs = readHeartbeatInterval(frame);
    if (intervalMs === undefined) {
        return step(state, [], ["HELLO missing heartbeat_interval -> accept-and-ignore"]);
    }
    // Jitter the FIRST beat: delay = floor(interval * random[0,1)).
    const clamped = jitter < 0 ? 0 : jitter >= 1 ? 0.999999 : jitter;
    const firstDelay = Math.floor(intervalMs * clamped);
    const resuming = canResume(state);
    const sendFrame = resuming
        ? resumeFrame(config, state.sessionId, state.lastSequence)
        : identifyFrame(config);
    const next = {
        ...state,
        phase: resuming ? "resuming" : "identifying",
        heartbeatIntervalMs: intervalMs,
        nextHeartbeatAt: now + firstDelay,
        lastHeartbeatAcked: true,
    };
    return step(next, [sendFrame], [
        `HELLO interval=${intervalMs}ms, first beat in ${firstDelay}ms`,
        resuming ? "sent RESUME (op 6)" : "sent IDENTIFY (op 2)",
    ]);
}
function onServerHeartbeatRequest(state, now) {
    // Server asked for an immediate beat. Send op 1 and mark a beat pending.
    const next = {
        ...state,
        heartbeatPendingSince: now,
        lastHeartbeatAcked: false,
        ...(state.heartbeatIntervalMs === undefined
            ? {}
            : { nextHeartbeatAt: now + state.heartbeatIntervalMs }),
    };
    return step(next, [heartbeatFrame(state.lastSequence)], ["server op 1 -> immediate op 1 sent"]);
}
function onHeartbeatAck(state) {
    // Clear the pending beat: connection is alive.
    const next = {
        ...state,
        lastHeartbeatAcked: true,
    };
    // Drop the pending-since marker without leaving an undefined under
    // exactOptionalPropertyTypes.
    const cleaned = stripPending(next);
    return step(cleaned, [], ["op 11 ACK -> pending cleared"]);
}
function onDispatch(state, config, frame, frameEnv) {
    // Track last seq from EVERY op-0 's' (the heartbeat/resume cursor).
    const seq = frame.sequence;
    let next = seq === undefined ? state : { ...state, lastSequence: seq };
    // READY captures session_id + resume_gateway_url.
    if (frame.eventType === "READY" && frame.data !== undefined) {
        const sessionId = strOf(frame.data["session_id"]);
        const resumeUrl = strOf(frame.data["resume_gateway_url"]);
        next = {
            ...next,
            phase: "ready",
            ...(sessionId === undefined ? {} : { sessionId }),
            ...(resumeUrl === undefined ? {} : { resumeGatewayUrl: resumeUrl }),
        };
        return step(next, [], [`READY captured session_id=${sessionId ?? "?"}`]);
    }
    if (frame.eventType === "RESUMED") {
        next = { ...next, phase: "ready" };
        return step(next, [], ["RESUMED -> steady state"]);
    }
    // Any other DISPATCH: hand the FRAME to the existing pipeline to produce a
    // RawDelivery outcome (signature not-applicable; dedupe via gatewayDedupeKey).
    // The envelope needs a session_id; if READY hasn't landed yet we cannot key it
    // deterministically, so we accept-and-ignore (extremely rare: pre-READY data).
    if (next.sessionId === undefined) {
        return step(next, [], [
            `dispatch ${frame.eventType ?? "?"} before READY (no session_id) -> ignored`,
        ]);
    }
    const gatewayCtx = contextFor(config, next);
    const ingest = ingestDiscordGateway(frame.raw, gatewayCtx, {
        tenant: config.tenant,
        rawId: frameEnv.rawId,
        receivedAt: frameEnv.receivedAt,
    });
    return {
        sessionUpdate: next,
        sendFrames: [],
        rawDeliveries: [ingest],
        notes: [`dispatch ${frame.eventType ?? "?"} seq=${seq ?? "?"} -> ${ingest.kind}`],
    };
}
function onReconnect(state) {
    // op 7: server asks us to reconnect + RESUME. Close (resumable) + reconnect.
    const doResume = canResume(state);
    const next = doResume ? resetForReconnect(state) : resetFresh();
    return {
        sessionUpdate: next,
        sendFrames: [],
        rawDeliveries: [],
        closeAction: {
            code: 4000,
            reason: "server requested reconnect (op 7)",
            reconnect: true,
            resume: doResume,
            ...(doResume && state.resumeGatewayUrl !== undefined
                ? { resumeGatewayUrl: state.resumeGatewayUrl }
                : {}),
        },
        notes: [`op 7 reconnect -> ${doResume ? "RESUME" : "fresh IDENTIFY"}`],
    };
}
function onInvalidSession(state, frame) {
    // op 9: d boolean. true = resumable; false = re-IDENTIFY after 1-5s jitter.
    const resumable = frame.raw["d"] === true && canResume(state);
    if (resumable) {
        const next = resetForReconnect(state);
        return {
            sessionUpdate: next,
            sendFrames: [],
            rawDeliveries: [],
            closeAction: {
                code: 4000,
                reason: "invalid session (op 9, resumable)",
                reconnect: true,
                resume: true,
                ...(state.resumeGatewayUrl === undefined
                    ? {}
                    : { resumeGatewayUrl: state.resumeGatewayUrl }),
            },
            notes: ["op 9 d=true -> reconnect + RESUME"],
        };
    }
    // d=false (or no resumable session): discard the session, re-IDENTIFY fresh.
    // The DO is responsible for the 1-5s delay before reconnecting; the machine
    // signals intent via reconnect:true, resume:false.
    const next = resetFresh();
    return {
        sessionUpdate: next,
        sendFrames: [],
        rawDeliveries: [],
        closeAction: {
            code: 4000,
            reason: "invalid session (op 9, not resumable)",
            reconnect: true,
            resume: false,
        },
        notes: ["op 9 d=false -> discard session, re-IDENTIFY (after DO delay)"],
    };
}
// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------
function zombieClose(state, now) {
    const doResume = canResume(state);
    const next = doResume ? resetForReconnect(state) : resetFresh();
    return {
        sessionUpdate: next,
        sendFrames: [],
        rawDeliveries: [],
        closeAction: {
            // 4000 (≠1000/1001) keeps the session resumable per §1.4.
            code: 4000,
            reason: `zombie: no heartbeat ACK within 2x interval (now=${now})`,
            reconnect: true,
            resume: doResume,
            ...(doResume && state.resumeGatewayUrl !== undefined
                ? { resumeGatewayUrl: state.resumeGatewayUrl }
                : {}),
        },
        notes: ["zombie detected -> close 4000 + reconnect" + (doResume ? " + RESUME" : " (fresh)")],
    };
}
/** True when there is a captured session we may RESUME into. */
function canResume(state) {
    return state.sessionId !== undefined;
}
/** Reset per-connection timers while preserving the resumable session. */
function resetForReconnect(state) {
    return {
        phase: "resuming",
        lastHeartbeatAcked: true,
        ...(state.sessionId === undefined ? {} : { sessionId: state.sessionId }),
        ...(state.resumeGatewayUrl === undefined ? {} : { resumeGatewayUrl: state.resumeGatewayUrl }),
        ...(state.lastSequence === undefined ? {} : { lastSequence: state.lastSequence }),
    };
}
/** Reset to a fresh session (discard session_id/seq/url) for a re-IDENTIFY. */
function resetFresh() {
    return { phase: "identifying", lastHeartbeatAcked: true };
}
/** Build the GatewayContext the ingest pipeline needs from current state. */
function contextFor(config, state) {
    const shard = config.shard ?? DISCORD_V1_SHARD;
    const resume = {
        sessionId: state.sessionId,
        ...(state.resumeGatewayUrl === undefined ? {} : { resumeGatewayUrl: state.resumeGatewayUrl }),
        ...(state.lastSequence === undefined ? {} : { lastSequence: state.lastSequence }),
    };
    return {
        applicationId: config.applicationId,
        sessionId: state.sessionId,
        shardId: shard[0],
        shardCount: shard[1],
        resume,
    };
}
function readHeartbeatInterval(frame) {
    const d = frame.raw["d"];
    if (!isJsonObject(d))
        return undefined;
    const hi = d["heartbeat_interval"];
    return typeof hi === "number" && hi > 0 ? hi : undefined;
}
function stripPending(state) {
    const { heartbeatPendingSince: _drop, ...rest } = state;
    return rest;
}
function terminalErrorFor(code) {
    const name = fatalName(code);
    return {
        kind: "fatal-close",
        code,
        name,
        message: `gateway closed with fatal code ${code} (${name})`,
    };
}
function fatalName(code) {
    switch (code) {
        case 4004:
            return "authentication-failed";
        case 4010:
            return "invalid-shard";
        case 4011:
            return "sharding-required";
        case 4012:
            return "invalid-api-version";
        case 4013:
            return "invalid-intents";
        case 4014:
            return "disallowed-intents";
        default:
            return "unknown-fatal";
    }
}
/** Assemble a step with no close action. */
function step(sessionUpdate, sendFrames, notes) {
    return { sessionUpdate, sendFrames, rawDeliveries: [], notes };
}
//# sourceMappingURL=gateway-runner.js.map