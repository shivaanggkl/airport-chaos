import type { CityMission } from '../../shared/city-missions.mjs';
import type { MissionAttempt } from './player-profiles.js';

// The server alone produces these signals from accepted transforms, validated
// touchdowns, combat, territory control, challenges and event outcomes.
export type MissionSignal =
  | { type: 'takeoff'; at: number; airportId?: string }
  | { type: 'landing'; at: number; airportId: string; quality: number; controlledTerritories: ReadonlySet<string> }
  | { type: 'flight'; at: number; airborne: boolean; alive: boolean; meters: number; heading: number }
  | { type: 'stunt'; at: number; maneuver: 'barrelRoll' | 'quickDodge' }
  | { type: 'challenge'; at: number; challengeId: string }
  | { type: 'challengeStart'; at: number; challengeId: string; timeLimitMs: number }
  | { type: 'challengeGate'; at: number; challengeId: string; gateIndex: number }
  | { type: 'kill'; at: number; targetId: string; isBot: boolean; valid: boolean; controlledTerritories: ReadonlySet<string> }
  | { type: 'territoryCapture'; at: number; territoryId: string }
  | { type: 'event'; at: number; eventId: string; eventType: string; result: string }
  | { type: 'wantedStarted'; at: number; eventId: string; heatLevel: number }
  | { type: 'wantedSurvived'; at: number; eventId: string }
  | { type: 'tick'; at: number; alive: boolean; connected: boolean; airborne: boolean; controlledTerritories: ReadonlySet<string>; scoreRank: number; humanCount: number; score: number }
  | { type: 'lostFlight'; at: number }
  | { type: 'disconnect'; at: number };

export type MissionStep = { attempt: MissionAttempt; completed: boolean; changed: boolean };

function sameSet(controlled: ReadonlySet<string>, required: readonly string[]): boolean {
  return required.every((id) => controlled.has(id));
}

function angularDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function resetFlight(attempt: MissionAttempt): void {
  attempt.flightStartedAt = undefined;
  attempt.heading = undefined;
  attempt.distanceMeters = 0;
  attempt.progress = 0;
  attempt.completedIds = [];
}

