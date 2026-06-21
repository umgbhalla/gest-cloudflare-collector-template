// @gest/ingest-core / platform
//
// Identity vocabulary shared by every adapter. The core names the platforms and
// transports it must stay portable across, but owns NONE of their semantics: no
// signing, no envelope decoding, no event identity. Those live in the platform
// adapter packages. This file is just the closed set of identifiers plus the
// boring provider/transport metadata a provider adapter captures.
import { decodeEnum, decodeNonEmptyString, decodeObject, decodeRecord, decodeString, field, optionalField, } from "./decode.js";
/** Platforms the core must remain portable across from the first commit. */
export const PLATFORMS = ["slack", "discord", "telegram", "github"];
/** How a delivery physically arrived. Verification differs per transport. */
export const TRANSPORTS = ["http", "socket", "polling", "export"];
/** Cloud/runtime hosts a provider adapter may run on. Neutral metadata only. */
export const PROVIDERS = [
    "cloudflare",
    "vercel",
    "lambda",
    "convex",
    "node",
    "unknown",
];
export const decodePlatform = decodeEnum(PLATFORMS);
export const decodeTransport = decodeEnum(TRANSPORTS);
export const decodeProvider = decodeEnum(PROVIDERS);
export const decodeHeaderMap = decodeRecord(decodeString);
export const decodeProviderMeta = decodeObject({
    provider: field(decodeProvider),
    requestId: field(decodeNonEmptyString),
    receivedAt: field(decodeNonEmptyString),
    region: optionalField(decodeNonEmptyString),
    deploymentId: optionalField(decodeNonEmptyString),
    extra: optionalField(decodeRecord(decodeString)),
});
//# sourceMappingURL=platform.js.map