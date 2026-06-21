// @gest/ingest-github / platform capability descriptor
//
// The typed capability descriptor for GitHub's comment/issue surface. Pure DATA
// an effect encoder reads to split/escape outbound text. GitHub issue/PR comment
// bodies cap at ~65536 characters and use GitHub-flavored markdown (GFM). GitHub
// webhooks use verify-then-decode (HMAC-SHA256 over exact transport bytes), so no
// envelope decode step is involved. (This is the platform messaging capability;
// it is distinct from the installation-token capability in capability.ts.)
/** GitHub's capability descriptor. */
export const GITHUB_CAPABILITY = {
    platform: "github",
    supportsCodeBlocks: true,
    // PR review threads / issue comment threads.
    supportsThreading: true,
    supportsEdits: true,
    // Reactions on issues/comments via the reactions API.
    supportsReactions: true,
    supportsEphemeral: false,
    maxTextLength: 65_536,
    lengthUnit: "utf16-code-units",
    markdownFlavor: "gfm",
    media: [{ kind: "image" }, { kind: "file" }],
};
//# sourceMappingURL=platform-capability.js.map