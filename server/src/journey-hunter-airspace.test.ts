import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { journeyDallas02 } from '../../shared/journey-mission.mjs';
import { boundJourneyHunterPoint, insideJourneyHunterArena, journeyHunterSteeringTarget, keepJourneyHunterInside } from './journey-hunter-airspace.js';

const { x, z } = journeyDallas02.arenaCenter;
const radius = journeyDallas02.arenaRadius;

test('the marked Hunter turns within Dallas and cannot cross the arena edge', () => {
  assert.equal(insideJourneyHunterArena({ x: x + radius, z }), true);
  assert.equal(insideJourneyHunterArena({ x: x + radius + 1, z }), false);
  assert.deepEqual(boundJourneyHunterPoint({ x: x + radius + 5_000, z: z - radius - 5_000 }),
    { x: x + radius - 3_000, z: z - radius + 3_000 });
  assert.deepEqual(journeyHunterSteeringTarget({ x: x + radius - 2_500, z }, { x: 1, z: 0 },
    { x: x + radius + 1_000, z }), { x, z });
  assert.deepEqual(journeyHunterSteeringTarget({ x: x + radius - 2_500, z }, { x: -1, z: 0 },
    { x: x + radius + 1_000, z }), { x: x + radius - 3_000, z });
  assert.deepEqual(keepJourneyHunterInside({ x: x + radius + 500, z: z - radius - 500 }),
    { x: x + radius - 20, z: z - radius + 20 });
});

test('Mission 2 pauses pursuit outside Dallas and resumes without invalidating the attempt', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /if \(!insideJourneyHunterArena\(pilot\.position\)\) return;/);
  assert.match(server, /if \(missionPilot && !insideJourneyHunterArena\(missionPilot\.position\)\)[\s\S]*?clearHunterCombat\(player, bot\);[\s\S]*?return \{ waypoint:/);
  assert.match(server, /bot\.journeyReturnGraceUntil = now \+ 30_000/);
  assert.doesNotMatch(server, /active\?\.missionId === journeyDallas02\.id[\s\S]{0,250}failPlayerJourney\(playerId, 'INVALID'/);
  assert.match(server, /bot\.journeyAttemptId \? 0\.014 : 0\.028/);
});

test('Mission 2 Hunter patrols downtown until a verified pilot lock or hit', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /const downtown = journeySpawn && !leaderSpawn && !journeySpawn\.recovery && !journeySpawn\.escape && !journeySpawn\.ace && !journeySpawn\.siege && !journeySpawn\.breakout && !journeySpawn\.crossfireOrdinal && !journeySpawn\.doubleOrdinal \? territoriesForCity\('dallas'\)\.find\(territory => territory\.id === 'downtown'\)/);
  assert.match(server, /if \(bot\.journeyAttemptId && !bot\.journeyProvoked\) \{\s*clearHunterCombat\(player, bot\);\s*return undefined;/);
  assert.match(server, /if \(targetId && !player\.isBot\) provokeJourneyHunter\(playerId, player, targetId, Date\.now\(\)\)/);
  assert.match(server, /if \(victim\.health > 0 && !owner\.isBot\) provokeJourneyHunter\(ownerId, owner, victimId, now\)/);
  assert.match(server, /attempt\.status !== 'RACING' \|\|\s*attempt\.targetId !== targetId && attempt\.secondaryTargetId !== targetId/);
  assert.match(server, /!current\.bot\?\.journeyProvoked \|\| Math\.hypot/);
  assert.doesNotMatch(server, /if \(journeySpawn\) beginHunterApproach/);
});

test('Mission 2 uses longer attack runs without changing ordinary Hunters', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /const beyond = bot\.journeyAttemptId \? 3_000 : 1_000/);
  assert.match(server, /const separation = bot\.journeyAttemptId \? 3_000 : Math\.max\(1_800/);
  assert.match(server, /bot\.journeyAttemptId \? 3_000 : hunterMinimumHorizontalSeparation/);
});
