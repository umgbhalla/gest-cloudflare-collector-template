// @gest/ingest-core / uniform outbound surface
//
// One authored message shape (`GestRichMessage`) plus the pure renderer contract
// that fans it out to native per-platform wire formats. Authored ONCE by the
// runtime; per-platform renderers (which live OUTSIDE this package, in the
// optional `@gest/render-*` bridge packages) turn it into a `RenderedPlatformBody`
// carrying the final native request body.
//
// Boundary rules (ADR-0005 — Gest owns the inbound loop; chat-sdk is an optional
// outbound render-primitive source in a SEPARATE package):
// - This file is PURE types + decoders. No chat-sdk, no platform/provider import,
//   no I/O. The only imports are sibling core modules.
// - Rendering runs at effect-ENCODE time and is deterministic + version-pinned:
//   the same `GestRichMessage` + same `rendererVersion` must yield the same
//   `requestBody`, so the outbox `requestHash` (which includes `rendererVersion`)
//   stays replay-stable. The renderer contract is declared here; the core never
//   executes a renderer.
// - The runtime author never touches Block Kit / embeds / mrkdwn directly: they
//   author a `GestRichMessage` and a platform renderer does the fan-out.
import {} from "./json.js";
import { decodeArray, decodeEnum, decodeNonEmptyString, decodeObject, decodeString, decodeTagged, field, optionalField, } from "./decode.js";
import { decodeJsonPayload } from "./queue.js";
import { decodePlatformCapability } from "./capability.js";
// ---------------------------------------------------------------------------
// GestCard — a structured, platform-neutral card
//
// A card is a small tree of typed nodes (title / text / button / actions). It is
// the richest authored form short of raw native `blocks`. Per-platform renderers
// map it to Block Kit / embeds / etc. The core owns only the shape + decoder; it
// never renders.
// ---------------------------------------------------------------------------
/** The closed set of card node kinds. */
export const GEST_CARD_NODE_KINDS = ["title", "text", "button", "actions"];
const decodeCardButtonNode = decodeObject({
    kind: field(decodeEnum(["button"])),
    text: field(decodeNonEmptyString),
    actionId: field(decodeNonEmptyString),
    value: optionalField(decodeString),
    url: optionalField(decodeNonEmptyString),
});
const decodeCardTitleNode = decodeObject({
    kind: field(decodeEnum(["title"])),
    text: field(decodeNonEmptyString),
});
const decodeCardTextNode = decodeObject({
    kind: field(decodeEnum(["text"])),
    text: field(decodeNonEmptyString),
});
const decodeCardActionsNode = decodeObject({
    kind: field(decodeEnum(["actions"])),
    buttons: field(decodeArray(decodeCardButtonNode)),
});
/** Decode one card node, dispatched on `kind`. */
export const decodeGestCardNode = decodeTagged("kind", {
    title: decodeCardTitleNode,
    text: decodeCardTextNode,
    button: decodeCardButtonNode,
    actions: decodeCardActionsNode,
}, "expected card node object");
export const decodeGestCard = decodeObject({
    nodes: field(decodeArray(decodeGestCardNode)),
});
// ---------------------------------------------------------------------------
// GestRichMessage — the one authored outbound message shape
// ---------------------------------------------------------------------------
/** The closed set of authored message kinds. */
export const GEST_MESSAGE_KINDS = ["text", "markdown", "card", "blocks"];
const decodeTextMessage = decodeObject({
    kind: field(decodeEnum(["text"])),
    text: field(decodeString),
});
const decodeMarkdownMessage = decodeObject({
    kind: field(decodeEnum(["markdown"])),
    markdown: field(decodeString),
});
const decodeCardMessage = decodeObject({
    kind: field(decodeEnum(["card"])),
    card: field(decodeGestCard),
    fallbackText: optionalField(decodeString),
});
const decodeBlocksMessage = decodeObject({
    kind: field(decodeEnum(["blocks"])),
    text: field(decodeString),
    blocks: field(decodeJsonPayload),
});
/** Decode an authored message, dispatched on `kind`. */
export const decodeGestRichMessage = decodeTagged("kind", {
    text: decodeTextMessage,
    markdown: decodeMarkdownMessage,
    card: decodeCardMessage,
    blocks: decodeBlocksMessage,
}, "expected message object");
export const decodeRenderedPlatformBody = decodeObject({
    platform: field(decodeNonEmptyString),
    method: field(decodeNonEmptyString),
    destination: field(decodeNonEmptyString),
    requestBody: field(decodeJsonPayload),
    capability: field(decodePlatformCapability),
    rendererVersion: field(decodeNonEmptyString),
});
//# sourceMappingURL=message.js.map