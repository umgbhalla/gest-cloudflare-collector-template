// @gest/ingest-discord / identity
//
// Event identity and dedupe keying. The core never derives a native key (that is
// a platform concern); this module owns the Discord key rules and exposes them as
// strings the core's dedupe store claims.
//
// Two key rules, one per transport (per docs/platforms/discord.md):
//
//   HTTP interaction:   discord:interaction:{application_id}:{interaction_id}
//     Discord guarantees a unique interaction id per interaction; a transport
//     retry of the same interaction reuses the id, so this collapses retries to
//     one claim while distinct interactions never collide.
//
//   Gateway event:      discord:gateway:{application_id}:{guild_or_dm}:{session_or_shard}:{sequence}:{event_type}
//     The gateway can redeliver after a RESUME; the sequence is monotonic within
//     a session, so folding session + sequence + event type collapses a resumed
//     redelivery while keeping genuinely distinct events apart.
/**
 * Native dedupe key for an HTTP interaction:
 *   discord:interaction:{application_id}:{interaction_id}
 */
export function interactionDedupeKey(interaction) {
    return `discord:interaction:${interaction.applicationId}:${interaction.id}`;
}
/**
 * The guild/DM scope a gateway event belongs to. Guild id wins when present;
 * otherwise the literal "dm" so DM events never collapse across guilds and a
 * missing guild does not silently widen the key.
 */
export function gatewayScopeOf(envelope) {
    return envelope.guildId ?? "dm";
}
/**
 * Native dedupe key for a gateway event:
 *   discord:gateway:{application_id}:{guild_or_dm}:{session_id}:{sequence}:{event_type}
 *
 * Session id is used (not shard id) because the sequence is monotonic per
 * session; a RESUME replays the same session id + sequence pairs, which is
 * exactly what we want to dedupe. Shard id is preserved in source metadata for
 * audit/rebalancing but is not part of the identity.
 */
export function gatewayDedupeKey(envelope) {
    return [
        "discord:gateway",
        envelope.applicationId,
        gatewayScopeOf(envelope),
        envelope.sessionId,
        String(envelope.sequence),
        envelope.eventType,
    ].join(":");
}
//# sourceMappingURL=identity.js.map