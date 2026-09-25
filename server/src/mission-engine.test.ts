import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cityMissionCatalog, missionForCity } from '../../shared/city-missions.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { pilotXpRewards } from '../../shared/pilot-progression.mjs';
import { advanceMission, initializeMissionAttempt } from './mission-engine.js';
import { PlayerProfileStore, type MissionAttempt } from './player-profiles.js';

function attempt(missionId: string): MissionAttempt {
  return { missionId, attemptId: '00000000-0000-4000-8000-000000000001', startedAt: 1_000, updatedAt: 1_000, progress: 0, completedIds: [] };
}

test('Dallas catalog remains complete and city-scoped starter missions exist in Milwaukee', () => {
  assert.equal(cityMissionCatalog.dallas.length, 26);
  assert.deepEqual(cityMissionCatalog.dallas.map((mission) => mission.number), Array.from({ length: 26 }, (_, index) => index + 1));
  assert.deepEqual(cityMissionCatalog.dallas.map((mission) => [mission.creditReward, mission.scoreReward]), [
    [15, 25], [40, 50], [60, 75], [75, 100], [350, 400], [200, 300], [250, 350], [450, 600],
    [400, 500], [700, 850], [1100, 1300], [2500, 3000], [2000, 2500], [2750, 3250],
    [900, 1200], [1000, 1250], [750, 1000], [1750, 2500], [500, 750], [3500, 4500],
    [3000, 4000], [5000, 6500], [6000, 7500], [10000, 12500], [15000, 20000], [2000, 2500],
  ]);
  assert.deepEqual(cityMissionCatalog.milwaukee.map((mission) => mission.id), ['first-flight', 'straight-run']);
  assert.equal(missionForCity('dallas', 'straight-run')?.requirements.meters, 24_000);
  assert.equal(missionForCity('milwaukee', 'straight-run')?.requirements.meters, 24_000);
  assert.equal(missionForCity('dallas', 'stunt-training')?.retired, true);
  const grandTour = missionForCity('dallas', 'dallas-grand-tour')!;
  assert.equal(grandTour.replayCooldownMs, 30 * 60_000);
  assert.equal(grandTour.requirements.steps?.length, 11);
  assert.equal(pilotXpRewards.mission[grandTour.difficulty], 160);
});

test('airborne acceptance starts city flight missions immediately and landing needs no post-acceptance takeoff', () => {
  const context = { at: 5_000, alive: true, connected: true, airborne: true, heading: 0.72 };
  for (const cityId of ['dallas', 'milwaukee'] as const) {
    const firstFlight = missionForCity(cityId, 'first-flight')!;
    const initialized = initializeMissionAttempt(firstFlight, attempt(firstFlight.id), context);
    assert.equal(initialized.flightStartedAt, 5_000);
    assert.equal(advanceMission(firstFlight, initialized, {
      type: 'tick', at: 65_000, alive: true, connected: true, airborne: true,
      controlledTerritories: new Set(), scoreRank: 1, humanCount: 1, score: 0,
    }).completed, true);

    const straight = missionForCity(cityId, 'straight-run')!;
    const straightAttempt = initializeMissionAttempt(straight, attempt(straight.id), context);
    assert.equal(straightAttempt.heading, context.heading);
    assert.equal(straightAttempt.distanceMeters, 0);
  }

  const landing = missionForCity('dallas', 'first-landing')!;
  assert.equal(advanceMission(landing, attempt(landing.id), {
    type: 'landing', at: 9_000, airportId: 'love', quality: 700, controlledTerritories: new Set(),
  }).completed, true);
  assert.equal(advanceMission(landing, attempt(landing.id), {
    type: 'landing', at: 9_000, airportId: 'dfw', quality: 700, controlledTerritories: new Set(),
  }).completed, false);
});

test('mission attempts persist, switch resets, reward is once-only, and replay cools down', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-mission-'));
  try {
    const store = new PlayerProfileStore(join(directory, 'profiles.sqlite'));
    const first = store.getOrCreate('pilot-test-one-00001', 'Pilot One');
    const second = store.getOrCreate('pilot-test-two-00002', 'Pilot Two');
    const accepted = store.acceptMission(first.pilotId, 'dallas', 'straight-run', false, undefined, 1_000);
    assert.equal(accepted.ok, true);
    assert.deepEqual(store.acceptMission(second.pilotId, 'dallas', 'stunt-training', false, undefined, 1_000), { ok: false, reason: 'MISSION RETIRED' });
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
    const milwaukee = store.acceptMission(first.pilotId, 'milwaukee', 'first-flight', false, undefined, 62_500);
    assert.equal(milwaukee.ok, true, 'Dallas cooldown must not block Milwaukee');
    const abandoned = store.abandonMission(first.pilotId, 'milwaukee', milwaukee.profile!.missions.milwaukee!.active!.attemptId);
    assert.equal(abandoned?.credits, first.credits + 15);
    assert.equal(abandoned?.missions.milwaukee!.active, undefined);
    assert.equal(abandoned?.missions.milwaukee!.completions['first-flight'], undefined);
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
  for (const targetId of ['one', 'two', 'two']) kills = advanceMission(supremacy, kills, kill(targetId, controlled)).attempt;
  kills = advanceMission(supremacy, kills, { type: 'tick', at: 5_000, alive: true, connected: true, airborne: true, controlledTerritories: new Set(), scoreRank: 1, humanCount: 2, score: 20 }).attempt;
  assert.equal(kills.progress, 0);
  for (const targetId of ['one', 'two', 'two', 'three']) kills = advanceMission(supremacy, kills, kill(targetId, controlled)).attempt;
  assert.equal(kills.progress, 3);
});

