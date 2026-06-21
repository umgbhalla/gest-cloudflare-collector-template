// @gest/ingest-discord / verify
//
// Discord HTTP interaction request verification. CRITICAL invariant (gest hard
// rule): the Ed25519 signature is checked against the EXACT raw bytes BEFORE any
// JSON parse. Nothing in this module calls JSON.parse; it operates on
// `IngestHttpRequest.rawBody` and the normalized header map only. The verdict it
// returns is recorded on the raw delivery (durable source truth) so replay and
// audit stay honest.
//
// Discord signing scheme ("discord-ed25519"):
//   message = X-Signature-Timestamp + rawBody         (timestamp then exact body)
//   sig     = hex Ed25519 signature over `message`     (X-Signature-Ed25519)
//   key     = the application's hex-encoded Ed25519 PUBLIC key (32 bytes)
//
// Discord signs `timestamp || body`. We bind the presented timestamp into the
// verified message, so a body replayed under a different timestamp fails. An
// optional skew window rejects stale timestamps (replay defense); it is off by
// default because Discord itself does not mandate one for interactions, but a
// runner may set it.
import { createPublicKey, verify as edVerify } from "node:crypto";
import { rejectVerdict, verifiedSignature, } from "@gest/ingest-core";
/** Signing scheme name recorded on every Discord signature verdict. */
export const DISCORD_SIGNATURE_SCHEME = "discord-ed25519";
/** Header names Discord attaches to a signed interaction delivery. */
export const DISCORD_SIGNATURE_HEADER = "x-signature-ed25519";
export const DISCORD_TIMESTAMP_HEADER = "x-signature-timestamp";
/** DER prefix that wraps a 32-byte raw Ed25519 public key into SPKI. */
const ED25519_SPKI_PREFIX = Uint8Array.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);
const encoder = new TextEncoder();
/**
 * Verify a Discord interaction request over its exact bytes. Returns a structured
 * verdict; it NEVER throws on a bad signature (that is normal probe traffic) and
 * NEVER parses the body. The caller stores the verdict on the raw delivery and
 * decides what to do with a non-"verified" result.
 */
export function verifyDiscordRequest(request, opts) {
    const retry = { count: 0 };
    const presented = request.headers[DISCORD_SIGNATURE_HEADER];
    const timestamp = request.headers[DISCORD_TIMESTAMP_HEADER];
    if (presented === undefined || timestamp === undefined) {
        return reject("missing", retry, "missing discord signature or timestamp header");
    }
    const sigBytes = hexToBytes(presented);
    if (sigBytes === undefined || sigBytes.length !== 64) {
        return reject("rejected", retry, "signature is not 64-byte hex", opts.keyId);
    }
    if (opts.maxSkewSeconds !== undefined) {
        if (!/^\d+$/.test(timestamp)) {
            return reject("rejected", retry, "timestamp header is not an integer epoch", opts.keyId);
        }
        const now = opts.nowEpochSeconds ?? 0;
        if (Math.abs(now - Number(timestamp)) > opts.maxSkewSeconds) {
            return reject("expired", retry, `timestamp skew exceeds ${opts.maxSkewSeconds}s`, opts.keyId);
        }
    }
    const key = loadPublicKey(opts.publicKeyHex);
    if (key === undefined) {
        return reject("unsupported", retry, "application public key is not valid 32-byte hex", opts.keyId);
    }
    const message = bindTimestamp(timestamp, request.rawBody);
    let valid = false;
    try {
        valid = edVerify(null, message, key, sigBytes);
    }
    catch {
        valid = false;
    }
    if (!valid) {
        return reject("rejected", retry, "ed25519 signature mismatch", opts.keyId);
    }
    return {
        signature: verifiedSignature(DISCORD_SIGNATURE_SCHEME, { keyId: opts.keyId }),
        retry,
        verified: true,
    };
}
/** Build the exact signed message: timestamp bytes followed by the raw body bytes. */
export function bindTimestamp(timestamp, rawBody) {
    const ts = encoder.encode(timestamp);
    const message = new Uint8Array(ts.length + rawBody.length);
    message.set(ts, 0);
    message.set(rawBody, ts.length);
    return message;
}
/** Wrap a 32-byte raw Ed25519 public key (hex) into a Node KeyObject, or undefined. */
function loadPublicKey(publicKeyHex) {
    const raw = hexToBytes(publicKeyHex);
    if (raw === undefined || raw.length !== 32)
        return undefined;
    const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + raw.length);
    spki.set(ED25519_SPKI_PREFIX, 0);
    spki.set(raw, ED25519_SPKI_PREFIX.length);
    try {
        return createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
    }
    catch {
        return undefined;
    }
}
/** Decode a hex string into bytes, or undefined when it is not valid hex. */
function hexToBytes(hex) {
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex))
        return undefined;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}
// Discord-local reject wrapper over core rejectVerdict (binds the Discord scheme).
function reject(kind, retry, reason, keyId) {
    return rejectVerdict(DISCORD_SIGNATURE_SCHEME, retry, kind, reason, keyId);
}
/** Header reader kept exported so a provider adapter can pre-flight presence. */
export function hasDiscordSignatureHeaders(headers) {
    return (headers[DISCORD_SIGNATURE_HEADER] !== undefined &&
        headers[DISCORD_TIMESTAMP_HEADER] !== undefined);
}
//# sourceMappingURL=verify.js.map