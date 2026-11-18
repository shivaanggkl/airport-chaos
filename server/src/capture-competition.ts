import { journeyDallasCaptureThree01 as mission } from '../../shared/journey-mission.mjs';

export type CaptureActor = { id: string; alive: boolean; territoryId?: string };
export type CaptureTerritory = { id: string; ownerId?: string; capturingId?: string; captureMs: number; contested: boolean };
export type CaptureOpponent = {
  id: string; aircraft: 'trainer' | 'fighter' | 'privateJet' | 'cargo'; level: 'EASY' | 'HARD';
  position: {x:number;y:number;z:number}; rotation: {x:number;y:number;z:number};
  velocity: {x:number;y:number;z:number}; health: number; goal: number; retargetAt?:number;
};
export type CaptureCompetition = { territories: CaptureTerritory[]; opponents: CaptureOpponent[]; updatedAt: number };

export function newCaptureCompetition(opponents: CaptureOpponent[], now: number): CaptureCompetition {
  return { territories: mission.territoryIds.map(id => ({id, captureMs:0, contested:false})), opponents, updatedAt:now };
}

/** Eligibility and actor identity come exclusively from accepted server state. */
export function advanceCaptureCompetition(state: CaptureCompetition, actors: readonly CaptureActor[], now: number): void {
  const elapsed = now - state.updatedAt;
  const delta = elapsed > 0 && elapsed <= 800 ? Math.min(400, elapsed) : 0;
  state.updatedAt = now;
  for (const territory of state.territories) {
    if (territory.ownerId && !actors.some(actor => actor.id === territory.ownerId && actor.alive)) {
      territory.ownerId = undefined; territory.capturingId = undefined; territory.captureMs = 0;
    }
    const contenders = actors.filter(actor => actor.alive && actor.territoryId === territory.id && actor.id !== territory.ownerId);
    territory.contested = contenders.length > 1;
    if (contenders.length !== 1 || !delta) {
      territory.capturingId = undefined; territory.captureMs = 0;
      continue;
    }
    const contender = contenders[0]!;
    if (territory.capturingId !== contender.id) { territory.capturingId = contender.id; territory.captureMs = 0; }
    // A present owner can defend; killing it releases the territory to white.
    const defending = actors.some(actor => actor.id === territory.ownerId && actor.alive && actor.territoryId === territory.id);
    territory.captureMs = Math.min(mission.captureDurationMs * (defending ? .95 : 1), territory.captureMs + delta);
    if (territory.captureMs >= mission.captureDurationMs) {
      territory.ownerId = contender.id; territory.capturingId = undefined; territory.captureMs = 0;
    }
  }
}

export function captureCompetitionOwned(state: CaptureCompetition, actorId = 'pilot'): number {
  return state.territories.filter(territory => territory.ownerId === actorId).length;
}