test('Dallas Grand Tour is ordered and resets only its continuous flight steps', () => {
  const mission = missionForCity('dallas', 'dallas-grand-tour')!;
  const steps = mission.requirements.steps!;
  const territoryIds = [
    'downtown',
    missionForCity('dallas', 'metro-central-capture')!.requirements.territoryIds![0],
    missionForCity('dallas', 'canal-capture')!.requirements.territoryIds![0],
    missionForCity('dallas', 'south-metro-capture')!.requirements.territoryIds![0],
  ];
  const territories = territoriesForCity('dallas');
  assert.deepEqual(steps.slice(0, 4).map((step) => step.id), territoryIds);
  for (let index = 0; index < territoryIds.length; index += 1) {
    const territory = territories.find((item) => item.id === territoryIds[index])!;
    assert.deepEqual(
      { x: steps[index].x, z: steps[index].z, bounds: steps[index].bounds },
      { x: territory.center.x, z: territory.center.z, bounds: territory.bounds },
      `${steps[index].label} must use the authoritative ${territory.id} territory`,
    );
  }
  assert.deepEqual(
    steps.slice(4).map((step) => step.id),
    ['northwest-edge', 'northeast-edge', 'southeast-edge', 'southwest-edge', 'high-altitude', 'low-flight', 'downtown-low-pass'],
    'steps 5-11 remain unchanged',
  );
  const flight = (at: number, x: number, z: number, altitudeMeters: number, meters = 0, airborne = true) => ({
    type: 'flight' as const, at, alive: true, airborne, meters, heading: 0, x, z, altitudeMeters,
  });
  const groundAcceptance = initializeMissionAttempt(mission, attempt(mission.id), {
    at: 2_000, alive: true, connected: true, airborne: false, heading: 0,
    x: steps[0].x, z: steps[0].z, altitudeMeters: 0,
  });
  assert.equal(groundAcceptance.progress, 0);
  let state = initializeMissionAttempt(mission, attempt(mission.id), {
    at: 2_000, alive: true, connected: true, airborne: true, heading: 0,
    x: steps[0].x, z: steps[0].z, altitudeMeters: 300,
  });
  assert.equal(state.progress, 1, 'airborne acceptance uses the current authoritative position');
  state = advanceMission(mission, state, flight(2_100, steps[2].x!, steps[2].z!, 300)).attempt;
  assert.equal(state.progress, 1, 'Canal District cannot complete before Metro Central');
  state = advanceMission(mission, state, flight(2_200, steps[3].x!, steps[3].z!, 300)).attempt;
  assert.equal(state.progress, 1, 'South Metro cannot complete before Metro Central');
  state = advanceMission(mission, state, flight(2_300, steps[1].x!, steps[1].z!, 300)).attempt;
  assert.equal(state.progress, 2);
  state = advanceMission(mission, state, flight(2_400, steps[3].x!, steps[3].z!, 300)).attempt;
  assert.equal(state.progress, 2, 'South Metro cannot complete before Canal District');
  for (let index = 2; index <= 7; index += 1) {
    state = advanceMission(mission, state, flight(3_000 + index * 1_000, steps[index].x!, steps[index].z!, 300)).attempt;
  }
  assert.equal(state.progress, 8);
  state = advanceMission(mission, state, flight(12_000, 0, 0, 18_287)).attempt;
  assert.equal(state.progress, 8);
  state = advanceMission(mission, state, flight(13_000, 0, 0, 18_288)).attempt;
  assert.equal(state.progress, 9);
  state = advanceMission(mission, state, flight(14_000, 0, 0, 200, 3_000)).attempt;
  assert.equal(state.distanceMeters, 3_000);
  state = advanceMission(mission, state, { type: 'landing', at: 14_500, airportId: 'love', quality: 800, controlledTerritories: new Set() }).attempt;
  assert.equal(state.distanceMeters, 0);
  state = advanceMission(mission, state, flight(15_000, 0, 0, 200, 3_500)).attempt;
  state = advanceMission(mission, state, flight(16_000, 0, 0, 305, 500)).attempt;
  assert.equal(state.distanceMeters, 0, 'climbing above 1,000 ft resets low-flight distance');
  state = advanceMission(mission, state, flight(17_000, 0, 0, 200, 3_000)).attempt;
  state = advanceMission(mission, state, flight(18_000, 0, 0, 200, 3_000)).attempt;
  assert.equal(state.progress, 10);
  const downtown = steps[10];
  state = advanceMission(mission, state, flight(20_000, downtown.x!, downtown.z!, 120)).attempt;
  state = advanceMission(mission, state, flight(24_000, 5_000, 5_000, 120)).attempt;
  assert.equal(state.holdStartedAt, undefined, 'leaving Downtown resets the low-pass timer');
  state = advanceMission(mission, state, flight(25_000, downtown.x!, downtown.z!, 120)).attempt;
  const reset = advanceMission(mission, state, { type: 'lostFlight', at: 27_000 }).attempt;
  assert.equal(reset.holdStartedAt, undefined, 'death resets the low-pass timer');
  state = advanceMission(mission, reset, flight(28_000, downtown.x!, downtown.z!, 120)).attempt;
  const completed = advanceMission(mission, state, flight(34_000, downtown.x!, downtown.z!, 120));
  assert.equal(completed.completed, true);
  assert.equal(completed.attempt.progress, 11);
});

