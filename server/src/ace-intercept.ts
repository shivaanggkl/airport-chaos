import { journeyDallasAceIntercept01 as mission } from '../../shared/journey-mission.mjs';
import { keepDallasEscortInside } from './journey-hunter-airspace.js';
import { pursuitProgress, type PursuitProgress } from './hot-pursuit.js';

export type AceInterceptState = {
  pilot?: {position:{x:number;y:number;z:number}; heading:number; speed:number; health:number};
  displayRemaining?: number;
  phase: 'DOGFIGHT' | 'ESCAPE'; health: number; route: PursuitProgress;
  position: {x:number;y:number;z:number}; rotation: {x:number;y:number;z:number};
  velocity: {x:number;y:number;z:number}; speed: number; updatedAt: number;
};

/** Only called with server-owned aircraft state, never client progress. */
export function updateAceIntercept(state: AceInterceptState, health: number, position: AceInterceptState['position']): boolean {
  const transition = state.phase === 'DOGFIGHT' && health > 0 && health <= mission.escapeHealth;
  state.health = Math.max(0, health);
  if (transition) {
    state.phase = 'ESCAPE';
    delete state.displayRemaining;
    state.route.previous = {...position};
  }
  if (state.phase === 'ESCAPE' && health > 0) pursuitProgress(position, state.route, mission);
  return transition;
}


// Use the existing full-city bound; the historical DFW combat arena excludes the approved exit.
export function insideAceInterceptAirspace(position: {x:number;z:number}): boolean {
  const bounded=keepDallasEscortInside(position);
  return bounded.x===position.x&&bounded.z===position.z;
}

/** Health packets may be frequent; publish route distance at most once a second. */
export function aceInterceptDistance(state: AceInterceptState | undefined, now: number): number | undefined {
  if(state?.phase!=='ESCAPE')return undefined;
  if(state.displayRemaining===undefined||now-(state.route.lastSentAt??0)>=1000){state.displayRemaining=state.route.remaining;state.route.lastSentAt=now;}
  return state.displayRemaining;
}
