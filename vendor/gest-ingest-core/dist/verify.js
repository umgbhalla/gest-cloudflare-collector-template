// @gest/ingest-core / verification primitives
//
// Provider-neutral, platform-neutral verification helpers shared by every signed
// platform adapter. The core owns NO signing algorithm — it owns the boring,
// security-critical mechanics every adapter must get identically right:
//
//   - constant-time compare (timingSafeEqual) so a per-byte compare cannot leak.
//   - multi-candidate signature acceptance (Svix-style rotation): a header may
//     carry several space-separated candidate signatures; verification accepts if
//     ANY candidate matches, and records which one (candidateMatched) for audit.
//   - the canonical inbound STATUS-CODE contract a provider/handler enforces, in a
//     fixed order, with distinct codes (never collapsed to a generic 400).
//   - a content-length cap evaluated BEFORE the body is read (DoS guard, 413).
//   - a loopback-only guard for unauthenticated/INSECURE routes.
//   - an optional CIDR source allowlist.
//
// None of this parses JSON, knows a platform, or talks to a cloud. Platform
// adapters call `verifyCandidates` with their own recompute function; provider
// handlers call the status-code/guard helpers at the HTTP edge.
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { decodeEnum } from "./decode.js";
/**
 * Build a `verified` SignatureResult for a platform's signing scheme. The ONE
 * place every adapter constructs a success verdict, so the keyId-omit and extra
 * audit-field handling stay identical across slack/discord/telegram/github.
 */
export function verifiedSignature(scheme, extra) {
    return { kind: "verified", scheme, ...stripUndefined(extra) };
}
/**
 * Build a non-verified (failure) SignatureResult. The ONE place every adapter
 * constructs a reject verdict, so the {kind, scheme, reason, keyId} shape and
 * the keyId-omit rule stay identical across adapters.
 */
export function failedSignature(kind, scheme, reason, keyId) {
    return { kind, scheme, reason, ...(keyId === undefined ? {} : { keyId }) };
}
/**
 * Build a non-verified {@link VerifyVerdict} for a platform's signing scheme. The
 * ONE place every adapter wraps a {@link failedSignature} into its verdict triple,
 * so `{verified:false}` and the keyId-omit rule stay identical across adapters.
 * The platform passes its own local scheme constant + the captured retry meta.
 */
export function rejectVerdict(scheme, retry, kind, reason, keyId) {
    return { signature: failedSignature(kind, scheme, reason, keyId), retry, verified: false };
}
function stripUndefined(o) {
    const out = {};
    if (o !== undefined)
        for (const [k, v] of Object.entries(o))
            if (v !== undefined)
                out[k] = v;
    return out;
}
const encoder = new TextEncoder();
/**
 * Constant-time string compare. Returns false fast on length mismatch (length is
 * not secret), then compares bytes in constant time. Use this EVERYWHERE a secret
 * or a recomputed MAC is compared, never `===`.
 */
export function timingSafeEqual(a, b) {
    const ab = encoder.encode(a);
    const bb = encoder.encode(b);
    if (ab.length !== bb.length)
        return false;
    return nodeTimingSafeEqual(ab, bb);
}
/**
 * Split a signature header into candidate signatures. Svix-style rotation packs
 * several signatures SPACE-separated in one header so a key rotation overlaps
 * (`v1,<sigA> v1,<sigB>`), where each candidate itself may carry a `version,`
 * prefix. We split on whitespace only (the comma is part of the candidate), trim,
 * and drop empties. A single-signature header yields a one-element list.
 * `transform` lets a caller strip a per-candidate prefix (e.g. Svix `v1,`).
 */
export function splitSignatureCandidates(header, transform = (c) => c) {
    return header
        .split(/\s+/)
        .map((c) => transform(c.trim()))
        .filter((c) => c.length > 0);
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
export function verifyCandidates(candidates, expected) {
    const expecteds = typeof expected === "string" ? [expected] : expected;
    let matched = -1;
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c === undefined)
            continue;
        for (const e of expecteds) {
            if (timingSafeEqual(c, e) && matched < 0)
                matched = i;
        }
    }
    return matched >= 0
        ? { verified: true, candidatesPresented: candidates.length, candidateMatched: matched }
        : { verified: false, candidatesPresented: candidates.length };
}
// ---------------------------------------------------------------------------
// Inbound status-code contract
// ---------------------------------------------------------------------------
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
export const INBOUND_OUTCOMES = [
    "not-found",
    "disabled",
    "missing-secret",
    "payload-too-large",
    "unauthorized",
    "rate-limited",
    "bad-request",
    "duplicate",
    "accepted",
];
export const decodeInboundOutcome = decodeEnum(INBOUND_OUTCOMES);
/** The HTTP status code each inbound outcome maps to. Distinct, never collapsed. */
export const INBOUND_STATUS = {
    "not-found": 404,
    disabled: 403,
    "missing-secret": 403,
    "payload-too-large": 413,
    unauthorized: 401,
    "rate-limited": 429,
    "bad-request": 400,
    // A duplicate delivery is acknowledged so the platform stops retrying.
    duplicate: 200,
    accepted: 202,
};
/** Map an inbound outcome to its canonical HTTP status code. */
export function statusForOutcome(outcome) {
    return INBOUND_STATUS[outcome];
}
/**
 * Decide the inbound outcome by evaluating the canonical sequence with distinct
 * codes. Order is fixed: route(404) -> enabled(403) -> missing-secret(403) ->
 * content-length cap(413, BEFORE body read) -> verify(401) -> rate-limit(429) ->
 * parse(400) -> dedupe(200 on dup) -> accepted(202). Each later check is a lazy
 * thunk so it never runs before its gate passes (verify never runs on an oversize
 * body; parse never runs on an unverified body — the verify-before-parse rule).
 */
