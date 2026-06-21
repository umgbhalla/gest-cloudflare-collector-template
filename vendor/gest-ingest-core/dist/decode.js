// @gest/ingest-core / decode
//
// Tiny runtime decoder toolkit. Decoders turn `unknown` (already JSON-parsed by
// the caller) into typed core boundary records, or into a structured failure.
// No exceptions for expected-bad input: malformed records yield `DecodeFailure`
// with a path and reason so callers and fixtures can assert precisely.
//
// This is intentionally small and dependency-free. It is NOT a schema framework;
// it is just enough to guarantee that no untyped record crosses a boundary.
import { isJsonObject } from "./json.js";
export function ok(value) {
    return { ok: true, value };
}
/**
 * Collapse a normalizer's three-way result to "the event, or none". Used on the
 * ack path, where a malformed-but-signed payload (DecodeFailure) is handled
 * exactly like a genuinely-unsupported event (`undefined`): the raw is already
 * durable, so the fetch handler simply records raw + dedupe and emits no event,
 * never a 500. The DISTINCT failure handling (journal-as-undecodable + span)
 * lives on the consumer seam, which inspects the DecodeFailure directly.
 */
export function normalizedEventOf(result) {
    return result !== undefined && result.ok ? result.value : undefined;
}
// Sane epoch-seconds bounds for a platform occurrence timestamp. A hostile or
// garbage native ts (real-CF chaos saw "occurred_at = 7413-07-21") must not
// journal a far-future or pre-epoch occurredAt. Bounds are fixed constants so
// replay stays deterministic (no wall clock). This is the ONE place the
// malformed/out-of-range occurredAt policy lives; every platform normalizer
// routes its native timestamp through occurredAtFromEpochSeconds /
// occurredAtFromIso so the "signed-but-garbage ts -> DecodeFailure" outcome is
// identical across slack/discord/github/telegram.
//
// The window is deliberately wide: the goal is to catch the genuinely-broken
// (non-finite, pre-Unix-epoch/negative, or absurd far-future like year 7413 that
// poisons the journal), NOT to second-guess merely old timestamps. A negative
// epoch or one past the year-2100 ceiling is malformed.
export const MIN_OCCURRED_EPOCH_SECONDS = 0; // 1970-01-01T00:00:00Z (reject pre-epoch/negative)
export const MAX_OCCURRED_EPOCH_SECONDS = 4_102_444_800; // 2100-01-01T00:00:00Z
/**
 * The shared epoch-range gate behind both occurredAt entry points. Returns a
 * DecodeFailure at `path` when `epoch` is outside the supported window, else
 * undefined (in range). The two public entry points (epoch-seconds / ISO) keep
 * their own parse + accepted-value handling; only the identical bounds check is
 * shared here so the "out of supported range" policy lives in ONE place.
 */
function boundedOccurredAt(epoch, path) {
    if (epoch < MIN_OCCURRED_EPOCH_SECONDS || epoch > MAX_OCCURRED_EPOCH_SECONDS) {
        return fail(path, `occurrence epoch ${epoch}s out of supported range [${MIN_OCCURRED_EPOCH_SECONDS}, ${MAX_OCCURRED_EPOCH_SECONDS}]`);
    }
    return undefined;
}
/**
 * Validate a native epoch-seconds occurrence time into an ISO timestamp.
 * A non-finite or out-of-supported-range epoch is a malformed-but-signed payload:
 * it yields a DecodeFailure at `path`, NOT a silently dropped occurredAt and NOT a
 * thrown RangeError. `undefined` input means "no occurredAt" -> ok(undefined).
 */
export function occurredAtFromEpochSeconds(epoch, path) {
    if (epoch === undefined)
        return ok(undefined);
    if (!Number.isFinite(epoch)) {
        return fail(path, `malformed occurrence timestamp: ${JSON.stringify(epoch)}`);
    }
    const out = boundedOccurredAt(epoch, path);
    if (out !== undefined)
        return out;
    return ok(new Date(epoch * 1000).toISOString());
}
/**
 * Validate a native ISO-8601 occurrence time string. An unparseable or
 * out-of-supported-range timestamp yields a DecodeFailure at `path`; `undefined`
 * input means "no occurredAt" -> ok(undefined). The accepted value is the input
 * string itself (already ISO), so a valid ts is preserved verbatim.
 */
export function occurredAtFromIso(iso, path) {
    if (iso === undefined)
        return ok(undefined);
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) {
        return fail(path, `malformed ISO occurrence timestamp: ${JSON.stringify(iso)}`);
    }
    const out = boundedOccurredAt(ms / 1000, path);
    if (out !== undefined)
        return out;
    return ok(iso);
}
export function fail(path, message) {
    return { ok: false, issues: [{ path, message }] };
}
export function failMany(issues) {
    return { ok: false, issues };
}
/**
 * Parse already-verified/trusted raw HTTP bytes into JSON, then run a decoder.
 * The ONE place the JSON.parse-then-decode-after-verify idiom lives, so every
 * platform envelope (slack/discord/telegram/github) shares the same parse-fail
 * behavior. This NEVER parses before verification: callers verify the signature
 * first and only hand already-trusted bytes here (a gest hard rule).
 */
export function decodeJsonBody(rawBody, decoder) {
    let parsed;
    try {
        parsed = JSON.parse(new TextDecoder().decode(rawBody));
    }
    catch (err) {
        return fail("", `body is not valid JSON: ${err.message}`);
    }
    return decoder(parsed, "");
}
function join(path, key) {
    return path === "" ? key : `${path}.${key}`;
}
/** Decode a non-empty string. */
export const decodeString = (input, path = "") => typeof input === "string"
    ? ok(input)
    : fail(path, `expected string, got ${typeName(input)}`);
