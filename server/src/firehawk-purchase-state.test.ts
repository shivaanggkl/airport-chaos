import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { PlayerProfileStore } from './player-profiles.js';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const store = () => new PlayerProfileStore(join(mkdtempSync(join(tmpdir(), 'airport-firehawk-state-')), 'profiles.sqlite'));

test('Firehawk uses the live premium purchase UI in every ownership and store state', () => {
  const garage = read('client/src/garage.ts');
  const stalePurchaseCopy = new RegExp(['purchase', 'coming', 'soon'].join('\\s+'), 'i');

  assert.doesNotMatch(garage, stalePurchaseCopy);
  assert.match(garage, /definition\.access === 'premium' \? 'UNLOCK FIREHAWK'/);
  assert.match(garage, /`\$\{firehawkProduct\.displayPrice\} — PERMANENT UNLOCK`/);
  assert.match(garage, /this\.nativeStorePrice \? `UNLOCK FOREVER — \$\{this\.nativeStorePrice\}` : 'STORE UNAVAILABLE'/);
  assert.match(garage, /buy\.hidden = owned/);
  assert.match(garage, /restore\.textContent = this\.nativeStore \? 'RESTORE PURCHASES' : 'RESTORE PURCHASE'/);
  assert.match(garage, /START FREE TRIAL/);
  assert.match(garage, /'Trial: ready on next flight'/);
  assert.match(garage, /'Trial: already used'/);
  assert.match(garage, /this\.selected === this\.profile\.selectedAircraft \? 'EQUIPPED' : owned \? 'EQUIP'/);
  assert.equal(firehawkProduct.displayPrice, '$24.00');
  assert.equal(firehawkProduct.amountCents, 2_400);
  assert.equal(firehawkProduct.entitlement, 'REDSPEAR_FIGHTER_PREMIUM');
});

test('Firehawk stays unavailable for Credits while premium entitlement remains authoritative', () => {
  const profiles = store();
  const pilotId = 'firehawk-state-pilot';
  const initial = profiles.getOrCreate(pilotId, 'Firehawk Pilot');
  profiles.awardServerReward(pilotId, 100_000);
  const creditsBefore = profiles.getOrCreate(pilotId, 'Firehawk Pilot').credits;

  const creditPurchase = profiles.purchaseAircraft(pilotId, 'fighter');
  assert.equal(creditPurchase.ok, false);
  assert.equal(creditPurchase.reason, 'PREMIUM AIRCRAFT — NOT AVAILABLE FOR CREDITS');
  assert.equal(profiles.getOrCreate(pilotId, 'Firehawk Pilot').credits, creditsBefore);
  assert.equal(initial.aircraftEntitlements.includes(firehawkProduct.entitlement), false);
  assert.equal(profiles.getOrCreate(pilotId, 'Firehawk Pilot').unlockedAircraft.includes('fighter'), false);

  const entitled = profiles.grantAircraftEntitlements(pilotId, ['fighter'], 'test:premium-purchase')!;
  assert.equal(entitled.aircraftEntitlements.includes(firehawkProduct.entitlement), true);
  assert.equal(entitled.unlockedAircraft.includes('fighter'), true);
  assert.equal(profiles.equipAircraft(pilotId, 'fighter')?.selectedAircraft, 'fighter');
});

test('Firehawk trial remains five minutes and separate from permanent ownership', () => {
  const profiles = store();
  const pilotId = 'firehawk-trial-pilot';
  profiles.getOrCreate(pilotId, 'Trial Pilot');

  const requested = profiles.requestFighterTrial(pilotId);
  assert.equal(requested.ok, true);
  assert.equal(requested.profile?.fighterTrial.status, 'pending');
  assert.equal(requested.profile?.aircraftEntitlements.includes(firehawkProduct.entitlement), false);

  const startedAt = 50_000;
  const active = profiles.activateFighterTrial(pilotId, startedAt)!;
  assert.equal(active.fighterTrial.status, 'active');
  assert.equal(active.fighterTrial.expiresAt, startedAt + 5 * 60_000);
  assert.equal(active.aircraftEntitlements.includes(firehawkProduct.entitlement), false);

  const consumed = profiles.consumeExpiredFighterTrial(pilotId, startedAt + 5 * 60_000)!;
  assert.equal(consumed.fighterTrial.status, 'consumed');
  assert.equal(consumed.unlockedAircraft.includes('fighter'), false);
});
