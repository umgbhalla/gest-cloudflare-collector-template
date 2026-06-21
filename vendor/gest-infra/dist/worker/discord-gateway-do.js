// @gest/infra / worker / Discord gateway Runner Durable Object
//
// The HOME of the Discord gateway connection (ADR 0006): a Cloudflare Durable
// Object that opens the OUTBOUND gateway WebSocket and drives the PURE state
// machine (@gest/ingest-discord/gateway-runner) against a real socket + an
// alarm + DO SQLite + the SAME delivery-gate the HTTP ack-path uses.
//
// This file is the ONLY place that names the provider socket + the platform
// state machine + the delivery gate together; it owns the wiring, not the
// protocol. The protocol (HELLO/IDENTIFY/RESUME, seq, heartbeat, close-code
// policy, intents) lives in @gest/ingest-discord and stays pure/testable with a
// fake socket. The decode/dedupe/normalize seam stays in @gest/ingest-discord
// (ingestDiscordGateway); downstream (consumer/normalize/journal/runtime/outbox/
// replay) is BYTE-IDENTICAL to webhooks because we enter the SAME delivery gate.
//
// Boundaries kept:
//   - ingest-core / ingest-discord stay pure (no socket, no clock, no storage).
//   - The DO owns: the WebSocket (with the 401-not-101 fetch-Upgrade workaround),
//     the ALARM-driven heartbeat/keep-alive/zombie-reconnect, SQLite persistence
//     of session_id/last_seq/resume_gateway_url (survives eviction + redeploy),
//     and the raw-first persist + prepareDelivery + enqueue.
//   - Dedupe: a RESUME replays buffered dispatches with their ORIGINAL seq, so
//     the gateway native key (discord:gateway:{app}:{scope}:{session}:{seq}:{t})
//     is stable; the delivery gate collapses replays to a no-op. We additionally
//     short-circuit on a locally-recorded processed key so a replay never even
//     re-persists raw.
//
// Declared STRUCTURALLY (no @cloudflare/workers-types at compile time) so it
// typechecks offline; a deployed isolate satisfies the same shapes, and the unit
// test drives it with a fake/in-memory socket + the in-memory delivery gate.
import { NoopTracer, } from "@gest/ingest-core";
import { initialSessionState, onClose, onConnect, onFrame, onTick, } from "@gest/ingest-discord";
import { GATEWAY_FRAME_QUEUE_MESSAGE_KIND, encodeGatewayFramePayload, gatewayFrameMessageId, } from "../ids.js";
import { ATTR_ACCOUNT, ATTR_DUPLICATE, ATTR_GATEWAY_PHASE, ATTR_NATIVE_KEY, ATTR_PLATFORM, ATTR_RAW_ID, ATTR_TENANT, SPAN_GATEWAY_CONNECT, SPAN_GATEWAY_FRAME, SPAN_GATEWAY_INGEST, SPAN_GATEWAY_TICK, } from "../observability/attributes.js";
/** Delivery-gate platform tag for gateway events (same loop as webhooks). */
const PLATFORM = "discord";
// ---------------------------------------------------------------------------
// The Durable Object.
// ---------------------------------------------------------------------------
/**
 * The Discord gateway Runner Durable Object. One instance per (tenant, bot)
 * connection (the Worker routes via idFromName). Its single-threaded execution is
 * the serialization point for the gateway session; its alarm keeps it alive
 * (preventing idle eviction) and satisfies Discord's op-1 heartbeat.
 */
