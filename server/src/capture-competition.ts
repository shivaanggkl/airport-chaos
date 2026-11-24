import { journeyDallasCaptureThree01 as mission } from '../../shared/journey-mission.mjs';

export type CaptureActor = { id: string; alive: boolean; territoryId?: string };
export type CaptureTerritory = { id: string; ownerId?: string; capturingId?: string; captureMs: number; contested: boolean };
export type CaptureOpponent = {
  id: string; aircraft: 'trainer' | 'fighter' | 'privateJet' | 'cargo'; level: 'EASY' | 'HARD';
  position: {x:number;y:number;z:number}; rotation: {x:number;y:number;z:number};
  velocity: {x:number;y:number;z:number}; health: number; goal: number; retargetAt?:number; respawnRemainingMs?:number; respawnUpdatedAt?:number; name?:string; role?:'owner'|'attacker'; runwayStart?:boolean; provokedUntil?:number;
};
export type CaptureCompetition = { territories: CaptureTerritory[]; opponents: CaptureOpponent[]; updatedAt: number; departurePending?: boolean; departureOrigin?: {x:number;y:number;z:number} };

export function newCaptureCompetition(opponents: CaptureOpponent[], now: number, territoryIds: readonly string[] = mission.territoryIds): CaptureCompetition {
  return { territories: territoryIds.map(id => ({id, captureMs:0, contested:false})), opponents, updatedAt:now };
}

/** Defeat releases ownership and the actor’s own attempt, preserving another challenger’s progress. */
export function releaseCaptureActor(state: CaptureCompetition, actorId: string): void {
  for (const territory of state.territories) {
    if (territory.ownerId === actorId) {
      territory.ownerId = undefined;
      territory.contested = false;
    }
    if (territory.capturingId === actorId) {
      territory.capturingId = undefined; territory.captureMs = 0; territory.contested = false;
    }
  }
}

/** Each guardian may claim only its assigned territory; hunters never claim one. */
function captureAssignmentAllows(state: CaptureCompetition, actorId: string, territoryId: string): boolean {
  if (actorId === 'pilot') return true;
  const slot = state.opponents.findIndex(enemy => enemy.id === actorId);
  return slot >= 0 && state.opponents[slot]!.role === 'owner' && state.territories[slot]?.id === territoryId;
}

/** Repair old private mission saves without erasing an eligible challenger’s progress. */
export function enforceCaptureAssignments(state: CaptureCompetition): void {
  for (const territory of state.territories) {
    if (territory.ownerId && !captureAssignmentAllows(state, territory.ownerId, territory.id)) {
      territory.ownerId = undefined;
      territory.contested = false;
    }
    if (territory.capturingId && !captureAssignmentAllows(state, territory.capturingId, territory.id)) {
      territory.capturingId = undefined;
      territory.captureMs = 0;
      territory.contested = false;
    }
  }
}

/** Eligibility and actor identity come exclusively from accepted server state. */
export function advanceCaptureCompetition(state: CaptureCompetition, actors: readonly CaptureActor[], now: number, requireDefeatedOwner = false, assignedOwnersOnly = false): void {
  if (assignedOwnersOnly) enforceCaptureAssignments(state);
  const elapsed = now - state.updatedAt;
  const delta = elapsed > 0 && elapsed <= 800 ? Math.min(400, elapsed) : 0;
  state.updatedAt = now;
  // Absence (outside this territory or a transient missing update) is not a defeat.
  for (const actor of actors) if (!actor.alive) releaseCaptureActor(state, actor.id);
  for (const territory of state.territories) {
    const contenders = actors.filter(actor => actor.alive && actor.territoryId === territory.id && actor.id !== territory.ownerId &&
      (!assignedOwnersOnly || captureAssignmentAllows(state, actor.id, territory.id)));
    territory.contested = contenders.length > 1 || Boolean(territory.ownerId && contenders.length);
    // Missing/stalled updates cannot award time or erase accepted progress.
    if (!delta) continue;
    if (contenders.length !== 1) {
      // A contest pauses the current capturer. Reset only after a confirmed
      // departure or defeat, rather than whenever another aircraft arrives.
      const remainsInside = actors.some(actor => actor.id === territory.capturingId && actor.alive && actor.territoryId === territory.id);
      if (!remainsInside) { territory.capturingId = undefined; territory.captureMs = 0; }
      continue;
    }
    const contender = contenders[0]!;
    if (territory.capturingId !== contender.id) { territory.capturingId = contender.id; territory.captureMs = 0; }
    // A present owner can defend; killing it releases the territory to white.
    const defending = actors.some(actor => actor.id === territory.ownerId && actor.alive && actor.territoryId === territory.id) ||
      requireDefeatedOwner && state.opponents.some((enemy,index)=>(enemy.role==='owner'||!enemy.role&&index<state.territories.length)&&enemy.id===territory.ownerId&&enemy.health>0);
    territory.captureMs = Math.min(mission.captureDurationMs * (defending ? .95 : 1), territory.captureMs + delta);
    if (territory.captureMs >= mission.captureDurationMs) {
      territory.ownerId = contender.id; territory.capturingId = undefined; territory.captureMs = 0; territory.contested = false;
    }
  }
}

export function captureCompetitionOwned(state: CaptureCompetition, actorId = 'pilot'): number {
  return state.territories.filter(territory => territory.ownerId === actorId).length;
}

/** Paused, disconnected and stalled time never shortens an opponent's respawn buffer. */
export function advanceCaptureRespawn(enemy:CaptureOpponent,now:number,fresh:boolean,delayMs:number):boolean {
  if(enemy.health>0)return false;
  const elapsed=now-(enemy.respawnUpdatedAt??now);
  enemy.respawnUpdatedAt=now;
  const delta=fresh&&elapsed>0&&elapsed<=800?Math.min(400,elapsed):0;
  enemy.respawnRemainingMs=Math.max(0,(enemy.respawnRemainingMs??delayMs)-delta);
  return enemy.respawnRemainingMs===0;
}
