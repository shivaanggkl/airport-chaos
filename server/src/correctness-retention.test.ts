import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { killNotice } from '../../shared/kill-notice.mjs';
import { cityDefinition } from '../../shared/city-registry.mjs';
import { economyRewards } from '../../shared/reward-economy.mjs';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { PlayerProfileStore } from './player-profiles.js';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const store = () => new PlayerProfileStore(join(mkdtempSync(join(tmpdir(), 'airport-retention-')), 'profiles.sqlite'));

test('server kill identities render correctly for attacker, victim, and observer', () => {
  const event = { playerId: 'victim-id', killerId: 'attacker-id', killerDisplayName: 'Ace', victimDisplayName: 'Blaze' };
  assert.equal(killNotice(event, 'attacker-id'), 'DESTROYED: Blaze');
  assert.equal(killNotice(event, 'victim-id'), 'DESTROYED BY: Ace');
  assert.equal(killNotice(event, 'observer-id'), 'Ace destroyed Blaze');
  assert.equal(killNotice({ ...event, victimDisplayName: 'AI Pilot' }, 'attacker-id'), 'DESTROYED: AI Pilot');
  const server = read('server/src/index.ts');
  assert.match(server, /victimDisplayName: victim\.displayName/);
  assert.match(server, /victimDisplayName: first\.displayName/);
});

test('exit flight and city guide behavior remains available without cluttering active-flight menu navigation', () => {
  const menu = read('client/src/pilot-menu.ts');
  const main = read('client/src/main.ts');
  assert.doesNotMatch(menu, /label: 'EXIT FLIGHT'|label: 'CITY GUIDE'/);
  assert.match(main, /function openCityGuide\(\)/);
  assert.match(main, /flightExitButtonElement\.addEventListener\('click', \(\) => requestFlightExit\(\)\)/);
  assert.match(main, /Current mission progress will be abandoned\./);
  assert.match(main, /abandonMission: \{ cityId: missionCityId, expectedAttemptId: activeMission\.attemptId \}/);
  assert.match(main, /latest\.pilotId !== serverProfile\.pilotId \|\| profileActiveMissionAttempt\(latest\)/);
  assert.match(main, /closingSocket\.addEventListener\('close'/);
  assert.match(main, /url\.searchParams\.delete\(CITY_QUERY_PARAM\)/);
  assert.equal(cityDefinition('dallas')?.briefing?.title, 'DALLAS OPERATIONS');
  assert.match(cityDefinition('dallas')?.briefing?.summary ?? '', /contracts, capture territories, fight rivals/);
  assert.ok(cityDefinition('milwaukee')?.briefing);
  assert.match(main, /if \(guidedTutorialActive \|\| trainingRequested\) return;/);
});

test('passive distance keeps its existing reward and only persisted credit receipts are displayed', () => {
  assert.equal(economyRewards.distanceBatchMeters, 10_000);
  assert.equal(economyRewards.distanceBatchCredits, 5);
  assert.equal(economyRewards.landing, 75);
  const main = read('client/src/main.ts');
  assert.match(main, /reconcileCreditSnapshot\(serverProfile\.credits, serverProfile\.creditRevision/);
  assert.match(main, /queueRewardFeedback\(creditUpdate\.toastDelta\)/);
  assert.doesNotMatch(main, /silentDistanceCredits|pendingProfileCredits/);
});

test('Firehawk repeat-failure eligibility is durable, capped, and ownership-aware', () => {
  const db = store();
  db.getOrCreate('pilot-a', 'Pilot A');
  const now = Date.UTC(2026, 8, 30);
  assert.equal(db.recordFirehawkMissionFailure('pilot-a', 'ace-intercept', now), false);
  assert.equal(db.claimFirehawkPromotion('pilot-a', 'ace-intercept', now), undefined);
  assert.equal(db.recordFirehawkMissionFailure('pilot-a', 'ace-intercept', now + 1_000), true);
  assert.deepEqual(db.claimFirehawkPromotion('pilot-a', 'ace-intercept', now + 2_000), { trialEligible: true });
  assert.deepEqual(db.claimFirehawkPromotion('pilot-a', 'ace-intercept', now + 3_000), { trialEligible: true });
  assert.equal(db.claimFirehawkPromotion('pilot-a', 'ace-intercept', now + 4_000), undefined);
  assert.equal(db.claimFirehawkPromotion('pilot-a', 'other-mission', now + 4_000), undefined);
  db.getOrCreate('pilot-b', 'Pilot B');
  db.recordFirehawkMissionFailure('pilot-b', 'ace-intercept', now);
  db.recordFirehawkMissionFailure('pilot-b', 'ace-intercept', now + 1_000);
  db.grantAircraftEntitlements('pilot-b', ['fighter'], 'test:owned');
  assert.equal(db.claimFirehawkPromotion('pilot-b', 'ace-intercept', now + 2_000), undefined);
  assert.equal(firehawkProduct.displayPrice, '$24.00');
});

test('native-only web placement uses a safe external link and no flight popup', () => {
  const menu = read('client/src/pilot-menu.ts');
  const main = read('client/src/main.ts');
  const bootstrap = read('client/src/bootstrap.ts');
  assert.match(menu, /if \(data\.nativeWebPromotion && account\.state === 'account'\)/);
  assert.match(menu, /externalLink\('fly\.vadensoftware\.com', 'https:\/\/fly\.vadensoftware\.com'\)/);
  assert.match(menu, /link\.rel = 'noopener noreferrer'/);
  assert.match(main, /nativeWebPromotion: nativePurchaseProvider !== undefined/);
  assert.match(bootstrap, /nativeWebPromotion: nativePurchaseProvider !== undefined/);
});
