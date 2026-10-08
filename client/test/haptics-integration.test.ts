import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('actual menu and selection handlers call the centralized manager', () => {
  const hub = source('bootstrap.ts');
  const menu = source('pilot-menu.ts');
  const flight = source('main.ts');
  const journey = source('mission-journey.ts');
  const garage = source('garage.ts');
  const store = source('game-store.ts');
  assert.match(hub, /fly: \(\) => \{ hapticsManager\.emit\('selection'\)/);
  assert.match(hub, /store: \(\) => \{ hapticsManager\.emit\('selection'\)/);
  assert.match(hub, /button\.addEventListener\('click', \(\) => \{\s*hapticsManager\.emit\('selection'\);\s*try \{ localStorage\.setItem\(`airport-chaos-time/);
  assert.match(journey, /data-mission-play[\s\S]{0,150}hapticsManager\.emit\('confirmation'\)/);
  assert.match(journey, /if \(userSelected\) \{ this\.userSelectedStage = true; hapticsManager\.emit\('selection'\)/);
  assert.match(garage, /this\.selected !== type\) \{ hapticsManager\.emit\('selection'\)/);
  assert.match(store, /setCategory\(category: StoreCategory\)[\s\S]{0,130}hapticsManager\.emit\('selection'\)/);
  assert.match(menu, /HAPTICS: UNAVAILABLE ON WEB/);
  for (const entry of [hub, flight]) {
    assert.match(entry, /haptics: \{ available: hapticsManager\.isAvailable\(\), enabled: hapticsManager\.isEnabled\(\)/);
    assert.match(entry, /hapticsManager\.setEnabled\(!hapticsManager\.isEnabled\(\)\)/);
  }
});

test('confirmed gameplay, purchases, and claims trigger feedback while continuous controls do not', () => {
  const hub = source('bootstrap.ts');
  const flight = source('main.ts');
  assert.match(hub, /if \(!response\.ok\) return \{ ok: false[\s\S]{0,400}hapticsManager\.emit\('rewardSuccess', `store:/);
  assert.match(hub, /hapticsManager\.emit\('rewardSuccess', `daily:/);
  assert.match(flight, /emitConfirmedJourneyFeedback\(hapticsManager, previousAttempt, message\.attempt\)/);
  assert.match(flight, /message\.playerId === localPlayerId\) \{\s*applyLocalHull\(message\.health, message\.maxHealth\);\s*if \(message\.health > 0\) hapticsManager\.emit\('damage'\)/);
  assert.match(flight, /message\.killerId === localPlayerId && message\.cause !== 'collision'[\s\S]{0,350}hapticsManager\.emit\('destruction', message\.playerId\)/);
  assert.doesNotMatch(source('mobile-input.ts'), /hapticsManager|Haptics\./);
  assert.doesNotMatch(source('haptics-manager.ts'), /navigator\.vibrate|setInterval/);
});
