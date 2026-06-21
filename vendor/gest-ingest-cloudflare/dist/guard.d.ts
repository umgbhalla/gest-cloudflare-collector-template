import { type HeaderMap, type InboundOutcome } from "@gest/ingest-core";
/** Inputs the Worker collects at the request edge, before reading the body. */
export interface CfGuardInput {
    /** Lowercased header map (use headersToMap). */
    readonly headers: HeaderMap;
    /** Max body bytes the route accepts; a larger Content-Length is rejected. */
    readonly maxBodyBytes: number;
    /** The platform secret resolved for this route (undefined/empty fails closed). */
    readonly secret: string | undefined;
    /** True when the route is configured INSECURE (no signature auth). */
    readonly insecureRoute?: boolean;
    /** Bind/source host, required to evaluate an INSECURE route's loopback rule. */
    readonly sourceHost?: string;
    /** Source IP for the optional CIDR allowlist (uses `cf-connecting-ip` if unset). */
    readonly sourceIp?: string;
    /** Optional CIDR source allowlist; empty means no IP restriction. */
    readonly allowedCidrs?: readonly string[];
}
/**
 * Run the pre-read edge guard. Returns `"accepted"` when the request may proceed
 * to the body read + platform verification, or a distinct rejecting outcome. The
 * order matches the canonical inbound contract for the checks this edge owns:
 * missing-secret -> payload-too-large. The loopback/CIDR rails reject as
 * `not-found` (we do not reveal the route exists to a disallowed source).
 */
export declare function guardInbound(input: CfGuardInput): InboundOutcome;
//# sourceMappingURL=guard.d.ts.map