export function decideInbound(signals) {
    if (!signals.routed)
        return "not-found";
    if (!signals.enabled)
        return "disabled";
    if (isSecretMissing(signals.secret))
        return "missing-secret";
    if (contentLengthExceeds(signals.headers, signals.maxBodyBytes))
        return "payload-too-large";
    if (!signals.verify())
        return "unauthorized";
    if (signals.rateLimited?.() === true)
        return "rate-limited";
    if (signals.parse !== undefined && !signals.parse())
        return "bad-request";
    if (signals.duplicate?.() === true)
        return "duplicate";
    return "accepted";
}
/**
 * Thrown by `readBodyCapped` when the body exceeds `maxBodyBytes`. Maps to the
 * `payload-too-large` (413) inbound outcome. Terminal: an oversize body is never
 * retried.
 */
export class PayloadTooLargeError extends Error {
    /** The cap that was exceeded, in bytes. */
    maxBodyBytes;
    constructor(maxBodyBytes) {
        super(`request body exceeds maxBodyBytes=${maxBodyBytes}`);
        this.name = "PayloadTooLargeError";
        this.maxBodyBytes = maxBodyBytes;
    }
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
export async function readBodyCapped(source, maxBodyBytes) {
    if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 0) {
        throw new RangeError(`maxBodyBytes must be a non-negative integer, got ${String(maxBodyBytes)}`);
    }
    const stream = source.body;
    if (stream != null && typeof stream.getReader === "function") {
        const reader = stream.getReader();
        const chunks = [];
        let total = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                if (value === undefined)
                    continue;
                total += value.byteLength;
                if (total > maxBodyBytes) {
                    await reader.cancel();
                    throw new PayloadTooLargeError(maxBodyBytes);
                }
                chunks.push(value);
            }
        }
        finally {
            reader.releaseLock?.();
        }
        return concatChunks(chunks, total);
    }
    if (typeof source.arrayBuffer === "function") {
        const buf = new Uint8Array(await source.arrayBuffer());
        // Defense-in-depth: a non-streamable source still cannot exceed the cap.
        if (buf.byteLength > maxBodyBytes)
            throw new PayloadTooLargeError(maxBodyBytes);
        return buf;
    }
    throw new TypeError("body source exposes neither a ReadableStream nor arrayBuffer()");
}
function concatChunks(chunks, total) {
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}
/**
 * Content-length cap check, evaluated BEFORE the body is read. Returns the
 * `payload-too-large` outcome when a present, parseable Content-Length exceeds the
 * cap; otherwise undefined (proceed to read). A missing/garbage Content-Length is
 * NOT trusted to be small: this cheap header check rejects the obvious DoS case
 * early, but the cap is ALSO enforced during the read by `readBodyCapped`, which
 * every adapter routes its body acquisition through — so omitting Content-Length
 * (or using chunked transfer encoding) cannot disable the guard.
 */
export function contentLengthExceeds(headers, maxBytes) {
    const raw = headers["content-length"];
    if (raw === undefined)
        return false;
    if (!/^\d+$/.test(raw))
        return false;
    return Number(raw) > maxBytes;
}
/**
 * Fail-closed secret check at HANDLER time. Returns true when the secret is
 * missing or empty (or whitespace-only), meaning the handler must refuse with the
 * `missing-secret` (403) outcome rather than attempt verification. This is the
 * "fail closed on missing/empty secret at handler time, not just config time"
 * rail.
 */
export function isSecretMissing(secret) {
    return secret === undefined || secret === null || secret.trim().length === 0;
}
// ---------------------------------------------------------------------------
// Security rails: loopback guard + CIDR allowlist
// ---------------------------------------------------------------------------
/**
 * Loopback-only guard for an unauthenticated / INSECURE route. Returns true when
 * the bind/source host is a loopback address, false otherwise. A handler that
 * exposes an INSECURE (no-auth) route MUST refuse to serve it unless this returns
 * true, so an unauthenticated surface can never be bound to a public interface.
 */
export function isLoopbackHost(host) {
    const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost")
        return true;
    if (h === "::1" || h === "::ffff:127.0.0.1")
        return true;
    // IPv4 loopback block 127.0.0.0/8.
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (m)
        return m[1] === "127";
    return false;
}
/**
 * Optional CIDR source allowlist. Returns true when `ip` is inside any of the
 * given CIDR ranges (IPv4 only; an empty allowlist means "no restriction" and
 * returns true). Platform webhooks that publish source ranges (e.g. MS Graph) can
 * use this; it is OPTIONAL and lives at the provider/handler edge, never in the
 * dedupe/journal core.
 */
export function ipInAllowlist(ip, cidrs) {
    if (cidrs.length === 0)
        return true;
    const addr = ipv4ToInt(ip);
    if (addr === undefined)
        return false;
    for (const cidr of cidrs) {
        const slash = cidr.indexOf("/");
        if (slash < 0) {
            if (ipv4ToInt(cidr) === addr)
                return true;
            continue;
        }
        const base = ipv4ToInt(cidr.slice(0, slash));
        const bits = Number(cidr.slice(slash + 1));
        if (base === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32)
            continue;
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        if ((addr & mask) >>> 0 === (base & mask) >>> 0)
            return true;
    }
    return false;
}
function ipv4ToInt(ip) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
    if (!m)
        return undefined;
    let out = 0;
    for (let i = 1; i <= 4; i++) {
        const part = Number(m[i]);
        if (part > 255)
            return undefined;
        out = (out << 8) | part;
    }
    return out >>> 0;
}
//# sourceMappingURL=verify.js.map