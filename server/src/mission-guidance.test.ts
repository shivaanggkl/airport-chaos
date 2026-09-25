import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url), 'utf8');
const challenges = readFileSync(new URL('../../client/src/sky-challenges.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('mission acceptance exposes authoritative availability and retirement reasons', () => {
  assert.match(server, /definition\.retired[\s\S]*MISSION RETIRED/);
  assert.match(server, /definition\.type === 'humanKill'[\s\S]*REQUIRES ANOTHER HUMAN PILOT IN THIS CITY/);
  assert.match(server, /definition\.type === 'event'[\s\S]*ACE EVENT NOT CURRENTLY AVAILABLE[\s\S]*VIP EVENT NOT CURRENTLY AVAILABLE/);
  assert.match(main, /Requires another human pilot in this city\./);
  assert.match(menu, /Abandon the active mission first\./);
  assert.match(menu, /label: item\.retired \? 'RETIRED' : cooling \? 'COOLDOWN' : unavailableReason \? 'UNAVAILABLE'/);
});

test('mission targets reuse world, radar, map, and gate guidance paths', () => {
  assert.match(main, /TARGET: HUNTER/);
  assert.match(main, /ACE TARGET/);
  assert.match(main, /paintMissionEventMarker\(missionEventMarker[\s\S]*'VIP'/);
  assert.match(main, /drawRadarMarker\(direction[\s\S]*'mission'/);
  assert.match(main, /missionTarget: activeMission\?\.targetId === id/);
  assert.match(challenges, /setMissionGuidance\(id\?: string, gateIndex = 0\)/);
  assert.match(challenges, /completedMaterial[\s\S]*activeMaterial[\s\S]*inactiveMaterial/);
  assert.match(main, /missionLocationTarget[\s\S]*drawRadarMarker\(direction, missionLocation\.x, missionLocation\.z, 'mission', 'NEXT'\)/);
  assert.match(main, /missionLocationMarker[\s\S]*NEXT: \$\{locationTarget\.label\}/);
});

test('Wanted and precision landing guidance reflect authoritative mechanics', () => {
  assert.match(main, /DANGER \$\{localHeat\} \/ 5/);
  assert.match(main, /HUMAN TAKEDOWNS, STUNTS, NEAR MISSES, EVENT WINS, RISK BANKS, CONTESTED TERRITORY, OR FAST LOW FLIGHT/);
  assert.match(main, /TARGET 780\+/);
  assert.match(main, /SPEED[\s\S]*DESCENT[\s\S]*WINGS[\s\S]*NOSE[\s\S]*ALIGNMENT/);
  assert.match(main, /LAST \$\{landingResult\.quality\}\/1000/);
});

test('Grand Tour, Central Air Supremacy, and #1 Pilot expose compact live progress', () => {
  assert.match(main, /DALLAS GRAND TOUR — STEP/);
  assert.match(main, /LOW FLIGHT:/);
  assert.match(main, /DOWNTOWN LOW PASS:/);
  assert.match(main, /CENTRAL CONTROLLED:/);
  assert.match(main, /KILLS:/);
  assert.match(main, /#1 HOLD:/);
  assert.match(main, /NEED \$\{requirement\} TOTAL CONNECTED HUMAN PILOTS/);
});
