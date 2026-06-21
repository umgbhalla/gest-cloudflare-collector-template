// @gest/ingest-discord / platform capability descriptor
//
// The typed capability descriptor for Discord's messaging surface. Pure DATA an
// effect encoder reads to split/escape outbound text. Discord messages cap at
// 2000 characters (UTF-16 code units) and use Discord-flavored markdown. Discord
// uses verify-then-decode (Ed25519 over exact transport bytes), so no envelope
// decode step is involved.
/** Discord's capability descriptor. */
export const DISCORD_CAPABILITY = {
    platform: "discord",
    supportsCodeBlocks: true,
    supportsThreading: true,
    supportsEdits: true,
    supportsReactions: true,
    // Interaction responses can be ephemeral (flags: 64); channel messages cannot.
    supportsEphemeral: true,
    maxTextLength: 2_000,
    lengthUnit: "utf16-code-units",
    markdownFlavor: "discord",
    media: [
        { kind: "image" },
        { kind: "video" },
        { kind: "audio" },
        { kind: "file" },
    ],
};
//# sourceMappingURL=platform-capability.js.map