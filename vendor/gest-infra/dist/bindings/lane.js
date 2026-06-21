// @gest/infra / bindings / CloudflareLane
//
// Concrete CloudflareLane that routes acquire/release to the lane Durable Object
// (one DO instance per lane subject, via idFromName(subject)). The DO owns the
// fencing token + expiry; this binding is a thin RPC shim that speaks the lane
// JSON protocol over the DO stub's fetch. The neutral LaneLease the core defines
// is the wire shape both ends agree on.
import { decodeLaneLease, orThrow } from "@gest/ingest-core";
export class DurableObjectLane {
    #ns;
    constructor(ns) {
        this.#ns = ns;
    }
    async acquire(subject, holder, ttlSeconds) {
        const stub = this.#ns.get(this.#ns.idFromName(subject));
        const req = { op: "acquire", subject, holder, ttlSeconds };
        const res = await stub.fetch("https://lane/acquire", {
            method: "POST",
            body: JSON.stringify(req),
        });
        return orThrow("lane lease (DO acquire)", decodeLaneLease(await res.json()));
    }
    async release(subject, holder, fencingToken) {
        const stub = this.#ns.get(this.#ns.idFromName(subject));
        const req = { op: "release", subject, holder, fencingToken };
        const res = await stub.fetch("https://lane/release", {
            method: "POST",
            body: JSON.stringify(req),
        });
        const body = (await res.json());
        return body.released === true;
    }
}
//# sourceMappingURL=lane.js.map