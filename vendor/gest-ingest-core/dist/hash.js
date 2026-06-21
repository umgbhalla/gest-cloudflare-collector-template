// @gest/ingest-core / deterministic hash
//
// The ONE algo-prefixed stable hash every package derives durability keys from
// (outbox requestHash, dedupe keys, replay outputHash). Built on canonicalJson
// (the ONE serializer) so the same logical JSON value hashes identically across
// process runs and across in-memory/filesystem stores. The "sha256:" prefix is
// recorded for audit honesty. Pure: no clock, no randomness, no I/O.
import { createHash } from "node:crypto";
import { canonicalJson } from "./json.js";
/** Stable hash of exact bytes, prefixed with the algorithm for audit honesty. */
export function hashBytes(bytes) {
    return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}
/** Stable hash of a UTF-8 string body. */
export function hashString(text) {
    return hashBytes(new TextEncoder().encode(text));
}
/** Stable hash of a JSON value via its canonical sorted-key encoding. */
export function hashJson(value) {
    return hashString(canonicalJson(value));
}
//# sourceMappingURL=hash.js.map