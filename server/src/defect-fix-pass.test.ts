import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatPilotAltitude, formatRelativeAltitude } from '../../shared/multiplayer-altitude.mjs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('multiplayer altitude uses compact flight-readable formatting', () => {
  assert.equal(formatPilotAltitude(1_005), '3300');
  assert.equal(formatPilotAltitude(4_267), '14K');
  assert.equal(formatRelativeAltitude(915), '▲ +3K');
  assert.equal(formatRelativeAltitude(-610), '▼ -2K');
  assert.equal(formatRelativeAltitude(50), '');
});

test('authoritative altitude is emitted by the server and used by roster and radar', () => {
  const server = read('server/src/index.ts');
  const main = read('client/src/main.ts');
  const players = read('client/src/players-panel.ts');
  assert.match(server, /altitudeMeters: Math\.max\(0, player\.position\.y - botTerrainHeight/);
  assert.match(main, /formatRelativeAltitude\(track\.altitudeMeters - altitudeAboveTerrain\(\)\)/);
  assert.match(players, /formatPilotAltitude\(player\.altitudeMeters\)/);
});

test('perfect landing survives network latency and exposes the sweep over the recap', () => {
  const main = read('client/src/main.ts');
  const director = read('client/src/cinematic-director.ts');
  assert.match(main, /flightState === 'LANDED' \|\| flightState === 'TAXI'/);
  assert.match(main, /flightRecapElement\.hidden = true/);
  assert.match(main, /lerp\(2\.35, 1\.79, cinematicFrame\.eased\)/);
  assert.match(director, /next\.kind === 'PERFECT_LANDING' \? 6_000 : 2_500/);
});

test('mission HUD routes to the canonical menu and credits render from profile deltas only', () => {
  const main = read('client/src/main.ts');
  const menu = read('client/src/pilot-menu.ts');
  const challenges = read('client/src/sky-challenges.ts');
  const stunts = read('client/src/stunt-combo.ts');
  assert.match(main, /openActiveMissionFromHud[\s\S]*openPilotMenu\('MISSIONS'\)[\s\S]*pilotMenu\.focusMission/);
  assert.match(menu, /active\.dataset\.missionId = current\.id/);
  const creditCalls = [...main.matchAll(/queueRewardFeedback\(([^\n]*)/g)].map((match) => match[1]);
  assert.ok(creditCalls.every((call) => call.startsWith('0,') || call.startsWith('creditDelta') || call.includes('silentDistanceCredits')));
  assert.match(main, /queueRewardFeedback\(earnedCredits \+ silentDistanceCredits, 0, creditReason/);
  assert.doesNotMatch(main, /DESTROYED \+\$\{message\.killerReward\}/);
  assert.doesNotMatch(challenges, /\+\$\{totalReward\} CREDITS/);
  assert.doesNotMatch(stunts, /\+\$\{credits\} CREDITS/);
});

test('audio lifecycle has one coalesced foreground recovery and one gesture fallback', () => {
  const audio = read('client/src/audio-manager.ts');
  assert.match(audio, /private lifecycleResume: Promise<void> \| null = null/);
  assert.match(audio, /private lifecycleRecoveryTimer: number \| null = null/);
  assert.match(audio, /private async recoverAfterForeground\(source: string\)/);
  assert.match(audio, /this\.resumeContext\(context, source\)/);
  assert.match(audio, /this\.rebuildContext\(/);
  assert.match(audio, /resumeFallbackArmed = true/);
  assert.match(audio, /this\.restoreLogicalAudioState\(\)/);
  assert.match(audio, /this\.stopEngineSource\(\)/);
});
