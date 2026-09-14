import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cityMissionCatalog, missionForCity } from '../../shared/city-missions.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { advanceMission } from './mission-engine.js';
import { PlayerProfileStore, type MissionAttempt } from './player-profiles.js';

function attempt(missionId: string): MissionAttempt {
  return { missionId, attemptId: '00000000-0000-4000-8000-000000000001', startedAt: 1_000, updatedAt: 1_000, progress: 0, completedIds: [] };
}

test('Dallas catalog is complete and other cities cannot use Dallas missions', () => {
  assert.equal(cityMissionCatalog.dallas.length, 25);
  assert.deepEqual(cityMissionCatalog.dallas.map((mission) => mission.number), Array.from({ length: 25 }, (_, index) => index + 1));
  assert.deepEqual(cityMissionCatalog.dallas.map((mission) => [mission.creditReward, mission.scoreReward]), [
    [15, 25], [40, 50], [60, 75], [75, 100], [350, 400], [200, 300], [250, 350], [450, 600],
    [400, 500], [700, 850], [1100, 1300], [2500, 3000], [2000, 2500], [2750, 3250],
    [900, 1200], [1000, 1250], [750, 1000], [1750, 2500], [500, 750], [3500, 4500],
    [3000, 4000], [5000, 6500], [6000, 7500], [10000, 12500], [15000, 20000],
  ]);
  assert.equal(missionForCity('milwaukee', 'first-flight'), undefined);
});

