/** A JSON-serializable value. Structural, not protocol-specific. */
export type Json = null | boolean | number | string | readonly Json[] | {
    readonly [key: string]: Json;
};
/** A JSON object value. */
export type JsonObject = {
    readonly [key: string]: Json;
};
/**
 * Canonical JSON encoding with object keys emitted in sorted order, so two
 * structurally-equal values (queue payloads, outbox request bodies, render
 * inputs, runtime decisions) always serialize to the same string and therefore
 * hash identically regardless of key insertion order. This is the ONE canonical
 * serializer; packages derive their stable hashes from it (each adds its own
 * algo prefix or version mix). Determinism only — no clock, randomness, or I/O.
 */
export declare function canonicalJson(value: Json): string;
/** True when the value is a plain JSON object (not null, not array). */
export declare function isJsonObject(value: unknown): value is JsonObject;
/** True when the value is a finite JSON-safe number. */
export declare function isJsonNumber(value: unknown): value is number;
/** Non-empty string, or undefined when absent/empty/not a string. */
export declare function strOf(value: Json | undefined): string | undefined;
/** Finite number, or undefined when absent/not a finite number. */
export declare function numOf(value: Json | undefined): number | undefined;
/** Boolean, or undefined when absent/not a boolean. */
export declare function boolOf(value: Json | undefined): boolean | undefined;
/** Nested JSON object, or undefined when absent/not a plain object. */
export declare function objOf(value: Json | undefined): JsonObject | undefined;
/**
 * Identity reader: a numeric or non-empty-string id, coerced to string. Platform
 * ids arrive as either a number (Telegram chat/user ids) or a string; this yields
 * one canonical string id, or undefined when absent/empty.
 */
export declare function idOf(value: Json | undefined): string | undefined;
/**
 * Spread helper that omits a key entirely when the value is undefined, so a
 * source object never carries `key: undefined`. Replaces the verbose
 * `...(x === undefined ? {} : { x })` idiom.
 */
export declare function pick<K extends string, V>(key: K, value: V | undefined): {
    readonly [P in K]?: V;
};
/**
 * Structurally validate that an already-parsed value contains only JSON-safe
 * leaves (no functions, undefined, symbols, non-finite numbers, or cycles up to
 * the given depth). Returns the value typed as `Json`, or `undefined` if it is
 * not a valid JSON value. This does not parse strings; callers parse first.
 */
export declare function asJson(value: unknown, maxDepth?: number): Json | undefined;
//# sourceMappingURL=json.d.ts.map