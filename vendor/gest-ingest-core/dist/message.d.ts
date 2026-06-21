import { type Json } from "./json.js";
import { type Decoder } from "./decode.js";
import { type PlatformCapability } from "./capability.js";
/** The closed set of card node kinds. */
export declare const GEST_CARD_NODE_KINDS: readonly ["title", "text", "button", "actions"];
export type GestCardNodeKind = (typeof GEST_CARD_NODE_KINDS)[number];
/** A heading node. */
export interface GestCardTitleNode {
    readonly kind: "title";
    readonly text: string;
}
/** A body-text node. */
export interface GestCardTextNode {
    readonly kind: "text";
    readonly text: string;
}
/** A single actionable button. */
export interface GestCardButtonNode {
    readonly kind: "button";
    /** Visible label. */
    readonly text: string;
    /** Stable action id the runtime keys interactions on. */
    readonly actionId: string;
    /** Opaque value carried back on interaction, when set. */
    readonly value?: string;
    /** External URL the button opens, for link-style buttons. */
    readonly url?: string;
}
/** A horizontal group of buttons. */
export interface GestCardActionsNode {
    readonly kind: "actions";
    readonly buttons: readonly GestCardButtonNode[];
}
/** A node in a card tree. Discriminated on `kind`. */
export type GestCardNode = GestCardTitleNode | GestCardTextNode | GestCardButtonNode | GestCardActionsNode;
/** A structured, platform-neutral card: an ordered list of nodes. */
export interface GestCard {
    readonly nodes: readonly GestCardNode[];
}
/** Decode one card node, dispatched on `kind`. */
export declare const decodeGestCardNode: Decoder<GestCardNode>;
export declare const decodeGestCard: Decoder<GestCard>;
/** The closed set of authored message kinds. */
export declare const GEST_MESSAGE_KINDS: readonly ["text", "markdown", "card", "blocks"];
export type GestMessageKind = (typeof GEST_MESSAGE_KINDS)[number];
/** Plain text; a renderer may escape per platform but adds no formatting. */
export interface GestTextMessage {
    readonly kind: "text";
    readonly text: string;
}
/** Markdown source; a renderer maps it to the platform's markdown flavor. */
export interface GestMarkdownMessage {
    readonly kind: "markdown";
    readonly markdown: string;
}
/** A structured card; a renderer maps it to native rich layout. */
export interface GestCardMessage {
    readonly kind: "card";
    readonly card: GestCard;
    /** Plain-text fallback for surfaces that can't render the card. */
    readonly fallbackText?: string;
}
/**
 * An escape hatch carrying native `blocks` JSON verbatim plus a plain-text
 * summary. The runtime author opts out of the neutral surface here; a renderer
 * passes `blocks` through to the native body. `blocks` is opaque typed JSON.
 */
export interface GestBlocksMessage {
    readonly kind: "blocks";
    readonly text: string;
    readonly blocks: Json;
}
/** The uniform outbound message authored once by the runtime. */
export type GestRichMessage = GestTextMessage | GestMarkdownMessage | GestCardMessage | GestBlocksMessage;
/** Decode an authored message, dispatched on `kind`. */
export declare const decodeGestRichMessage: Decoder<GestRichMessage>;
/**
 * A reference to the thread a rendered message should attach to. Platform-neutral;
 * a renderer maps it to the native field (Slack `thread_ts`, etc.).
 */
export interface GestThreadRef {
    /** Native thread identifier owned by the platform adapter. */
    readonly threadId: string;
}
/** Input to a renderer's `render` call. */
export interface RenderInput {
    /** Native API method the body targets, e.g. "chat.postMessage". */
    readonly method: string;
    /** Native destination, e.g. a Slack channel id. */
    readonly destination: string;
    /** The authored message to fan out. */
    readonly message: GestRichMessage;
    /** Optional thread to attach to. */
    readonly threadRef?: GestThreadRef;
}
/**
 * The final native request body produced by a renderer. This is what an effect
 * encoder pins into the outbox row; the `requestHash` includes `rendererVersion`
 * so identical input + version replays to the identical body and hash.
 */
export interface RenderedPlatformBody {
    /** Platform this body targets (e.g. "slack"). */
    readonly platform: string;
    /** Native API method, echoed from the input. */
    readonly method: string;
    /** Native destination, echoed from the input. */
    readonly destination: string;
    /** The native wire body (Slack chat.postMessage args, etc.). Opaque JSON. */
    readonly requestBody: Json;
    /** The platform capability the renderer rendered against. */
    readonly capability: PlatformCapability;
    /** Renderer version that produced this body; part of the replay hash. */
    readonly rendererVersion: string;
}
export declare const decodeRenderedPlatformBody: Decoder<RenderedPlatformBody>;
/**
 * A pure, deterministic, version-pinned per-platform renderer. Implementations
 * live OUTSIDE this package (the optional `@gest/render-*` bridge packages);
 * the core owns only the contract so an effect encoder can depend on the shape.
 *
 * Contract: `render` is a pure function — no I/O, no clock, no randomness. The
 * same `(input, rendererVersion)` must always produce the same
 * `RenderedPlatformBody`, so the outbox hash stays replay-stable.
 */
export interface PlatformMessageRenderer {
    /** Platform this renderer targets. */
    readonly platform: string;
    /** Stable version string mixed into the outbox request hash. */
    readonly rendererVersion: string;
    /** Render an authored message into a native body. Pure + deterministic. */
    render(input: RenderInput): RenderedPlatformBody;
}
//# sourceMappingURL=message.d.ts.map