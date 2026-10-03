// Both names must come from the server's destruction event. Never infer the
// victim from a local roster that may be stale or absent after a kill.
export function killNotice(event, localPlayerId) {
  const attacker = event.killerDisplayName || 'Unknown Pilot';
  const victim = event.victimDisplayName || 'Unknown Pilot';
  if (event.playerId === localPlayerId) return `DESTROYED BY: ${attacker}`;
  if (event.killerId === localPlayerId) return `DESTROYED: ${victim}`;
  return `${attacker} destroyed ${victim}`;
}