test('mission attempts persist, switch resets, reward is once-only, and replay cools down', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-mission-'));
  try {
    const store = new PlayerProfileStore(join(directory, 'profiles.sqlite'));
    const first = store.getOrCreate('pilot-test-one-00001', 'Pilot One');
    const second = store.getOrCreate('pilot-test-two-00002', 'Pilot Two');
    const accepted = store.acceptMission(first.pilotId, 'dallas', 'straight-run', false, undefined, 1_000);
    assert.equal(accepted.ok, true);
    const oldAttempt = accepted.profile!.missions.dallas!.active!;
    const progressed = { ...oldAttempt, progress: 4_000, distanceMeters: 4_000 };
    store.updateMissionAttempt(first.pilotId, 'dallas', progressed);
    assert.equal(store.acceptMission(first.pilotId, 'dallas', 'first-flight', true, 'wrong-id', 2_000).ok, false);
    assert.equal(store.acceptMission(first.pilotId, 'dallas', 'first-flight', false, undefined, 2_000).confirmationRequired, true);
    const switched = store.acceptMission(first.pilotId, 'dallas', 'first-flight', true, oldAttempt.attemptId, 2_000);
    assert.equal(switched.ok, true);
    assert.equal(switched.profile!.missions.dallas!.active!.progress, 0);
    assert.notEqual(switched.profile!.missions.dallas!.active!.attemptId, oldAttempt.attemptId);
    assert.equal(switched.profile!.credits, first.credits);
    const active = switched.profile!.missions.dallas!.active!;
    const rewarded = store.completeMission(first.pilotId, 'dallas', active.attemptId, 62_000);
    assert.equal(rewarded?.credits, 15);
    assert.equal(store.completeMission(first.pilotId, 'dallas', active.attemptId, 62_100), undefined);
    assert.equal(store.acceptMission(first.pilotId, 'dallas', 'first-flight', false, undefined, 62_500).ok, false);
    assert.equal(store.acceptMission(first.pilotId, 'dallas', 'first-flight', false, undefined, 663_000).ok, true);
    const restored = new PlayerProfileStore(join(directory, 'profiles.sqlite')).getOrCreate(first.pilotId, 'Pilot One');
    assert.equal(restored.credits, first.credits + 15);
    assert.equal(restored.missions.dallas!.completions['first-flight'].count, 1);
    assert.equal(restored.missions.dallas!.active!.progress, 0);
    assert.equal(store.getOrCreate(second.pilotId, 'Pilot Two').missions.dallas!.active, undefined);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('territory hold resets on ownership loss and cannot advance offline', () => {
  const source = missionForCity('dallas', 'south-metro-capture')!;
  const mission = { ...source, requirements: { ...source.requirements, durationSeconds: 5 } };
  const owned = new Set(['dallas-executive']);
  const tick = (at: number, controlledTerritories: ReadonlySet<string>, connected = true) => ({
    type: 'tick' as const, at, alive: true, connected, airborne: true, controlledTerritories,
    scoreRank: 1, humanCount: 2, score: 100,
  });
  let state = advanceMission(mission, attempt(mission.id), tick(2_000, owned));
  state = advanceMission(mission, state.attempt, tick(6_000, owned));
  assert.equal(state.attempt.progress, 4);
  assert.equal(state.completed, false);
  state = advanceMission(mission, state.attempt, tick(7_000, new Set()));
  assert.equal(state.attempt.progress, 0);
  state = advanceMission(mission, state.attempt, tick(8_000, owned, false));
  assert.equal(state.attempt.progress, 0);
  state = advanceMission(mission, state.attempt, tick(9_000, owned));
  state = advanceMission(mission, state.attempt, tick(14_000, owned));
  assert.equal(state.completed, true);
});

test('challenge gates, Wanted start, and controlled-kill requirements stay attempt-scoped', () => {
  const speed = missionForCity('dallas', 'speed-course')!;
  const speedAttempt = attempt(speed.id);
  assert.equal(advanceMission(speed, speedAttempt, { type: 'challenge', at: 5_000, challengeId: 'dfw-speed' }).completed, false);
  let state = advanceMission(speed, speedAttempt, { type: 'challengeStart', at: 2_000, challengeId: 'dfw-speed', timeLimitMs: 62_000 });
  for (let index = 0; index < 4; index += 1) state = advanceMission(speed, state.attempt, { type: 'challengeGate', at: 3_000 + index * 1_000, challengeId: 'dfw-speed', gateIndex: index });
  assert.equal(advanceMission(speed, state.attempt, { type: 'challenge', at: 7_000, challengeId: 'dfw-speed' }).completed, true);

  const wanted = missionForCity('dallas', 'most-wanted')!;
  assert.equal(advanceMission(wanted, attempt(wanted.id), { type: 'wantedSurvived', at: 10_000, eventId: 'event-a' }).completed, false);
  const started = advanceMission(wanted, attempt(wanted.id), { type: 'wantedStarted', at: 3_000, eventId: 'event-a', heatLevel: 5 });
  assert.equal(advanceMission(wanted, started.attempt, { type: 'wantedSurvived', at: 10_000, eventId: 'event-a' }).completed, true);

  const supremacy = missionForCity('dallas', 'central-air-supremacy')!;
  const kill = (targetId: string, controlledTerritories: ReadonlySet<string>) => ({ type: 'kill' as const, at: 4_000, targetId, isBot: false, valid: true, controlledTerritories });
  assert.equal(advanceMission(supremacy, attempt(supremacy.id), kill('rival', new Set())).attempt.progress, 0);
  const controlled = new Set(['downtown']);
  let kills = attempt(supremacy.id);
  for (const targetId of ['one', 'two', 'two', 'three']) kills = advanceMission(supremacy, kills, kill(targetId, controlled)).attempt;
  assert.equal(kills.progress, 3);
});

test('ordered capture resets on loss, airport empire requires controlled landings, conquest needs every configured territory', () => {
  const sequence = missionForCity('dallas', 'three-territory-offensive')!;
  const capture = (territoryId: string) => ({ type: 'territoryCapture' as const, at: 2_000, territoryId });
  const tick = (controlledTerritories: ReadonlySet<string>) => ({ type: 'tick' as const, at: 3_000, alive: true, connected: true, airborne: true, controlledTerritories, scoreRank: 1, humanCount: 2, score: 20 });
  let chain = advanceMission(sequence, attempt(sequence.id), capture('dallas-executive')).attempt;
  chain = advanceMission(sequence, chain, capture('las-colinas')).attempt;
  assert.equal(chain.progress, 2);
  chain = advanceMission(sequence, chain, tick(new Set(['las-colinas']))).attempt;
  assert.equal(chain.progress, 0);
  assert.equal(advanceMission(sequence, chain, capture('downtown')).completed, false);

  const empire = missionForCity('dallas', 'airport-empire')!;
  const airportsOwned = new Set(empire.requirements.territoryIds);
  const land = (airportId: string, controlledTerritories: ReadonlySet<string>) => ({ type: 'landing' as const, at: 4_000, airportId, quality: 900, controlledTerritories });
  let tour = advanceMission(empire, attempt(empire.id), land('dfw', new Set())).attempt;
  assert.equal(tour.progress, 0);
  for (const airportId of ['dfw', 'love', 'addison']) tour = advanceMission(empire, tour, land(airportId, airportsOwned)).attempt;
  assert.equal(tour.progress, 3);
  tour = advanceMission(empire, tour, tick(new Set())).attempt;
  assert.equal(tour.progress, 0);
  assert.equal(advanceMission(empire, tour, land('executive', airportsOwned)).completed, false);

  const conquestSource = missionForCity('dallas', 'dallas-conquest')!;
  const required = territoriesForCity('dallas').map((territory) => territory.id);
  const conquest = { ...conquestSource, requirements: { ...conquestSource.requirements, territoryIds: required } };
  assert.equal(advanceMission(conquest, attempt(conquest.id), tick(new Set(required.slice(0, -1)))).completed, false);
  assert.equal(advanceMission(conquest, attempt(conquest.id), tick(new Set(required))).completed, true);
});
