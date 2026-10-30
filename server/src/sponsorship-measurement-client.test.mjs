import assert from 'node:assert/strict';
import test from 'node:test';
import { SponsorExposureEpisode } from '../../client/src/sponsorship-measurement.js';
import { AdPlacementManager } from '../../client/src/ad-placement.js';
import { Scene } from 'three';

test('P6 episode rules require one second, three seconds out, and 30-second separation', () => {
  const episode = new SponsorExposureEpisode();
  assert.equal(episode.update(true, 0), false);
  assert.equal(episode.update(true, 999), false);
  assert.equal(episode.update(true, 1000), true);
  assert.equal(episode.update(true, 31_000), false);
  episode.update(false, 31_100);
  assert.equal(episode.update(true, 33_000), false);
  episode.update(false, 34_000);
  assert.equal(episode.update(true, 37_000), false);
  assert.equal(episode.update(true, 38_000), true);
  episode.update(false, 39_000);
  assert.equal(episode.update(true, 43_000), false);
  episode.reset();
  assert.equal(episode.update(true, 43_001), false);
});

test('P6 catalog refresh preserves a continuous world exposure episode for the same creative', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const scene = new Scene();
  const manager = new AdPlacementManager(scene, 'dallas', [], false);
  manager.setSponsorMeasurementEnabled(true);
  const sponsor = { cityId: 'dallas', placementId: 'dallas-dfw-terminal-sign', campaignId: 'campaign-a', creativeId: 'creative-a', assetUrl: '/local-qa.png' };
  manager.setWorldSponsors([sponsor]);
  // Feed the existing visibility episode without creating a mock world renderer.
  assert.equal(manager.sponsorEpisodes.get(sponsor.placementId).update(true), false);
  now = 1000;
  assert.equal(manager.sponsorEpisodes.get(sponsor.placementId).update(true), true);
  now = 60_000;
  manager.setWorldSponsors([]);
  now += 200;
  manager.setWorldSponsors([sponsor]);
  assert.equal(manager.sponsorEpisodes.get(sponsor.placementId).update(true), false);
  now += 1000;
  assert.equal(manager.sponsorEpisodes.get(sponsor.placementId).update(true), false);
  manager.setWorldSponsors([{ ...sponsor, creativeId: 'creative-b' }]);
  assert.equal(manager.sponsorEpisodes.get(sponsor.placementId).update(true), false);
  now += 1000;
  assert.equal(manager.sponsorEpisodes.get(sponsor.placementId).update(true), true);
  manager.setSponsorMeasurementEnabled(false);
  assert.equal(manager.sponsorEpisodes.size, 0);
  manager.dispose(scene);
});
