/** Request base: {key, rawId, now, retentionSeconds}. Spread into a shape spec. */
export declare const decodeDedupeBase: {
    readonly key: import("./decode.js").FieldSpec<string>;
    readonly rawId: import("./decode.js").FieldSpec<string>;
    readonly now: import("./decode.js").FieldSpec<string>;
    readonly retentionSeconds: import("./decode.js").FieldSpec<number>;
};
/** Claim base: {key, duplicate, firstRawId?, claimedAt?}. Spread into a shape spec. */
export declare const decodeClaimBase: {
    readonly key: import("./decode.js").FieldSpec<string>;
    readonly duplicate: import("./decode.js").FieldSpec<boolean>;
    readonly firstRawId: import("./decode.js").FieldSpec<string>;
    readonly claimedAt: import("./decode.js").FieldSpec<string>;
};
//# sourceMappingURL=dedupe-shared.d.ts.map