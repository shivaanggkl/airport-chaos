import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cityMissionCatalog } from '../../shared/city-missions.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { advanceMission } from './mission-engine.js';
import { PlayerProfileStore, type MissionAttempt } from './player-profiles.js';

type DallasMission = (typeof cityMissionCatalog.dallas)[number];

const territoryIds = territoriesForCity('dallas').map(({ id }) => id);
const territoryIdSet = new Set(territoryIds);
const territoryMissionTypes = new Set(['territoryHold', 'territoryOwn', 'territorySequence', 'territoryUniqueKills', 'airportEmpire']);
const territoryMissions = cityMissionCatalog.dallas.filter((mission) =>
  territoryMissionTypes.has(mission.type) || mission.requirements.steps?.some((step) => step.kind === 'area' || step.kind === 'areaHold'));

function attempt(missionId: string): MissionAttempt {
  return { missionId, attemptId: '00000000-0000-4000-8000-000000000001', startedAt: 1_000, updatedAt: 1_000, progress: 0, completedIds: [] };
}

function resolvedMission(mission: DallasMission): DallasMission {
  return mission.requirements.allCityTerritories
    ? { ...mission, requirements: { ...mission.requirements, requiredTerritoryIds: territoryIds } }
    : mission;
}

function requiredIds(mission: DallasMission): readonly string[] {
  const resolved = resolvedMission(mission);
  return resolved.requirements.requiredTerritoryIds ?? resolved.requirements.territoryIds ?? [];
}

function tick(at: number, controlledTerritories: ReadonlySet<string>, alive = true, connected = true) {
  return { type: 'tick' as const, at, alive, connected, airborne: true, controlledTerritories, scoreRank: 1, humanCount: 2, score: 100 };
}

test('the live catalog exposes every current territory-reading mission to this regression matrix', () => {
  assert.deepEqual(territoryMissions.map(({ id }) => id), [
    'south-metro-capture', 'canal-capture', 'metro-central-capture', 'central-stronghold',
    'two-zone-control', 'airport-control', 'three-territory-offensive', 'central-air-supremacy',
    'core-dallas-takeover', 'airport-empire', 'dallas-conquest', 'dallas-grand-tour',
  ]);
  for (const mission of territoryMissions) {
    const ids = [
      ...requiredIds(mission),
      ...(mission.requirements.steps ?? []).filter((step) => step.kind === 'area').map((step) => step.id),
    ];
    assert.equal(new Set(requiredIds(mission)).size, requiredIds(mission).length, `${mission.id} repeats a required territory`);
    for (const id of ids) assert.ok(territoryIdSet.has(id), `${mission.id} references missing territory ${id}`);
    for (const step of (mission.requirements.steps ?? []).filter((candidate) => candidate.kind === 'areaHold')) {
      assert.ok(territoriesForCity('dallas').some((territory) => JSON.stringify(territory.bounds) === JSON.stringify(step.bounds)), `${mission.id} area hold is detached from authoritative territory geometry`);
    }
  }
});

