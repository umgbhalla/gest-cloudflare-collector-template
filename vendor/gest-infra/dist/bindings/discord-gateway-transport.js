// @gest/infra / bindings / Discord gateway transport (Workers fetch-Upgrade)
//
// The production GatewayTransport: opens the OUTBOUND Discord gateway WebSocket
// from a Cloudflare Worker / Durable Object. This is the ONLY place the real
// network is touched; the DO logic (discord-gateway-do.ts) and the protocol
// (@gest/ingest-discord) never see it. The unit test passes a fake transport.
//
// THE 401-NOT-101 WORKAROUND (discord-api-docs #6145): opening an outbound WS to
// Discord from Workers with `new WebSocket(url)` historically fails because the
// platform returns 401 instead of the 101 Switching Protocols. The documented
// fix that works from Workers is to use an HTTPS `fetch(url, { headers: {
// Upgrade: "websocket" } })` and read `response.webSocket` off the 101
// response, then call `.accept()`. Discord advertises a `wss://...` Gateway URL,
// but Cloudflare's Fetch API does not load `wss:` URLs; the HTTP upgrade fetch
// must use the matching `https://...` URL. Reference mechanics:
// dcartertwo/discord-gateway-cloudflare-do. We feed GEST's pipeline (the DO's
// handlers) — never a generic /webhook POST.
//
// v1 wire (docs/research/discord-full-spec.md §4): json encoding, NO compression.
// The ws url is `${base}?v=10&encoding=json` (RESUME targets resume_gateway_url).
//
// Declared STRUCTURALLY over a tiny Fetch+WebSocket surface so it typechecks
// offline with no @cloudflare/workers-types; a deployed isolate satisfies it.
/**
 * The production transport. Resolves the ws url via `GET {base}/gateway/bot`
 * (unless a RESUME `urlOverride` is given), then upgrades to a WebSocket with the
 * 401 workaround and wires the DO's handlers onto it.
 */
export class DiscordGatewayTransport {
    #fetch;
    #version;
    constructor(opts) {
        this.#fetch = opts.fetch;
        this.#version = opts.apiVersion ?? 10;
    }
    async open(input) {
        const wsBase = input.urlOverride ?? (await this.#resolveGatewayUrl(input.gatewayBaseUrl, input.botToken));
        // v1: json encoding, no compression.
        const sep = wsBase.includes("?") ? "&" : "?";
        const wsUrl = `${wsBase}${sep}v=${this.#version}&encoding=json`;
        // The 401-not-101 workaround: ask for an Upgrade via HTTPS fetch, read response.webSocket.
        const res = await this.#fetch(upgradeFetchUrl(wsUrl), { headers: { Upgrade: "websocket" } });
        const ws = res.webSocket;
        if (res.status !== 101 || ws == null) {
            throw new Error(`gateway upgrade failed: status ${res.status} (expected 101 + webSocket)`);
        }
        ws.accept();
        const handlers = input.handlers;
        ws.addEventListener("message", (ev) => {
            const data = typeof ev.data === "string" ? ev.data : decodeData(ev.data);
            if (data !== undefined)
                void handlers.onMessage(data);
        });
        ws.addEventListener("close", (ev) => {
            void handlers.onClose(ev.code ?? 1006, ev.reason ?? "");
        });
        ws.addEventListener("error", (ev) => {
            void handlers.onError(ev.message ?? "websocket error");
        });
        return {
            send: (data) => ws.send(data),
            close: (code, reason) => ws.close(code, reason),
        };
    }
    /** `GET {base}/gateway/bot` -> `{ url }` used verbatim as the WS base. */
    async #resolveGatewayUrl(gatewayBaseUrl, botToken) {
        const base = gatewayBaseUrl.replace(/\/+$/, "");
        const res = await this.#fetch(`${base}/gateway/bot`, {
            method: "GET",
            headers: { Authorization: `Bot ${botToken}` },
        });
        if (res.status !== 200) {
            throw new Error(`GET /gateway/bot failed: status ${res.status}`);
        }
        const body = (await res.json());
        if (typeof body.url !== "string" || body.url.length === 0) {
            throw new Error("GET /gateway/bot returned no url");
        }
        return body.url;
    }
}
function decodeData(data) {
    if (typeof data === "string")
        return data;
    if (data instanceof ArrayBuffer)
        return new TextDecoder().decode(data);
    if (ArrayBuffer.isView(data)) {
        return new TextDecoder().decode(data);
    }
    return undefined;
}
function upgradeFetchUrl(wsUrl) {
    if (wsUrl.startsWith("wss://"))
        return `https://${wsUrl.slice("wss://".length)}`;
    if (wsUrl.startsWith("ws://"))
        return `http://${wsUrl.slice("ws://".length)}`;
    return wsUrl;
}
//# sourceMappingURL=discord-gateway-transport.js.map