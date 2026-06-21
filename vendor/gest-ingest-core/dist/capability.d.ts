import { type Decoder } from "./decode.js";
/**
 * The unit a platform measures message length in. This matters: Telegram limits
 * to 4096 UTF-16 code units (an emoji costs 2), Slack/Discord count differently.
 * An effect encoder MUST measure with the right unit before splitting.
 */
export declare const LENGTH_UNITS: readonly ["code-points", "utf16-code-units", "utf8-bytes", "graphemes"];
export type LengthUnit = (typeof LENGTH_UNITS)[number];
/**
 * Markdown/escaping flavor an effect encoder must apply to outbound text. The
 * core does not implement escaping; it only records which flavor the platform
 * expects so the platform's effect encoder picks the right escaper.
 */
export declare const MARKDOWN_FLAVORS: readonly ["none", "mrkdwn", "discord", "gfm", "markdown-v2", "markdown", "html"];
export type MarkdownFlavor = (typeof MARKDOWN_FLAVORS)[number];
/** A media kind a platform can accept on an outbound effect. */
export interface MediaSupport {
    /** Mime category, e.g. "image", "video", "audio", "file". */
    readonly kind: string;
    /** Max size in bytes the platform accepts for this kind, when known. */
    readonly maxBytes?: number;
}
export declare const decodeMediaSupport: Decoder<MediaSupport>;
/**
 * The typed capability descriptor a platform adapter attaches. It is pure data:
 * an effect encoder reads it to split/escape/route outbound effects. The core
 * never interprets the booleans; it only guarantees the shape and lets an encoder
 * measure length with `measureLength` using the declared unit.
 */
export interface PlatformCapability {
    /** Platform identifier this descriptor belongs to. */
    readonly platform: string;
    /** Whether the platform renders fenced code blocks. */
    readonly supportsCodeBlocks: boolean;
    /** Whether the platform supports threaded replies. */
    readonly supportsThreading: boolean;
    /** Whether the platform supports message edits after send. */
    readonly supportsEdits: boolean;
    /** Whether the platform supports reactions. */
    readonly supportsReactions: boolean;
    /** Whether the platform supports ephemeral (visible-to-one) messages. */
    readonly supportsEphemeral: boolean;
    /** Max outbound text length, measured in `lengthUnit`. */
    readonly maxTextLength: number;
    /** Unit `maxTextLength` is measured in (e.g. UTF-16 for Telegram). */
    readonly lengthUnit: LengthUnit;
    /** Markdown/escaping flavor an encoder must apply to outbound text. */
    readonly markdownFlavor: MarkdownFlavor;
    /** Media kinds the platform accepts outbound. */
    readonly media: readonly MediaSupport[];
}
export declare const decodePlatformCapability: Decoder<PlatformCapability>;
/**
 * Measure a string's length in the given unit. This is the pure primitive an
 * effect encoder uses BEFORE splitting outbound text, so a Telegram encoder
 * counts UTF-16 code units (emoji = 2) and a code-point platform counts code
 * points. No platform knowledge here — just the unit math.
 */
export declare function measureLength(text: string, unit: LengthUnit): number;
/**
 * True when `text` fits within the capability's max length, measured with the
 * capability's declared unit. An effect encoder uses this to decide whether to
 * split. Pure; no I/O.
 */
export declare function fitsLength(text: string, capability: PlatformCapability): boolean;
//# sourceMappingURL=capability.d.ts.map