test('every territory mission can be accepted before entry with zero manufactured progress', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-chaos-territory-acceptance-'));
  try {
    const store = new PlayerProfileStore(join(directory, 'profiles.sqlite'));
    territoryMissions.forEach((mission, index) => {
      const pilot = store.getOrCreate(`pilot-territory-${String(index).padStart(5, '0')}`, `Territory Pilot ${index}`);
      const accepted = store.acceptMission(pilot.pilotId, 'dallas', mission.id, false, undefined, 2_000);
      assert.equal(accepted.ok, true, mission.id);
      assert.equal(accepted.profile!.missions.dallas!.active!.progress, 0, mission.id);
      assert.deepEqual(accepted.profile!.missions.dallas!.active!.completedIds, [], mission.id);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('all territory holds count already-owned IDs, continue through contest, and reset only on authoritative loss', () => {
  const holds = territoryMissions.filter((mission) => mission.type === 'territoryHold');
  assert.equal(holds.length, 7);
  for (const source of holds) {
    const mission = resolvedMission(source);
    const required = requiredIds(mission);
    const owned = new Set(required);
    const duration = mission.requirements.holdDurationSeconds ?? mission.requirements.durationSeconds!;
    let state = advanceMission(mission, attempt(mission.id), tick(2_000, new Set()));
    assert.equal(state.attempt.progress, 0, mission.id);
    state = advanceMission(mission, state.attempt, tick(3_000, owned));
    assert.equal(state.attempt.holdStartedAt, 3_000, `${mission.id} did not initialize from current ownership`);
    state = advanceMission(mission, state.attempt, tick(3_000 + Math.floor(duration / 2) * 1_000, owned));
    assert.equal(state.attempt.progress, Math.floor(duration / 2), `${mission.id} did not continue while controller ownership remained`);
    state = advanceMission(mission, state.attempt, tick(4_000 + Math.floor(duration / 2) * 1_000, new Set(required.slice(0, -1))));
    assert.equal(state.attempt.progress, 0, `${mission.id} did not reset on ownership loss`);
    assert.equal(state.attempt.holdStartedAt, undefined, mission.id);
    state = advanceMission(mission, state.attempt, tick(5_000 + Math.floor(duration / 2) * 1_000, owned));
    const completed = advanceMission(mission, state.attempt, tick(5_000 + Math.floor(duration / 2) * 1_000 + duration * 1_000, owned));
    assert.equal(completed.completed, true, `${mission.id} did not complete after reclaim and a fresh hold`);
    const death = advanceMission(mission, completed.attempt, { type: 'lostFlight', at: completed.attempt.updatedAt + 1 });
    assert.equal(death.attempt.progress, 0, `${mission.id} did not reset on death`);
    const disconnected = advanceMission(mission, state.attempt, { type: 'disconnect', at: state.attempt.updatedAt + 1 });
    assert.equal(disconnected.attempt.progress, 0, `${mission.id} did not reset on disconnect`);
  }
});

test('ownership missions count each configured territory once and reject partial sets', () => {
  const missions = territoryMissions.filter((mission) => mission.type === 'territoryOwn');
  assert.deepEqual(missions.map(({ id }) => id), ['airport-control', 'dallas-conquest']);
  for (const source of missions) {
    const mission = resolvedMission(source);
    const required = requiredIds(mission);
    const duplicatedInput = new Set([...required, ...required, ...required]);
    const complete = advanceMission(mission, attempt(mission.id), tick(2_000, duplicatedInput));
    assert.equal(complete.completed, true, mission.id);
    assert.equal(complete.attempt.progress, required.length, `${mission.id} double-counted a territory`);
    assert.deepEqual(complete.attempt.completedIds, required, mission.id);
    const partial = advanceMission(mission, complete.attempt, tick(3_000, new Set(required.slice(0, -1))));
    assert.equal(partial.completed, false, mission.id);
    assert.equal(partial.attempt.progress, required.length - 1, mission.id);
  }
});

test('territory kill and airport-empire progress preserve uniqueness and obey ownership loss', () => {
  const supremacy = resolvedMission(territoryMissions.find(({ id }) => id === 'central-air-supremacy')!);
  const central = new Set(requiredIds(supremacy));
  let kills = attempt(supremacy.id);
  for (const targetId of ['one', 'one', 'two', 'three']) {
    kills = advanceMission(supremacy, kills, { type: 'kill', at: 3_000, targetId, isBot: false, valid: true, controlledTerritories: central }).attempt;
  }
  assert.equal(kills.progress, 3);
  assert.deepEqual(kills.completedIds, ['one', 'two', 'three']);
  kills = advanceMission(supremacy, kills, tick(4_000, new Set())).attempt;
  assert.equal(kills.progress, 0);
  assert.deepEqual(kills.completedIds, []);

  const empire = resolvedMission(territoryMissions.find(({ id }) => id === 'airport-empire')!);
  const owned = new Set(requiredIds(empire));
  let landings = attempt(empire.id);
  for (const airportId of ['dfw', 'dfw', 'love', 'addison', 'executive']) {
    landings = advanceMission(empire, landings, { type: 'landing', at: 5_000, airportId, quality: 900, controlledTerritories: owned }).attempt;
  }
  assert.equal(landings.progress, 4);
  assert.deepEqual(landings.completedIds, ['dfw', 'love', 'addison', 'executive']);
  const lost = advanceMission(empire, landings, tick(6_000, new Set())).attempt;
  assert.equal(lost.progress, 0);
  assert.deepEqual(lost.completedIds, []);
});

test('capture, contest, death, reconnect, rewards, records, and notices retain their server-authoritative paths', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(server, /const captureTerritoryByPlayer = new Map\(activePlayers\.map/);
  assert.match(server, /primaryTerritoryAt\(definitions, player\.position\)\?\.id/);
  assert.match(server, /const contested = contenders\.length > 1;/);
  assert.match(server, /if \(contested\) \{[\s\S]*?continue;\n\s*\}/);
  assert.match(server, /territory\.controllerId = playerId;[\s\S]*?missionSignal\(playerId, \{ type: 'territoryCapture'/);
  assert.match(server, /function controlledTerritoryIds[\s\S]*?state\.controllerId === playerId/);
  assert.match(server, /removeTerritoryContribution\(victimId\);/);
  assert.match(server, /removeTerritoryContribution\(playerId, true\);/);
  assert.match(server, /missionSignal\(playerId, \{ type: 'disconnect'/);
  assert.match(server, /recordObjectiveActivity\(playerId, 'territoryCapture'\)/);
  assert.match(server, /updatePersonalRecord\(player\.pilotId, 'most_territories', controlledTerritoryIds\(playerId, player\.cityId\)\.size/);
  assert.match(main, /message\.kind === 'exit' \? `LEFT \$\{territory\.displayName\.toUpperCase\(\)\}`[\s\S]*?`ENTERED \$\{territory\.displayName\.toUpperCase\(\)\}`/);
});

test('Map, Radar, Players/Territories panel, and world walls share stable territory IDs and bounds', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../../client/src/world-map.ts', import.meta.url), 'utf8');
  assert.match(main, /function drawRadarTerritories[\s\S]*?definition\.bounds/);
  assert.match(main, /territories: territoryDefinitions\.map[\s\S]*?id: definition\.id,[\s\S]*?bounds: definition\.bounds/);
  assert.match(main, /const territories = territoryDefinitions\.map[\s\S]*?ownedByYou:/);
  assert.match(main, /new THREE\.Mesh\(createTerritoryWallGeometry\(definition\), territoryWallMaterial\)/);
  assert.match(map, /territory\.bounds\.minX[\s\S]*territory\.bounds\.maxZ/);
});
