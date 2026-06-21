import { type Decoder } from "./decode.js";
import type { RetryMeta, SignatureKind, SignatureResult } from "./raw.js";
/**
 * Build a `verified` SignatureResult for a platform's signing scheme. The ONE
 * place every adapter constructs a success verdict, so the keyId-omit and extra
 * audit-field handling stay identical across slack/discord/telegram/github.
 */
export declare function verifiedSignature(scheme: string, extra?: {
    readonly keyId?: string | undefined;
    readonly candidatesPresented?: number | undefined;
    readonly candidateMatched?: number | undefined;
}): SignatureResult;
/**
 * Build a non-verified (failure) SignatureResult. The ONE place every adapter
 * constructs a reject verdict, so the {kind, scheme, reason, keyId} shape and
 * the keyId-omit rule stay identical across adapters.
 */
export declare function failedSignature(kind: Exclude<SignatureKind, "verified">, scheme: string, reason: string, keyId?: string): SignatureResult;
/**
 * The verdict a platform adapter returns from verifying an inbound delivery: the
 * recorded {@link SignatureResult}, the captured native {@link RetryMeta}, and a
 * `verified` convenience flag (true only when `signature.kind === "verified"`).
 * Every signed platform's per-adapter `*Verification` shape is exactly this; an
 * adapter aliases it (`type SlackVerification = VerifyVerdict`) rather than
 * re-declaring the triple. The PLATFORM still owns its scheme constant, header
 * names, crypto, and which reject `kind`s it can produce — this container hoists
 * only the result shape.
 */
export interface VerifyVerdict {
    readonly signature: SignatureResult;
    readonly retry: RetryMeta;
    /** True only when kind === "verified". Convenience for call sites. */
    readonly verified: boolean;
}
/**
 * Build a non-verified {@link VerifyVerdict} for a platform's signing scheme. The
 * ONE place every adapter wraps a {@link failedSignature} into its verdict triple,
 * so `{verified:false}` and the keyId-omit rule stay identical across adapters.
 * The platform passes its own local scheme constant + the captured retry meta.
 */
export declare function rejectVerdict(scheme: string, retry: RetryMeta, kind: Exclude<SignatureKind, "verified">, reason: string, keyId?: string): VerifyVerdict;
/**
 * Constant-time string compare. Returns false fast on length mismatch (length is
 * not secret), then compares bytes in constant time. Use this EVERYWHERE a secret
 * or a recomputed MAC is compared, never `===`.
 */
export declare function timingSafeEqual(a: string, b: string): boolean;
/**
 * Split a signature header into candidate signatures. Svix-style rotation packs
 * several signatures SPACE-separated in one header so a key rotation overlaps
 * (`v1,<sigA> v1,<sigB>`), where each candidate itself may carry a `version,`
 * prefix. We split on whitespace only (the comma is part of the candidate), trim,
 * and drop empties. A single-signature header yields a one-element list.
 * `transform` lets a caller strip a per-candidate prefix (e.g. Svix `v1,`).
 */
export declare function splitSignatureCandidates(header: string, transform?: (candidate: string) => string): readonly string[];
/** Outcome of a multi-candidate verification. */
export interface CandidateVerification {
    /** True when at least one candidate matched the expected signature. */
    readonly verified: boolean;
    /** Number of candidates tested. */
    readonly candidatesPresented: number;
    /** 0-based index of the first matching candidate, when verified. */
    readonly candidateMatched?: number;
}
/**
 * Verify a presented set of candidate signatures against an expected signature
 * (or set of acceptable expected signatures, for overlapping secret rotation).
 * Accepts if ANY candidate matches ANY expected value, compared in constant time.
 * Records the matching candidate index for rotation audit. This is the generalized
 * Svix multi-signature rotation contract: a single-candidate, single-expected call
 * is just the common case.
 *
 * Note: to keep the compare constant-time per pair, we test every candidate even
 * after a match is found (no early return), so timing does not reveal position.
 */
export declare function verifyCandidates(candidates: readonly string[], expected: string | readonly string[]): CandidateVerification;
/**
 * Canonical inbound webhook outcome. The DECLARATION ORDER of this array IS the
 * canonical evaluation order a handler must follow (and the order `decideInbound`
 * enforces):
 *
 *   route(404) -> enabled(403) -> missing-secret(403)
 *   -> content-length cap(413, BEFORE body read) -> verify(401)
 *   -> rate-limit(429) -> parse(400) -> dedupe(200 on dup) -> 202 accepted
 *
 * Each outcome maps to a DISTINCT HTTP status. A provider/handler must not
 * collapse these to a generic 400. `missing-secret` is a fail-closed 403 raised at
 * HANDLER time when the secret is missing/empty (not just at config time).
 */
export declare const INBOUND_OUTCOMES: readonly ["not-found", "disabled", "missing-secret", "payload-too-large", "unauthorized", "rate-limited", "bad-request", "duplicate", "accepted"];
export type InboundOutcome = (typeof INBOUND_OUTCOMES)[number];
export declare const decodeInboundOutcome: Decoder<InboundOutcome>;
/** The HTTP status code each inbound outcome maps to. Distinct, never collapsed. */
export declare const INBOUND_STATUS: Readonly<Record<InboundOutcome, number>>;
/** Map an inbound outcome to its canonical HTTP status code. */
export declare function statusForOutcome(outcome: InboundOutcome): number;
/**
 * The signals a handler evaluates, in the canonical order, to reach an inbound
 * outcome. Provider adapters fill these from the request edge; the function
 * `decideInbound` sequences them so every provider gets the SAME order and the
 * SAME distinct status codes. The body is NOT read until the cap is cleared, so
 * `verified`/`parsed`/`duplicate` are evaluated lazily (functions), preserving the
 * "content-length cap BEFORE body read" rail.
 */