export class DiscordGatewayRunner {
    #sql;
    #setAlarm;
    #deps;
    #initialized = false;
    /** The live socket, when connected. Cleared on close/eviction. */
    #socket;
    constructor(state, deps) {
        this.#sql = state.storage.sql;
        this.#setAlarm = (t) => state.storage.setAlarm(t);
        this.#deps = deps;
    }
    // -------------------------------------------------------------------------
    // Public DO control surface.
    // -------------------------------------------------------------------------
    /**
     * Begin a connection with the given credentials. Persists the config + a fresh
     * session, opens the socket, and schedules the keep-alive alarm. Idempotent: a
     * second connect with the same credentials re-opens cleanly.
     */
    async connect(credentials) {
        this.#init();
        return this.#tracer().enterSpan(SPAN_GATEWAY_CONNECT, { [ATTR_PLATFORM]: PLATFORM, [ATTR_TENANT]: credentials.tenant }, async (span) => {
            this.#persistConfig(credentials);
            // A connect always starts (or continues) from the persisted session; a
            // brand new connection has no session and will IDENTIFY.
            const state = this.#loadSession();
            const next = onConnect(state, this.#config());
            this.#persistSession(next.sessionUpdate);
            await this.#openSocket(undefined);
            await this.#ensureAlarm();
            const status = this.status();
            if (span.isTraced)
                span.setAttribute(ATTR_GATEWAY_PHASE, status.phase);
            return status;
        });
    }
    /** Close the socket cleanly and stop heartbeating. Keeps no resumable session. */
    async disconnect() {
        this.#init();
        const sock = this.#socket;
        this.#socket = undefined;
        if (sock !== undefined)
            sock.close(1000, "operator disconnect");
        this.#clearPersistedControlState();
        return this.status();
    }
    /** A credential-free snapshot of the connection lifecycle. */
    status() {
        this.#init();
        const s = this.#loadSession();
        const terminal = this.#loadTerminal();
        return {
            connected: this.#socket !== undefined,
            phase: s.phase,
            ...(s.sessionId === undefined ? {} : { sessionId: s.sessionId }),
            ...(s.lastSequence === undefined ? {} : { lastSequence: s.lastSequence }),
            ...(s.resumeGatewayUrl === undefined ? {} : { resumeGatewayUrl: s.resumeGatewayUrl }),
            ...(s.heartbeatIntervalMs === undefined ? {} : { heartbeatIntervalMs: s.heartbeatIntervalMs }),
            ...(s.nextHeartbeatAt === undefined ? {} : { nextHeartbeatAt: s.nextHeartbeatAt }),
            ...(terminal === undefined ? {} : { terminal }),
        };
    }
    // -------------------------------------------------------------------------
    // Alarm: heartbeat + keep-alive + zombie reconnect.
    // -------------------------------------------------------------------------
    /**
     * The DO alarm handler. Runs at ~heartbeat_interval: it (a) reconnects a dead
     * socket (eviction/redeploy killed it) using the persisted RESUME state, then
     * (b) drives the pure machine's `onTick` to emit a heartbeat or detect a zombie.
     * It ALWAYS re-arms the next alarm so the DO never idle-evicts while connected.
     */
    async alarm() {
        this.#init();
        const config = this.#configOrUndefined();
        if (config === undefined)
            return; // never connected; nothing to keep alive.
        const state = this.#loadSession();
        if (state.phase === "fatal")
            return; // terminal: do not re-arm.
        // Dead socket (evicted/redeployed/closed): reopen and let HELLO -> RESUME run.
        if (this.#socket === undefined) {
            const next = onConnect(state, config);
            this.#persistSession(next.sessionUpdate);
            await this.#openSocket(next.sessionUpdate.resumeGatewayUrl);
            await this.#ensureAlarm();
            return;
        }
        // TICK stage: heartbeat / zombie detection on the live socket.
        await this.#tracer().enterSpan(SPAN_GATEWAY_TICK, { [ATTR_PLATFORM]: PLATFORM }, async (span) => {
            const step = onTick(this.#loadSession(), config, this.#deps.now());
            if (span.isTraced)
                span.setAttribute(ATTR_GATEWAY_PHASE, step.sessionUpdate.phase);
            await this.#applyStep(step);
        });
        await this.#ensureAlarm();
    }
    // -------------------------------------------------------------------------
    // Socket lifecycle.
    // -------------------------------------------------------------------------
    async #openSocket(urlOverride) {
        const handlers = {
            onMessage: (data) => this.#onSocketMessage(data),
            onClose: (code, reason) => this.#onSocketClose(code, reason),
            onError: (message) => this.#onSocketError(message),
        };
        const baseUrl = this.#gatewayBaseUrl();
        const socket = await this.#deps.transport.open({
            botToken: this.#config().token,
            gatewayBaseUrl: baseUrl,
            ...(urlOverride === undefined ? {} : { urlOverride }),
            handlers,
        });
        this.#socket = socket;
    }
    async #onSocketMessage(data) {
        const config = this.#configOrUndefined();
        if (config === undefined)
            return; // operator-disconnected; ignore late socket bytes.
        let frameInput;
        try {
            frameInput = JSON.parse(data);
        }
        catch {
            return; // accept-and-ignore unparseable bytes (the machine also guards this).
        }
        // FRAME DECODE stage: drive the pure machine over one gateway frame.
        await this.#tracer().enterSpan(SPAN_GATEWAY_FRAME, { [ATTR_PLATFORM]: PLATFORM }, async (span) => {
            const step = onFrame(this.#loadSession(), config, frameInput, {
                now: this.#deps.now(),
                jitter: this.#jitter(),
                frameEnv: { rawId: "", receivedAt: this.#isoNow() },
            });
            if (span.isTraced)
                span.setAttribute(ATTR_GATEWAY_PHASE, step.sessionUpdate.phase);
            await this.#applyStep(step);
        });
    }
    async #onSocketClose(code, reason) {
        this.#socket = undefined;
        if (this.#configOrUndefined() === undefined)
            return; // operator-disconnected.
        const step = onClose(this.#loadSession(), code, reason);
        await this.#applyStep(step);
    }
    async #onSocketError(message) {
        if (this.#configOrUndefined() === undefined)
            return; // operator-disconnected.
        // An errored socket is treated as a resumable abnormal close (4000): the
        // machine will reconnect+resume on the next alarm.
        if (this.#socket !== undefined) {
            const sock = this.#socket;
            this.#socket = undefined;
            sock.close(4000, `socket error: ${message}`);
        }
        const step = onClose(this.#loadSession(), 4000, `socket error: ${message}`);
        await this.#applyStep(step);
    }
    // -------------------------------------------------------------------------
    // Apply a machine step: persist session, send frames, ingest deliveries,
    // honor the close action.
    // -------------------------------------------------------------------------
    async #applyStep(step, rawFrameBody) {
        this.#persistSession(step.sessionUpdate);
        for (const frame of step.sendFrames) {
            this.#socket?.send(JSON.stringify(frame));
        }
        for (const ingest of step.rawDeliveries) {
            await this.#ingestDelivery(ingest, step.sessionUpdate, rawFrameBody);
        }
        if (step.closeAction !== undefined) {
            await this.#handleClose(step.closeAction);
        }
    }
    /**
     * Enqueue a raw gateway frame. The DO stays a thin socket/session actor; the
     * queue consumer owns raw persistence, delivery dedupe, journal, runtime, and
     * outbox. A RESUME replay may enqueue the same native key again; the consumer's
     * delivery gate collapses it.
     */
    async #ingestDelivery(ingest, state, rawFrameBody) {
        if (ingest.kind !== "event")
            return; // control/undecodable: nothing to deliver.
        const nativeKey = ingest.nativeKey;
        await this.#tracer().enterSpan(SPAN_GATEWAY_INGEST, { [ATTR_PLATFORM]: PLATFORM, [ATTR_NATIVE_KEY]: nativeKey }, (span) => this.#ingestDeliveryTraced(ingest, nativeKey, span, rawFrameBody));
        void state;
    }
    async #ingestDeliveryTraced(ingest, nativeKey, span, rawFrameBody) {
        const isoNow = this.#isoNow();
        const rawId = this.#rawIdFor(nativeKey);
        const account = gatewayAccountOf(ingest.envelope);
        const tenant = this.#config().tenant;
        if (span.isTraced) {
            span.setAttribute(ATTR_RAW_ID, rawId);
            span.setAttribute(ATTR_ACCOUNT, account);
            span.setAttribute(ATTR_TENANT, tenant);
        }
        const queueMessage = {
            messageId: gatewayFrameMessageId(rawId),
            kind: GATEWAY_FRAME_QUEUE_MESSAGE_KIND,
            payload: encodeGatewayFramePayload({
                rawId,
                nativeKey,
                tenant,
                account,
                receivedAt: isoNow,
                body: rawFrameBody ?? JSON.stringify(ingest.frame.raw),
            }),
            groupKey: `${PLATFORM}:${account}`,
            causedByRawId: rawId,
        };
        if (span.isTraced)
            span.setAttribute(ATTR_DUPLICATE, false);
        await this.#deps.queue.send(queueMessage);
    }
    async #handleClose(action) {
        const sock = this.#socket;
        this.#socket = undefined;
        if (sock !== undefined)
            sock.close(action.code, action.reason);
        if (action.terminal !== undefined) {
            this.#persistTerminal(action.terminal.message);
            return; // fatal: do not reconnect; the alarm will see phase=fatal and stop.
        }
        if (!action.reconnect)
            return; // clean stop.
        if (this.#configOrUndefined() === undefined)
            return; // operator-disconnected.
        // Reconnect: resume -> resume_gateway_url, else fresh IDENTIFY from base url.
        const state = this.#loadSession();
        const reconnected = onConnect(state, this.#config());
        this.#persistSession(reconnected.sessionUpdate);
        const target = action.resume ? action.resumeGatewayUrl ?? reconnected.sessionUpdate.resumeGatewayUrl : undefined;
        await this.#openSocket(target);
        await this.#ensureAlarm();
    }
    // -------------------------------------------------------------------------
    // Alarm scheduling.
    // -------------------------------------------------------------------------
    /**
     * Ensure the keep-alive alarm is armed. Fires at the next heartbeat (or, once an
     * interval is known, at most one interval out) so the DO never idle-evicts while
     * connected and satisfies Discord's op-1 cadence.
     */
    async #ensureAlarm() {
        const state = this.#loadSession();
        const now = this.#deps.now();
        const interval = state.heartbeatIntervalMs;
        // Before HELLO we do not know the interval; arm a short keep-alive so the next
        // alarm reconnects/heartbeats promptly.
        const fallback = now + 1000;
        const due = state.nextHeartbeatAt ?? fallback;
        const cap = interval === undefined ? fallback : now + interval;
        const at = Math.min(due <= now ? now + 1 : due, cap);
        await this.#setAlarm(at);
    }
    // -------------------------------------------------------------------------
    // Storage: config + session + processed-keys + terminal.
    // -------------------------------------------------------------------------
    #init() {
        if (this.#initialized)
            return;
        this.#sql.exec("CREATE TABLE IF NOT EXISTS gw_config (id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT, application_id TEXT, intents INTEGER, gateway_base_url TEXT, tenant TEXT, shard_id INTEGER, shard_count INTEGER)");
        this.#sql.exec("CREATE TABLE IF NOT EXISTS gw_session (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT)");
        this.#sql.exec("CREATE TABLE IF NOT EXISTS gw_terminal (id INTEGER PRIMARY KEY CHECK (id = 1), message TEXT)");
        this.#initialized = true;
    }
    #persistConfig(c) {
        const shard = c.shard ?? [0, 1];
        this.#sql.exec("DELETE FROM gw_terminal");
        this.#sql.exec("INSERT INTO gw_config (id, token, application_id, intents, gateway_base_url, tenant, shard_id, shard_count) VALUES (1, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET token=excluded.token, application_id=excluded.application_id, intents=excluded.intents, gateway_base_url=excluded.gateway_base_url, tenant=excluded.tenant, shard_id=excluded.shard_id, shard_count=excluded.shard_count", c.botToken, c.applicationId, c.intents ?? null, c.gatewayBaseUrl, c.tenant, shard[0], shard[1]);
    }
    #configOrUndefined() {
        const rows = this.#sql
            .exec("SELECT token, application_id, intents, gateway_base_url, tenant, shard_id, shard_count FROM gw_config WHERE id = 1")
            .toArray();
        if (rows.length === 0)
            return undefined;
        const r = rows[0];
        return {
            token: r.token,
            applicationId: r.application_id,
            tenant: r.tenant,
            shard: [r.shard_id, r.shard_count],
            ...(r.intents === null ? {} : { intents: r.intents }),
        };
    }
    #config() {
        const c = this.#configOrUndefined();
        if (c === undefined) {
            throw new Error("DiscordGatewayRunner: no config persisted; call connect() first");
        }
        return c;
    }
    #gatewayBaseUrl() {
        const rows = this.#sql.exec("SELECT gateway_base_url FROM gw_config WHERE id = 1").toArray();
        const r = rows[0];
        const url = r?.["gateway_base_url"];
        if (typeof url !== "string" || url.length === 0) {
            throw new Error("DiscordGatewayRunner: no gateway base url persisted");
        }
        return url;
    }
    #loadSession() {
        const rows = this.#sql.exec("SELECT state_json FROM gw_session WHERE id = 1").toArray();
        if (rows.length === 0)
            return initialSessionState();
        const json = rows[0]["state_json"];
        if (typeof json !== "string")
            return initialSessionState();
        try {
            return JSON.parse(json);
        }
        catch {
            return initialSessionState();
        }
    }
    #persistSession(state) {
        this.#sql.exec("INSERT INTO gw_session (id, state_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json", JSON.stringify(state));
    }
    #clearPersistedControlState() {
        this.#sql.exec("DELETE FROM gw_config");
        this.#sql.exec("DELETE FROM gw_session");
        this.#sql.exec("DELETE FROM gw_terminal");
    }
    #persistTerminal(message) {
        this.#sql.exec("INSERT INTO gw_terminal (id, message) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET message=excluded.message", message);
    }
    #loadTerminal() {
        const rows = this.#sql.exec("SELECT message FROM gw_terminal WHERE id = 1").toArray();
        if (rows.length === 0)
            return undefined;
        const m = rows[0]["message"];
        return typeof m === "string" ? m : undefined;
    }
    // -------------------------------------------------------------------------
    // Small injected-default helpers.
    // -------------------------------------------------------------------------
    #tracer() {
        return this.#deps.tracer ?? NoopTracer;
    }
    #isoNow() {
        return this.#deps.isoNow ? this.#deps.isoNow() : new Date(this.#deps.now()).toISOString();
    }
    #jitter() {
        return this.#deps.jitter ? this.#deps.jitter() : 0;
    }
    #rawIdFor(nativeKey) {
        return this.#deps.rawIdFor ? this.#deps.rawIdFor(nativeKey) : `raw_discord_gw_${djb2(nativeKey)}`;
    }
}
// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------
/**
 * The delivery-gate account for a gateway event: the guild id when guild-scoped,
 * else the application id (DM-scoped). Mirrors gatewayScopeOf's scope choice so
 * the work row is partitioned per guild/bot like webhooks are per workspace.
 */
function gatewayAccountOf(envelope) {
    return envelope.guildId ?? envelope.applicationId;
}
/** Deterministic, dependency-free string hash for stable rawIds. */
function djb2(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}
//# sourceMappingURL=discord-gateway-do.js.map