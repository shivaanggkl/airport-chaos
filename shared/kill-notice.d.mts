export type KillEvent = { playerId: string; killerId: string; killerDisplayName: string; victimDisplayName: string };
export function killNotice(event: KillEvent, localPlayerId: string | null): string;
