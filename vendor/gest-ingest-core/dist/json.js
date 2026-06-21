// @gest/ingest-core / json
//
// Provider-neutral JSON value model. This is the only JSON shape allowed to
// cross a package boundary. Untyped protocol JSON (Slack/Discord/Telegram/GitHub
// envelopes, provider request bodies) must be decoded into typed records before
// it leaves the package that received it. `Json` exists for the few fields the
// core must store opaquely (e.g. an outbox request body the runtime composed, or
// a captured provider metadata bag) without claiming to understand them.
/**
 * Canonical JSON encoding with object keys emitted in sorted order, so two
 * structurally-equal values (queue payloads, outbox request bodies, render
 * inputs, runtime decisions) always serialize to the same string and therefore
 * hash identically regardless of key insertion order. This is the ONE canonical
 * serializer; packages derive their stable hashes from it (each adds its own
 * algo prefix or version mix). Determinism only — no clock, randomness, or I/O.
 */
export function canonicalJson(value) {
    return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map(sortKeys);
    const out = {};
    for (const key of Object.keys(value).sort()) {
        const v = value[key];
        if (v !== undefined)
            out[key] = sortKeys(v);
    }
    return out;
}
/** True when the value is a plain JSON object (not null, not array). */
export function isJsonObject(value) {
    return (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value));
}
/** True when the value is a finite JSON-safe number. */
export function isJsonNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
// ---------------------------------------------------------------------------
// Canonical optional-field readers for opaque JSON
//
// Every platform adapter reads optional typed fields out of an already-parsed
// JSON object (the platform's own envelope). These are the ONE canonical set so
// each package stops reinventing `strOf`/`numOf`/`idOf`/`pick`. They never throw:
// a missing/wrong-typed field reads as `undefined`, matching the
// optional-by-default shape of platform metadata.
// ---------------------------------------------------------------------------
/** Non-empty string, or undefined when absent/empty/not a string. */
export function strOf(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
/** Finite number, or undefined when absent/not a finite number. */
export function numOf(value) {
    return isJsonNumber(value) ? value : undefined;
}
/** Boolean, or undefined when absent/not a boolean. */
export function boolOf(value) {
    return typeof value === "boolean" ? value : undefined;
}
/** Nested JSON object, or undefined when absent/not a plain object. */
export function objOf(value) {
    return value !== undefined && isJsonObject(value) ? value : undefined;
}
/**
 * Identity reader: a numeric or non-empty-string id, coerced to string. Platform
 * ids arrive as either a number (Telegram chat/user ids) or a string; this yields
 * one canonical string id, or undefined when absent/empty.
 */
export function idOf(value) {
    return isJsonNumber(value) ? String(value) : strOf(value);
}
/**
 * Spread helper that omits a key entirely when the value is undefined, so a
 * source object never carries `key: undefined`. Replaces the verbose
 * `...(x === undefined ? {} : { x })` idiom.
 */
export function pick(key, value) {
    return value === undefined
        ? {}
        : { [key]: value };
}
/**
 * Structurally validate that an already-parsed value contains only JSON-safe
 * leaves (no functions, undefined, symbols, non-finite numbers, or cycles up to
 * the given depth). Returns the value typed as `Json`, or `undefined` if it is
 * not a valid JSON value. This does not parse strings; callers parse first.
 */
export function asJson(value, maxDepth = 64) {
    return walk(value, maxDepth);
}
function walk(value, depth) {
    if (depth < 0)
        return undefined;
    if (value === null)
        return null;
    const t = typeof value;
    if (t === "boolean" || t === "string")
        return value;
    if (t === "number")
        return Number.isFinite(value) ? value : undefined;
    if (Array.isArray(value)) {
        const out = [];
        for (const item of value) {
            const child = walk(item, depth - 1);
            if (child === undefined)
                return undefined;
            out.push(child);
        }
        return out;
    }
    if (t === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (v === undefined)
                continue;
            const child = walk(v, depth - 1);
            if (child === undefined)
                return undefined;
            out[k] = child;
        }
        return out;
    }
    return undefined;
}
//# sourceMappingURL=json.js.map