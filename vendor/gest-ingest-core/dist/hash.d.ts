import { type Json } from "./json.js";
/**
 * A stable JSON hash function. Effect codecs take this as an injected capability
 * (rather than importing a hash directly) so they stay pure and edge-portable;
 * every caller passes {@link hashJson}. The ONE shape, shared by every platform
 * effect context instead of being redeclared per package.
 */
export type HashFn = (value: Json) => string;
/** Stable hash of exact bytes, prefixed with the algorithm for audit honesty. */
export declare function hashBytes(bytes: Uint8Array): string;
/** Stable hash of a UTF-8 string body. */
export declare function hashString(text: string): string;
/** Stable hash of a JSON value via its canonical sorted-key encoding. */
export declare function hashJson(value: Json): string;
//# sourceMappingURL=hash.d.ts.map