export function advanceMission(mission: CityMission, original: MissionAttempt, signal: MissionSignal): MissionStep {
  const attempt: MissionAttempt = { ...original, completedIds: [...original.completedIds] };
  const before = JSON.stringify(attempt);
  const requirements = mission.requirements;
  let completed = false;
  if (signal.type === 'disconnect' || signal.type === 'lostFlight') {
    if (mission.type === 'airborneHold' || mission.type === 'straightDistance' || mission.type === 'stuntPair' || mission.type === 'destinationLanding') resetFlight(attempt);
    if (mission.type === 'territoryHold') { attempt.holdStartedAt = undefined; attempt.progress = 0; }
    if (signal.type === 'disconnect') attempt.holdStartedAt = undefined;
  } else switch (mission.type) {
    case 'airborneHold':
      if (signal.type === 'takeoff' && signal.airportId === requirements.airportId) attempt.flightStartedAt = signal.at;
      if (signal.type === 'landing') resetFlight(attempt);
      if (signal.type === 'tick' && attempt.flightStartedAt) {
        if (!signal.alive || !signal.airborne || !signal.connected) resetFlight(attempt);
        else { attempt.progress = Math.min(requirements.durationSeconds ?? 0, Math.floor((signal.at - attempt.flightStartedAt) / 1000)); completed = attempt.progress >= (requirements.durationSeconds ?? Infinity); }
      }
      break;
    case 'destinationLanding':
      if (signal.type === 'takeoff') attempt.flightStartedAt = signal.at;
      if (signal.type === 'landing') { completed = Boolean(attempt.flightStartedAt && signal.airportId === requirements.airportId); if (!completed) resetFlight(attempt); }
      break;
    case 'straightDistance':
      if (signal.type === 'flight') {
        if (!signal.airborne || !signal.alive) resetFlight(attempt);
        else if (attempt.heading === undefined) { attempt.heading = signal.heading; attempt.flightStartedAt = signal.at; }
        else if (Math.abs(angularDifference(signal.heading, attempt.heading)) > (requirements.maxHeadingErrorRadians ?? 0.17)) resetFlight(attempt);
        else { attempt.distanceMeters = Math.min(requirements.meters ?? 0, (attempt.distanceMeters ?? 0) + Math.max(0, signal.meters)); attempt.progress = attempt.distanceMeters; completed = attempt.progress >= (requirements.meters ?? Infinity); }
      }
      if (signal.type === 'landing') resetFlight(attempt);
      break;
    case 'stuntPair':
      if (signal.type === 'takeoff') attempt.flightStartedAt = signal.at;
      if (signal.type === 'landing') resetFlight(attempt);
      if (signal.type === 'stunt' && attempt.flightStartedAt && requirements.maneuvers?.includes(signal.maneuver)) {
        if (!attempt.completedIds.includes(signal.maneuver)) attempt.completedIds.push(signal.maneuver);
        attempt.progress = attempt.completedIds.length;
        completed = (requirements.maneuvers ?? []).every((name) => attempt.completedIds.includes(name));
      }
      break;
    case 'airportLandings':
      if (signal.type === 'landing' && requirements.airportIds?.includes(signal.airportId)) {
        if (!attempt.completedIds.includes(signal.airportId)) attempt.completedIds.push(signal.airportId);
        attempt.progress = attempt.completedIds.length;
        completed = requirements.airportIds.every((id) => attempt.completedIds.includes(id));
      }
      break;
    case 'challenge':
      if (signal.type === 'challengeStart' && signal.challengeId === requirements.challengeId) {
        attempt.progress = 0; attempt.challengeEndsAt = signal.at + signal.timeLimitMs;
      }
      if (signal.type === 'challengeGate' && signal.challengeId === requirements.challengeId && signal.at <= (attempt.challengeEndsAt ?? 0)) {
        attempt.progress = Math.max(attempt.progress, signal.gateIndex + 1);
      }
      if (signal.type === 'challenge' && signal.challengeId === requirements.challengeId && attempt.challengeEndsAt && signal.at <= attempt.challengeEndsAt && attempt.progress >= (requirements.gateCount ?? Infinity)) completed = true;
      break;
    case 'assignedHunter':
      if (signal.type === 'kill' && signal.valid && signal.isBot && signal.targetId === attempt.targetId) { attempt.progress = 1; completed = true; }
      break;
    case 'humanKill':
      if (signal.type === 'kill' && signal.valid && !signal.isBot) { attempt.progress = 1; completed = true; }
      break;
    case 'territoryHold':
      if (signal.type === 'tick') {
        const owned = signal.alive && signal.connected && sameSet(signal.controlledTerritories, requirements.territoryIds ?? []);
        if (!owned) { attempt.holdStartedAt = undefined; attempt.progress = 0; }
        else {
          attempt.holdStartedAt ??= signal.at;
          attempt.progress = Math.min(requirements.durationSeconds ?? 0, Math.floor((signal.at - attempt.holdStartedAt) / 1000));
          completed = attempt.progress >= (requirements.durationSeconds ?? Infinity);
        }
      }
      break;
    case 'territoryOwn':
      if (signal.type === 'tick' && signal.alive && signal.connected) {
        attempt.completedIds = (requirements.territoryIds ?? []).filter((id) => signal.controlledTerritories.has(id));
        attempt.progress = attempt.completedIds.length;
        completed = sameSet(signal.controlledTerritories, requirements.territoryIds ?? []);
      }
      break;
    case 'event':
      if (signal.type === 'event' && signal.eventType === requirements.eventType && signal.result === requirements.result && signal.at >= attempt.startedAt && (!attempt.eventId || attempt.eventId === signal.eventId)) {
        attempt.eventId = signal.eventId; attempt.progress = 1; completed = true;
      }
      break;
    case 'wantedSurvival':
      if (signal.type === 'wantedStarted' && signal.heatLevel >= (requirements.heatLevel ?? 5) && signal.at >= attempt.startedAt) attempt.eventId = signal.eventId;
      if (signal.type === 'wantedSurvived' && attempt.eventId === signal.eventId && signal.at >= attempt.startedAt) { attempt.progress = 1; completed = true; }
      break;
    case 'precisionLanding':
      if (signal.type === 'landing' && signal.airportId === requirements.airportId && signal.quality >= (requirements.minimumScore ?? 1000)) { attempt.progress = signal.quality; completed = true; }
      break;
    case 'territorySequence':
      if (signal.type === 'tick' && attempt.completedIds.some((id) => !signal.controlledTerritories.has(id))) { attempt.completedIds = []; attempt.sequenceIndex = 0; attempt.progress = 0; }
      if (signal.type === 'territoryCapture' && signal.territoryId === requirements.territoryIds?.[attempt.sequenceIndex ?? 0]) {
        attempt.completedIds.push(signal.territoryId); attempt.sequenceIndex = attempt.completedIds.length; attempt.progress = attempt.sequenceIndex;
        completed = attempt.sequenceIndex >= (requirements.territoryIds?.length ?? Infinity);
      }
      break;
    case 'territoryUniqueKills':
      if (signal.type === 'tick' && !sameSet(signal.controlledTerritories, requirements.territoryIds ?? [])) { attempt.completedIds = []; attempt.progress = 0; }
      if (signal.type === 'kill' && signal.valid && sameSet(signal.controlledTerritories, requirements.territoryIds ?? []) && !attempt.completedIds.includes(signal.targetId)) {
        attempt.completedIds.push(signal.targetId); attempt.progress = attempt.completedIds.length;
        completed = attempt.progress >= (requirements.uniqueKills ?? Infinity);
      }
      break;
    case 'airportEmpire':
      if (signal.type === 'tick' && !sameSet(signal.controlledTerritories, requirements.territoryIds ?? [])) { attempt.completedIds = []; attempt.progress = 0; }
      if (signal.type === 'landing' && sameSet(signal.controlledTerritories, requirements.territoryIds ?? []) && requirements.airportIds?.includes(signal.airportId) && !attempt.completedIds.includes(signal.airportId)) {
        attempt.completedIds.push(signal.airportId); attempt.progress = attempt.completedIds.length;
        completed = requirements.airportIds.every((id) => attempt.completedIds.includes(id));
      }
      break;
    case 'liveScoreRank':
      if (signal.type === 'tick' && signal.alive && signal.connected && signal.humanCount >= 2 && signal.score > 0 && signal.scoreRank === requirements.rank) { attempt.progress = 1; completed = true; }
      break;
  }
  if (JSON.stringify(attempt) !== before) attempt.updatedAt = signal.at;
  return { attempt, completed, changed: JSON.stringify(attempt) !== before };
}
