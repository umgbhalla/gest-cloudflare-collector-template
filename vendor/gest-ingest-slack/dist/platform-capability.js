// @gest/ingest-slack / platform capability descriptor
//
// The typed capability descriptor for Slack's messaging surface (gest research:
// "Platform capability model"). It is pure DATA — an effect encoder reads it to
// split/escape outbound text; this package owns the values, the core owns the
// shape. Slack messages cap at 40000 characters (counted as UTF-16 code units by
// the Web API) and use Slack mrkdwn. Slack uses verify-then-decode: the signature
// is over exact transport bytes, so no envelope decode step is involved.
/** Slack's capability descriptor. */
export const SLACK_CAPABILITY = {
    platform: "slack",
    supportsCodeBlocks: true,
    supportsThreading: true,
    supportsEdits: true,
    supportsReactions: true,
    supportsEphemeral: true,
    // chat.postMessage practical limit; long text should be split into blocks.
    maxTextLength: 40_000,
    lengthUnit: "utf16-code-units",
    markdownFlavor: "mrkdwn",
    media: [
        { kind: "image" },
        { kind: "video" },
        { kind: "audio" },
        { kind: "file" },
    ],
};
//# sourceMappingURL=platform-capability.js.map