/** Decode a non-empty string (rejects ""). */
export const decodeNonEmptyString = (input, path = "") => {
    if (typeof input !== "string")
        return fail(path, `expected string, got ${typeName(input)}`);
    if (input.length === 0)
        return fail(path, "expected non-empty string");
    return ok(input);
};
/** Decode a finite number. */
export const decodeNumber = (input, path = "") => typeof input === "number" && Number.isFinite(input)
    ? ok(input)
    : fail(path, `expected finite number, got ${typeName(input)}`);
/** Decode a non-negative integer (e.g. attempt counts, retry counts). */
export const decodeNonNegativeInt = (input, path = "") => {
    if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
        return fail(path, `expected non-negative integer, got ${typeName(input)}`);
    }
    return ok(input);
};
/** Decode a boolean. */
export const decodeBoolean = (input, path = "") => typeof input === "boolean" ? ok(input) : fail(path, `expected boolean, got ${typeName(input)}`);
/** Decode an ISO-8601 timestamp string and confirm it parses to a real date. */
export const decodeIsoTimestamp = (input, path = "") => {
    if (typeof input !== "string")
        return fail(path, `expected ISO timestamp string, got ${typeName(input)}`);
    const ms = Date.parse(input);
    if (Number.isNaN(ms))
        return fail(path, `expected parseable ISO timestamp, got ${JSON.stringify(input)}`);
    return ok(input);
};
/** Build a decoder that only accepts one of the given literal string values. */
export function decodeEnum(values) {
    const set = new Set(values);
    return (input, path = "") => {
        if (typeof input !== "string" || !set.has(input)) {
            return fail(path, `expected one of [${values.join(", ")}], got ${typeName(input)}`);
        }
        return ok(input);
    };
}
/** Decode an array where every element satisfies the element decoder. */
export function decodeArray(element) {
    return (input, path = "") => {
        if (!Array.isArray(input))
            return fail(path, `expected array, got ${typeName(input)}`);
        const out = [];
        const issues = [];
        input.forEach((item, i) => {
            const r = element(item, `${path}[${i}]`);
            if (r.ok)
                out.push(r.value);
            else
                issues.push(...r.issues);
        });
        return issues.length ? failMany(issues) : ok(out);
    };
}
/**
 * Decode a readonly array of non-empty strings with at least one element. Shared
 * by the runtime/outbox `rateKeys` decoders so the "at least one rate key" rule
 * lives in one place. The empty-array message is `rateKeys`-specific because that
 * is the only current caller; widen the message if a second use-shape appears.
 */
export const decodeNonEmptyStringArray = (input, path = "") => {
    const r = decodeArray(decodeNonEmptyString)(input, path);
    if (!r.ok)
        return r;
    if (r.value.length === 0)
        return fail(path, "expected at least one rate key");
    return ok(r.value);
};
/**
 * Decode a tagged union dispatched on a discriminant key. `cases` maps each known
 * tag value to the decoder for that variant; an absent/unknown tag yields a
 * DecodeFailure at `<path>.<kindKey>` listing the known tags (the SAME issue path
 * and unknown-tag behavior the hand-written switch decoders produced). The input
 * must be a plain object; an array/null/non-object fails at `path`.
 */
export function decodeTagged(kindKey, cases, objectMessage) {
    return (input, path = "") => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
            return fail(path, objectMessage);
        }
        const tag = input[kindKey];
        const decoder = typeof tag === "string" ? cases[tag] : undefined;
        if (decoder === undefined) {
            return fail(join(path, kindKey), `expected one of [${Object.keys(cases).join(", ")}], got ${JSON.stringify(tag)}`);
        }
        return decoder(input, path);
    };
}
export function field(decoder) {
    return { decoder };
}
export function optionalField(decoder) {
    return { decoder, optional: true };
}
/**
 * Decode a plain object against a fixed shape of field specs. Unknown extra keys
 * are ignored (forward-compatible). Missing required keys and bad values are
 * collected into issues so a fixture can assert all problems at once.
 */
export function decodeObject(shape) {
    return (input, path = "") => {
        if (!isJsonObject(input))
            return fail(path, `expected object, got ${typeName(input)}`);
        const out = {};
        const issues = [];
        for (const key of Object.keys(shape)) {
            const spec = shape[key];
            const present = Object.prototype.hasOwnProperty.call(input, key);
            const raw = input[key];
            if (!present || raw === undefined) {
                if (!spec.optional)
                    issues.push({ path: join(path, key), message: "missing required field" });
                continue;
            }
            const r = spec.decoder(raw, join(path, key));
            if (r.ok)
                out[key] = r.value;
            else
                issues.push(...r.issues);
        }
        return issues.length ? failMany(issues) : ok(out);
    };
}
/** Decode a record/map of string keys to a uniform value decoder. */
export function decodeRecord(value) {
    return (input, path = "") => {
        if (!isJsonObject(input))
            return fail(path, `expected object, got ${typeName(input)}`);
        const out = {};
        const issues = [];
        for (const [k, v] of Object.entries(input)) {
            const r = value(v, join(path, k));
            if (r.ok)
                out[k] = r.value;
            else
                issues.push(...r.issues);
        }
        return issues.length ? failMany(issues) : ok(out);
    };
}
function typeName(value) {
    if (value === null)
        return "null";
    if (Array.isArray(value))
        return "array";
    return typeof value;
}
//# sourceMappingURL=decode.js.map