export interface InboundSignals {
    /** False when no route matched -> 404. */
    readonly routed: boolean;
    /** False when the route is disabled -> 403. */
    readonly enabled: boolean;
    /** The configured secret (or undefined). Empty/missing fails closed -> 403. */
    readonly secret: string | undefined;
    /** Declared Content-Length header value (raw), for the pre-read cap. */
    readonly headers: Readonly<Record<string, string>>;
    /** Max body bytes; a larger declared Content-Length -> 413 before read. */
    readonly maxBodyBytes: number;
    /** Signature verification verdict (read body, then verify) -> 401 on false. */
    readonly verify: () => boolean;
    /** Rate-limit check; true means limited -> 429. */
    readonly rateLimited?: () => boolean;
    /** Body parse success (only after verify) -> 400 on false. */
    readonly parse?: () => boolean;
    /** Dedupe check; true means duplicate -> 200 (ack so platform stops retrying). */
    readonly duplicate?: () => boolean;
}
/**
 * Decide the inbound outcome by evaluating the canonical sequence with distinct
 * codes. Order is fixed: route(404) -> enabled(403) -> missing-secret(403) ->
 * content-length cap(413, BEFORE body read) -> verify(401) -> rate-limit(429) ->
 * parse(400) -> dedupe(200 on dup) -> accepted(202). Each later check is a lazy
 * thunk so it never runs before its gate passes (verify never runs on an oversize
 * body; parse never runs on an unverified body — the verify-before-parse rule).
 */
export declare function decideInbound(signals: InboundSignals): InboundOutcome;
/**
 * Thrown by `readBodyCapped` when the body exceeds `maxBodyBytes`. Maps to the
 * `payload-too-large` (413) inbound outcome. Terminal: an oversize body is never
 * retried.
 */
export declare class PayloadTooLargeError extends Error {
    /** The cap that was exceeded, in bytes. */
    readonly maxBodyBytes: number;
    constructor(maxBodyBytes: number);
}
/** A minimal structural view of a body source the cap helper can read. */
export interface CappedBodySource {
    /** A web ReadableStream (preferred: lets us abort at the cap mid-stream). */
    readonly body?: ReadableStream<Uint8Array> | null;
    /** Fallback whole-body read (used when no stream is exposed). */
    arrayBuffer?(): Promise<ArrayBuffer>;
}
/**
 * Read a request/stream body, enforcing `maxBodyBytes` DURING the read and
 * aborting the instant the cumulative byte count exceeds the cap. This is the
 * core streaming guard that closes the "missing/chunked Content-Length bypasses
 * the 413 cap" hole: every adapter MUST acquire the body through this helper
 * instead of a bare `arrayBuffer()`, so the cap cannot be disabled by omitting
 * Content-Length or using Transfer-Encoding: chunked.
 *
 * When the source exposes a `ReadableStream` we read chunk-by-chunk, cancel the
 * reader, and throw `PayloadTooLargeError` as soon as the running total passes the
 * cap — never buffering an unbounded body. When only `arrayBuffer()` is available
 * we read it, then assert the resulting length as defense-in-depth (it cannot
 * abort early, but it still refuses an oversize body before the bytes flow on).
 */
export declare function readBodyCapped(source: CappedBodySource, maxBodyBytes: number): Promise<Uint8Array>;
/**
 * Content-length cap check, evaluated BEFORE the body is read. Returns the
 * `payload-too-large` outcome when a present, parseable Content-Length exceeds the
 * cap; otherwise undefined (proceed to read). A missing/garbage Content-Length is
 * NOT trusted to be small: this cheap header check rejects the obvious DoS case
 * early, but the cap is ALSO enforced during the read by `readBodyCapped`, which
 * every adapter routes its body acquisition through — so omitting Content-Length
 * (or using chunked transfer encoding) cannot disable the guard.
 */
export declare function contentLengthExceeds(headers: Readonly<Record<string, string>>, maxBytes: number): boolean;
/**
 * Fail-closed secret check at HANDLER time. Returns true when the secret is
 * missing or empty (or whitespace-only), meaning the handler must refuse with the
 * `missing-secret` (403) outcome rather than attempt verification. This is the
 * "fail closed on missing/empty secret at handler time, not just config time"
 * rail.
 */
export declare function isSecretMissing(secret: string | undefined | null): boolean;
/**
 * Loopback-only guard for an unauthenticated / INSECURE route. Returns true when
 * the bind/source host is a loopback address, false otherwise. A handler that
 * exposes an INSECURE (no-auth) route MUST refuse to serve it unless this returns
 * true, so an unauthenticated surface can never be bound to a public interface.
 */
export declare function isLoopbackHost(host: string): boolean;
/**
 * Optional CIDR source allowlist. Returns true when `ip` is inside any of the
 * given CIDR ranges (IPv4 only; an empty allowlist means "no restriction" and
 * returns true). Platform webhooks that publish source ranges (e.g. MS Graph) can
 * use this; it is OPTIONAL and lives at the provider/handler edge, never in the
 * dedupe/journal core.
 */
export declare function ipInAllowlist(ip: string, cidrs: readonly string[]): boolean;
//# sourceMappingURL=verify.d.ts.map