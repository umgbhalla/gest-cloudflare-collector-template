// @gest/ingest-core / platform capability descriptor
//
// A typed, provider-neutral description of what a platform's messaging surface
// can carry. Each platform adapter attaches ONE of these as a static descriptor
// (it is data, not behavior). Effect encoders consume it to make outbound
// decisions (split long messages, escape markdown, pick a media type) WITHOUT the
// core knowing any platform. The core owns only the shape + decoder + the pure
// length helper; it never owns a platform's actual values.
//
// Research basis (docs/research/provider-integration-ideas.md, "Platform
// capability model"): per-adapter flags for code blocks, threading, media types,
// and a max length measured in an explicit UNIT — Telegram counts UTF-16 code
// units (emoji = 2), so a naive `String.length` is wrong. We make the unit
// explicit so an effect encoder splits correctly per platform.
import { decodeArray, decodeBoolean, decodeEnum, decodeNonEmptyString, decodeNonNegativeInt, decodeObject, field, optionalField, } from "./decode.js";
/**
 * The unit a platform measures message length in. This matters: Telegram limits
 * to 4096 UTF-16 code units (an emoji costs 2), Slack/Discord count differently.
 * An effect encoder MUST measure with the right unit before splitting.
 */
export const LENGTH_UNITS = [
    /** Unicode code points (String iterator length). */
    "code-points",
    /** UTF-16 code units (JS `String.length`; emoji = 2). Telegram uses this. */
    "utf16-code-units",
    /** Raw UTF-8 bytes. */
    "utf8-bytes",
    /** Whole graphemes (user-perceived characters). */
    "graphemes",
];
/**
 * Markdown/escaping flavor an effect encoder must apply to outbound text. The
 * core does not implement escaping; it only records which flavor the platform
 * expects so the platform's effect encoder picks the right escaper.
 */
export const MARKDOWN_FLAVORS = [
    "none",
    /** Slack mrkdwn. */
    "mrkdwn",
    /** Discord-flavored markdown. */
    "discord",
    /** GitHub-flavored markdown. */
    "gfm",
    /** Telegram MarkdownV2 (aggressive escaping). */
    "markdown-v2",
    /** Telegram legacy Markdown. */
    "markdown",
    /** HTML subset (e.g. Telegram parse_mode=HTML). */
    "html",
];
export const decodeMediaSupport = decodeObject({
    kind: field(decodeNonEmptyString),
    maxBytes: optionalField(decodeNonNegativeInt),
});
export const decodePlatformCapability = decodeObject({
    platform: field(decodeNonEmptyString),
    supportsCodeBlocks: field(decodeBoolean),
    supportsThreading: field(decodeBoolean),
    supportsEdits: field(decodeBoolean),
    supportsReactions: field(decodeBoolean),
    supportsEphemeral: field(decodeBoolean),
    maxTextLength: field(decodeNonNegativeInt),
    lengthUnit: field(decodeEnum(LENGTH_UNITS)),
    markdownFlavor: field(decodeEnum(MARKDOWN_FLAVORS)),
    media: field(decodeArray(decodeMediaSupport)),
});
/**
 * Measure a string's length in the given unit. This is the pure primitive an
 * effect encoder uses BEFORE splitting outbound text, so a Telegram encoder
 * counts UTF-16 code units (emoji = 2) and a code-point platform counts code
 * points. No platform knowledge here — just the unit math.
 */
export function measureLength(text, unit) {
    switch (unit) {
        case "utf16-code-units":
            return text.length;
        case "code-points":
            return Array.from(text).length;
        case "utf8-bytes":
            return new TextEncoder().encode(text).length;
        case "graphemes": {
            // Intl.Segmenter is the correct grapheme counter when available; fall back
            // to code points (a safe over-count that never under-splits) otherwise.
            const Seg = Intl.Segmenter;
            if (Seg) {
                let n = 0;
                for (const _ of new Seg(undefined, { granularity: "grapheme" }).segment(text))
                    n++;
                return n;
            }
            return Array.from(text).length;
        }
    }
}
/**
 * True when `text` fits within the capability's max length, measured with the
 * capability's declared unit. An effect encoder uses this to decide whether to
 * split. Pure; no I/O.
 */
export function fitsLength(text, capability) {
    return measureLength(text, capability.lengthUnit) <= capability.maxTextLength;
}
//# sourceMappingURL=capability.js.map