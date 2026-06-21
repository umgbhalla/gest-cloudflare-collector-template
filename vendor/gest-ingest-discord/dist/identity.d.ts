import type { DiscordInteraction } from "./envelope.js";
import type { GatewayEventEnvelope } from "./envelope.js";
/**
 * Native dedupe key for an HTTP interaction:
 *   discord:interaction:{application_id}:{interaction_id}
 */
export declare function interactionDedupeKey(interaction: DiscordInteraction): string;
/**
 * The guild/DM scope a gateway event belongs to. Guild id wins when present;
 * otherwise the literal "dm" so DM events never collapse across guilds and a
 * missing guild does not silently widen the key.
 */
export declare function gatewayScopeOf(envelope: GatewayEventEnvelope): string;
/**
 * Native dedupe key for a gateway event:
 *   discord:gateway:{application_id}:{guild_or_dm}:{session_id}:{sequence}:{event_type}
 *
 * Session id is used (not shard id) because the sequence is monotonic per
 * session; a RESUME replays the same session id + sequence pairs, which is
 * exactly what we want to dedupe. Shard id is preserved in source metadata for
 * audit/rebalancing but is not part of the identity.
 */
export declare function gatewayDedupeKey(envelope: GatewayEventEnvelope): string;
//# sourceMappingURL=identity.d.ts.map