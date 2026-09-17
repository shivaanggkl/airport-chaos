import test from 'node:test';
import assert from 'node:assert/strict';
import { MomentStore, momentShareText } from '../../shared/moments.mjs';

test('moment store is bounded and suppresses rapid duplicates', () => {
  const store = new MomentStore(2,8_000); const base={cityId:'dallas',aircraftType:'trainer',title:'PERFECT LANDING',statLine:'943/1000',screenshotEligible:true} as const;
  assert.ok(store.add({...base,type:'perfect_landing',timestamp:10_000})); assert.equal(store.add({...base,type:'perfect_landing',timestamp:12_000}),undefined);
  assert.ok(store.add({...base,type:'near_miss',timestamp:13_000})); assert.ok(store.add({...base,type:'crash',timestamp:14_000})); assert.equal(store.list().length,2);
});
test('share text stays compact and uses canonical URL',()=>{const text=momentShareText('storm_landing','950/1000');assert.match(text,/fly\.vadensoftware\.com/);assert.ok(text.length<180);});
