// @gest/ingest-core / raw
//
// Raw delivery is durable source truth. A provider adapter captures the exact
// bytes; a platform adapter records the signature verdict and native retry
// metadata WITHOUT mutating the bytes. The core stores and replays this record;
// it does not understand the payload. Rejected-signature deliveries persist
// minimal audit metadata only and must not store attacker-controlled bodies by
// default (see SignatureResult.kind === "rejected").
import { decodeBoolean, decodeEnum, decodeIsoTimestamp, decodeNonEmptyString, decodeNonNegativeInt, decodeObject, decodeString, field, optionalField, } from "./decode.js";
import { decodeHeaderMap, decodePlatform, decodeProviderMeta, decodeTransport, } from "./platform.js";
/**
 * Verdict of a signed-platform signature check. The platform adapter owns the
 * algorithm; the core only records the verdict so replay and audit are honest.
 */
export const SIGNATURE_KINDS = [
    "verified",
    "rejected",
    "missing",
    "expired",
    "unsupported",
    /** Transport had no cryptographic signature to check (e.g. socket/polling). */
    "not-applicable",
];
/**
 * Where a delivery's envelope sits relative to signature verification. Most
 * signed HTTP platforms (Slack/GitHub/Discord/Telegram) are "verify-then-decode":
 * the signature is over the exact transport bytes, verified before any parse.
 * Some platforms (WeCom AES-128-CBC+SHA1, QQBot AES-256-GCM, WeChat AES-128-ECB)
 * are "decrypt-then-verify": the transport carries an ENCRYPTED envelope and the
 * platform adapter must decode it before/around verification. The core records
 * which shape applied so replay and audit stay honest; it owns NEITHER algorithm.
 */
export const ENVELOPE_DECODE_MODES = [
    /** Signature is over exact transport bytes; verify before any decode/parse. */
    "verify-then-decode",
    /** Transport carries an encrypted envelope; platform decodes around verify. */
    "decrypt-then-verify",
];
export const decodeSignatureKind = decodeEnum(SIGNATURE_KINDS);
export const decodeEnvelopeDecodeMode = decodeEnum(ENVELOPE_DECODE_MODES);
export const decodeEnvelopeDecode = decodeObject({
    mode: field(decodeEnvelopeDecodeMode),
    decoded: field(decodeBoolean),
    cryptoScheme: optionalField(decodeNonEmptyString),
    reason: optionalField(decodeString),
});
export const decodeSignatureResult = decodeObject({
    kind: field(decodeSignatureKind),
    scheme: optionalField(decodeNonEmptyString),
    keyId: optionalField(decodeNonEmptyString),
    reason: optionalField(decodeString),
    candidatesPresented: optionalField(decodeNonNegativeInt),
    candidateMatched: optionalField(decodeNonNegativeInt),
    envelope: optionalField(decodeEnvelopeDecode),
});
export const decodeRetryMeta = decodeObject({
    count: field(decodeNonNegativeInt),
    reason: optionalField(decodeString),
});
export const decodeRawDelivery = decodeObject({
    rawId: field(decodeNonEmptyString),
    platform: field(decodePlatform),
    transport: field(decodeTransport),
    tenant: field(decodeNonEmptyString),
    account: field(decodeNonEmptyString),
    receivedAt: field(decodeIsoTimestamp),
    provider: field(decodeProviderMeta),
    headers: field(decodeHeaderMap),
    body: optionalField(decodeString),
    bodyHash: field(decodeNonEmptyString),
    signature: field(decodeSignatureResult),
    retry: field(decodeRetryMeta),
    installRef: optionalField(decodeNonEmptyString),
});
/**
 * Signature verdicts whose body is durable. A "verified" delivery proved its
 * bytes; a "not-applicable" delivery (socket frame / polling) was authenticated
 * out of band and its body is the only source truth. Every OTHER verdict
 * (rejected/expired/missing/unsupported) is attacker-controllable and its body is
 * NEVER persisted — the raw-first invariant keeps audit metadata only.
 */
const BODY_PERSISTING_KINDS = new Set(["verified", "not-applicable"]);
/**
 * Assemble a durable {@link RawDelivery} from provider-neutral base inputs and the
 * platform-derived identity fields. This is the ONE place the common raw shape,
 * the signature/retry/provider threading, and the "no attacker-controlled body on
 * a non-verified verdict" policy live, so every platform adapter records raw the
 * same way. The body is included ONLY when the verdict is body-persisting AND a
 * body was supplied; otherwise the row carries audit metadata + bodyHash only.
 */
export function buildRawDelivery(base, platformFields) {
    const keepBody = base.body !== undefined && BODY_PERSISTING_KINDS.has(base.signature.kind);
    return {
        rawId: base.rawId,
        platform: platformFields.platform,
        transport: platformFields.transport,
        tenant: base.tenant,
        account: platformFields.account,
        receivedAt: base.receivedAt,
        provider: base.provider,
        headers: base.headers,
        bodyHash: base.bodyHash,
        signature: base.signature,
        retry: base.retry,
        ...(keepBody ? { body: base.body } : {}),
        ...(platformFields.installRef === undefined ? {} : { installRef: platformFields.installRef }),
    };
}
export const decodeRawInsertResult = decodeObject({
    rawId: field(decodeNonEmptyString),
    inserted: field(decodeBoolean),
    insertedAt: field(decodeIsoTimestamp),
});
//# sourceMappingURL=raw.js.map