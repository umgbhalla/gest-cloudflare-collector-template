/** A single field-level decode problem. */
export interface DecodeIssue {
    /** Dotted path to the offending field, e.g. "signature.kind". */
    readonly path: string;
    /** Human-readable reason. */
    readonly message: string;
}
/** Successful decode. */
export interface DecodeOk<T> {
    readonly ok: true;
    readonly value: T;
}
/** Failed decode. Carries every issue found at the top level it was checked. */
export interface DecodeFailure {
    readonly ok: false;
    readonly issues: readonly DecodeIssue[];
}
/** Result of running a decoder. */
export type DecodeResult<T> = DecodeOk<T> | DecodeFailure;
/** A decoder is a pure function from unknown input to a DecodeResult. */
export type Decoder<T> = (input: unknown, path?: string) => DecodeResult<T>;
/**
 * The outcome of a platform normalizer that produced a value. Mirrors DecodeOk
 * exactly; named distinctly so a normalizer's signature reads as a normalize
 * result, not a raw field decode.
 */
export type NormalizeOk<T> = DecodeOk<T>;
/**
 * Result of running a platform normalizer over an ALREADY-VERIFIED, supported
 * input: either the normalized value (`ok`) or a structured DecodeFailure when
 * the signed payload is malformed (e.g. a garbage/out-of-range timestamp). It is
 * the SAME two-armed shape as DecodeResult and shares DecodeFailure/DecodeIssue/
 * orThrow — so a malformed-but-signed event is a graceful, inspectable outcome,
 * never a thrown 500 and never a silent vanish.
 *
 * The DISTINCT "this event type is genuinely unsupported (not an error)" outcome
 * is expressed by the normalizer returning `undefined` OUTSIDE this union, so the
 * caller can keep "unsupported -> record raw + dedupe, no event" separate from
 * "malformed -> DecodeFailure". A normalizer's full return type is therefore
 * `NormalizeResult<T> | undefined`.
 */
export type NormalizeResult<T> = NormalizeOk<T> | DecodeFailure;
export declare function ok<T>(value: T): DecodeOk<T>;
/**
 * Collapse a normalizer's three-way result to "the event, or none". Used on the
 * ack path, where a malformed-but-signed payload (DecodeFailure) is handled
 * exactly like a genuinely-unsupported event (`undefined`): the raw is already
 * durable, so the fetch handler simply records raw + dedupe and emits no event,
 * never a 500. The DISTINCT failure handling (journal-as-undecodable + span)
 * lives on the consumer seam, which inspects the DecodeFailure directly.
 */
export declare function normalizedEventOf<T>(result: NormalizeResult<T> | undefined): T | undefined;
export declare const MIN_OCCURRED_EPOCH_SECONDS = 0;
export declare const MAX_OCCURRED_EPOCH_SECONDS = 4102444800;
/**
 * Validate a native epoch-seconds occurrence time into an ISO timestamp.
 * A non-finite or out-of-supported-range epoch is a malformed-but-signed payload:
 * it yields a DecodeFailure at `path`, NOT a silently dropped occurredAt and NOT a
 * thrown RangeError. `undefined` input means "no occurredAt" -> ok(undefined).
 */
export declare function occurredAtFromEpochSeconds(epoch: number | undefined, path: string): NormalizeResult<string | undefined>;
/**
 * Validate a native ISO-8601 occurrence time string. An unparseable or
 * out-of-supported-range timestamp yields a DecodeFailure at `path`; `undefined`
 * input means "no occurredAt" -> ok(undefined). The accepted value is the input
 * string itself (already ISO), so a valid ts is preserved verbatim.
 */
export declare function occurredAtFromIso(iso: string | undefined, path: string): NormalizeResult<string | undefined>;
export declare function fail(path: string, message: string): DecodeFailure;
export declare function failMany(issues: readonly DecodeIssue[]): DecodeFailure;
/**
 * Parse already-verified/trusted raw HTTP bytes into JSON, then run a decoder.
 * The ONE place the JSON.parse-then-decode-after-verify idiom lives, so every
 * platform envelope (slack/discord/telegram/github) shares the same parse-fail
 * behavior. This NEVER parses before verification: callers verify the signature
 * first and only hand already-trusted bytes here (a gest hard rule).
 */
export declare function decodeJsonBody<T>(rawBody: Uint8Array, decoder: Decoder<T>): DecodeResult<T>;
/** Decode a non-empty string. */
export declare const decodeString: Decoder<string>;
/** Decode a non-empty string (rejects ""). */
export declare const decodeNonEmptyString: Decoder<string>;
/** Decode a finite number. */
export declare const decodeNumber: Decoder<number>;
/** Decode a non-negative integer (e.g. attempt counts, retry counts). */
export declare const decodeNonNegativeInt: Decoder<number>;
/** Decode a boolean. */
export declare const decodeBoolean: Decoder<boolean>;
/** Decode an ISO-8601 timestamp string and confirm it parses to a real date. */
export declare const decodeIsoTimestamp: Decoder<string>;
/** Build a decoder that only accepts one of the given literal string values. */
export declare function decodeEnum<const T extends readonly string[]>(values: T): Decoder<T[number]>;
/** Decode an array where every element satisfies the element decoder. */
export declare function decodeArray<T>(element: Decoder<T>): Decoder<readonly T[]>;
/**
 * Decode a readonly array of non-empty strings with at least one element. Shared
 * by the runtime/outbox `rateKeys` decoders so the "at least one rate key" rule
 * lives in one place. The empty-array message is `rateKeys`-specific because that
 * is the only current caller; widen the message if a second use-shape appears.
 */
export declare const decodeNonEmptyStringArray: Decoder<readonly string[]>;
/**
 * Decode a tagged union dispatched on a discriminant key. `cases` maps each known
 * tag value to the decoder for that variant; an absent/unknown tag yields a
 * DecodeFailure at `<path>.<kindKey>` listing the known tags (the SAME issue path
 * and unknown-tag behavior the hand-written switch decoders produced). The input
 * must be a plain object; an array/null/non-object fails at `path`.
 */
export declare function decodeTagged<T>(kindKey: string, cases: Readonly<Record<string, Decoder<T>>>, objectMessage: string): Decoder<T>;
/** A field spec: a decoder plus whether the key may be absent. */
export interface FieldSpec<T> {
    readonly decoder: Decoder<T>;
    readonly optional?: boolean;
}
export declare function field<T>(decoder: Decoder<T>): FieldSpec<T>;
export declare function optionalField<T>(decoder: Decoder<T>): FieldSpec<T>;
type ShapeOf<S> = {
    [K in keyof S as S[K] extends FieldSpec<unknown> & {
        optional: true;
    } ? never : K]: S[K] extends FieldSpec<infer T> ? T : never;
} & {
    [K in keyof S as S[K] extends FieldSpec<unknown> & {
        optional: true;
    } ? K : never]?: S[K] extends FieldSpec<infer T> ? T : never;
};
/**
 * Decode a plain object against a fixed shape of field specs. Unknown extra keys
 * are ignored (forward-compatible). Missing required keys and bad values are
 * collected into issues so a fixture can assert all problems at once.
 */
export declare function decodeObject<S extends Record<string, FieldSpec<unknown>>>(shape: S): Decoder<ShapeOf<S>>;
/** Decode a record/map of string keys to a uniform value decoder. */
export declare function decodeRecord<T>(value: Decoder<T>): Decoder<Readonly<Record<string, T>>>;
export {};
//# sourceMappingURL=decode.d.ts.map