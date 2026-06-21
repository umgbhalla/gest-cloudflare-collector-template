// @gest/infra / bindings / EffectHttpTransport (Worker fetch)
//
// The ONE network boundary for outbound effect dispatch. Wraps the platform-built
// EffectHttpRequest onto the runtime `fetch` and returns the raw response bytes +
// a stable body hash. It performs NO interpretation of the response — the
// platform codec (e.g. Slack's parseEffectResponse) owns that, because HTTP
// status alone is not the effect result (Slack returns 200 + ok:false).
//
// `fetch` is injected so the dispatcher is fully testable offline against a fake
// transport with no real network. The default uses the global `fetch` the Worker
// isolate provides. Header order/duplicates are preserved as a list of pairs.
import {} from "@gest/ingest-core";
import { hashBytes } from "@gest/ingest-core";
/** Build an EffectHttpTransport from an injected fetch + clock. */
export class EffectHttpFetchTransport {
    #fetch;
    #clock;
    constructor(fetchImpl, clock) {
        this.#fetch = fetchImpl;
        this.#clock = clock;
    }
    async send(request) {
        const headers = request.headers.map((h) => [h.name, h.value]);
        const init = {
            method: request.method,
            headers,
            ...(request.body === undefined ? {} : { body: request.body }),
        };
        const res = await this.#fetch(request.url, init);
        const buf = await res.arrayBuffer();
        const body = new Uint8Array(buf);
        const responseHeaders = [];
        res.headers.forEach((value, key) => {
            responseHeaders.push({ name: key, value });
        });
        return {
            status: res.status,
            headers: responseHeaders,
            body,
            bodyHash: hashBytes(body),
            receivedAt: this.#clock(),
        };
    }
}
//# sourceMappingURL=transport.js.map