test('Dallas Grand Tour abandon, reward, and replay cooldown use the shared mission store', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-grand-tour-'));
  try {
    const store = new PlayerProfileStore(join(directory, 'profiles.sqlite'));
    const pilot = store.getOrCreate('pilot-grand-tour-00001', 'Grand Tour Pilot');
    const accepted = store.acceptMission(pilot.pilotId, 'dallas', 'dallas-grand-tour', false, undefined, 1_000);
    const firstAttempt = accepted.profile!.missions.dallas!.active!;
    const abandoned = store.abandonMission(pilot.pilotId, 'dallas', firstAttempt.attemptId)!;
    assert.equal(abandoned.credits, pilot.credits);
    assert.equal(abandoned.missions.dallas!.completions['dallas-grand-tour'], undefined);
    const replay = store.acceptMission(pilot.pilotId, 'dallas', 'dallas-grand-tour', false, undefined, 2_000);
    const reward = store.completeMission(pilot.pilotId, 'dallas', replay.profile!.missions.dallas!.active!.attemptId, 3_000)!;
    assert.deepEqual([reward.credits, reward.score], [2_000, 2_500]);
    assert.equal(store.acceptMission(pilot.pilotId, 'dallas', 'dallas-grand-tour', false, undefined, 3_001).ok, false);
    assert.equal(store.acceptMission(pilot.pilotId, 'dallas', 'dallas-grand-tour', false, undefined, 1_803_000).ok, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('#1 Pilot requires five continuous minutes with two total connected humans', () => {
  const mission = missionForCity('dallas', 'number-one-pilot')!;
  assert.deepEqual([mission.creditReward, mission.scoreReward, mission.replayCooldownMs], [15_000, 20_000, 60_000]);
  assert.equal(pilotXpRewards.mission[mission.difficulty], 250);
  assert.equal(mission.requirements.minimumHumanPlayers, 2);
  assert.equal(mission.requirements.durationSeconds, 300);
  const tick = (at: number, overrides: Partial<{ alive: boolean; connected: boolean; scoreRank: number; humanCount: number; score: number }> = {}) => ({
    type: 'tick' as const, at, alive: true, connected: true, airborne: true, controlledTerritories: new Set<string>(),
    scoreRank: 1, humanCount: 2, score: 100, ...overrides,
  });
  let state = advanceMission(mission, attempt(mission.id), tick(1_000)).attempt;
  state = advanceMission(mission, state, tick(300_999)).attempt;
  assert.equal(state.progress, 299);
  assert.equal(advanceMission(mission, state, tick(301_000)).completed, true);
  for (const overrides of [{ scoreRank: 2 }, { alive: false }, { connected: false }, { score: 0 }, { humanCount: 1 }]) {
    const progressed = advanceMission(mission, advanceMission(mission, attempt(mission.id), tick(1_000)).attempt, tick(121_000)).attempt;
    const reset = advanceMission(mission, progressed, tick(122_000, overrides)).attempt;
    assert.equal(reset.progress, 0);
    assert.equal(reset.holdStartedAt, undefined);
  }
  const disconnected = advanceMission(mission, state, { type: 'disconnect', at: 302_000 }).attempt;
  assert.equal(disconnected.progress, 0);
  assert.equal(disconnected.holdStartedAt, undefined);
});

test('current ownership initializes immediately and three-territory hold resets on loss', () => {
  const sequence = missionForCity('dallas', 'three-territory-offensive')!;
  const required = sequence.requirements.requiredTerritoryIds!;
  const tick = (controlledTerritories: ReadonlySet<string>, at = 3_000) => ({ type: 'tick' as const, at, alive: true, connected: true, airborne: true, controlledTerritories, scoreRank: 1, humanCount: 2, score: 20 });
  for (let owned = 0; owned <= 3; owned += 1) {
    const initial = advanceMission(sequence, attempt(sequence.id), tick(new Set(required.slice(0, owned)))).attempt;
    assert.equal(initial.ownedTerritoryIds?.length, owned);
    assert.equal(initial.holdStartedAt, owned === 3 ? 3_000 : undefined);
  }
  let chain = advanceMission(sequence, attempt(sequence.id), tick(new Set(required))).attempt;
  chain = advanceMission(sequence, chain, tick(new Set(required), 423_000)).attempt;
  assert.equal(chain.progress, 420);
  chain = advanceMission(sequence, chain, tick(new Set(required.slice(0, 2)), 424_000)).attempt;
  assert.equal(chain.progress, 0);
  assert.equal(chain.holdStartedAt, undefined);
  chain = advanceMission(sequence, chain, tick(new Set(required), 425_000)).attempt;
  assert.equal(chain.progress, 0);
  assert.equal(advanceMission(sequence, chain, tick(new Set(required), 1_024_000)).completed, false);
  assert.equal(advanceMission(sequence, chain, tick(new Set(required), 1_025_000)).completed, true);
});

test('hold attempt persists, but disconnect cannot accrue offline time', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-hold-'));
  try {
    const path = join(directory, 'profiles.sqlite');
    const store = new PlayerProfileStore(path);
    const pilot = store.getOrCreate('pilot-hold-owner-00001', 'Hold Owner');
    const accepted = store.acceptMission(pilot.pilotId, 'dallas', 'three-territory-offensive', false, undefined, 1_000).profile!.missions.dallas!.active!;
    const mission = missionForCity('dallas', accepted.missionId)!;
    const owned = new Set(mission.requirements.requiredTerritoryIds);
    const tick = (at: number) => ({ type: 'tick' as const, at, alive: true, connected: true, airborne: true, controlledTerritories: owned, scoreRank: 1, humanCount: 2, score: 20 });
    const started = advanceMission(mission, accepted, tick(2_000)).attempt;
    const progressed = advanceMission(mission, started, tick(122_000)).attempt;
    store.updateMissionAttempt(pilot.pilotId, 'dallas', progressed);
    const restored = new PlayerProfileStore(path).getOrCreate(pilot.pilotId, 'Hold Owner').missions.dallas!.active!;
    assert.equal(restored.attemptId, accepted.attemptId);
    assert.equal(restored.progress, 120);
    assert.deepEqual(restored.ownedTerritoryIds, [...owned]);
    const disconnected = advanceMission(mission, restored, { type: 'disconnect', at: 123_000 }).attempt;
    assert.equal(disconnected.progress, 0);
    assert.equal(disconnected.holdStartedAt, undefined);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('airport empire requires controlled landings and conquest needs every configured territory', () => {
  const tick = (controlledTerritories: ReadonlySet<string>) => ({ type: 'tick' as const, at: 3_000, alive: true, connected: true, airborne: true, controlledTerritories, scoreRank: 1, humanCount: 2, score: 20 });

  const core = missionForCity('dallas', 'core-dallas-takeover')!;
  assert.deepEqual([core.creditReward, core.scoreReward, core.replayCooldownMs], [5_000, 6_500, 60_000]);
  const coreOwned = new Set(core.requirements.territoryIds);
  const coreStarted = advanceMission(core, attempt(core.id), tick(coreOwned)).attempt;
  assert.equal(coreStarted.progress, 0);
  assert.equal(advanceMission(core, coreStarted, { ...tick(coreOwned), at: 902_999 }).completed, false);
  assert.equal(advanceMission(core, coreStarted, { ...tick(coreOwned), at: 903_000 }).completed, true);

  const empire = missionForCity('dallas', 'airport-empire')!;
  assert.deepEqual([empire.creditReward, empire.scoreReward, empire.replayCooldownMs], [6_000, 7_500, 60_000]);
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
  assert.deepEqual([conquestSource.creditReward, conquestSource.scoreReward, conquestSource.replayCooldownMs], [10_000, 12_500, 60_000]);
  const required = territoriesForCity('dallas').map((territory) => territory.id);
  const conquest = { ...conquestSource, requirements: { ...conquestSource.requirements, requiredTerritoryIds: required } };
  assert.equal(advanceMission(conquest, attempt(conquest.id), tick(new Set(required.slice(0, -1)))).completed, false);
  assert.equal(advanceMission(conquest, attempt(conquest.id), tick(new Set(required))).completed, true);
});
