import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SponsorshipManagementStore } from './sponsorship-management.js';
import { SponsorshipDelivery, sponsorDeliveryGates } from './sponsorship-delivery.js';

const actor = 'isolated-p5-test';
const ids = ['dallas-dfw-terminal-sign', 'dallas-love-terminal-sign', 'dallas-dfw-north-arrival'] as const;
const sizes = ['650x80', '780x160', '680x210'] as const;
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'airport-p5-'));
  const assets = join(dir, 'assets');
  mkdirSync(assets);
  const db = join(dir, 'profiles.sqlite');
  const store = new SponsorshipManagementStore(db, { assetRoot: assets });
  const advertiser = store.createAdvertiser({ companyName: 'Airport Chaos Sponsorship QA Demo' }, actor).id;
  store.setAdvertiserStatus(advertiser, 'APPROVED', null, actor);
  const creatives = ids.map((id, index) => {
    const assetRef = `house-${index}.png`;
    const result = spawnSync('ffmpeg', ['-y','-v','error','-f','lavfi','-i',`color=c=0x123d67:s=${sizes[index]}`,'-frames:v','1',join(assets, assetRef)], { timeout: 10_000 });
    assert.equal(result.status, 0, String(result.stderr));
    const creative = store.registerCreative({ advertiserId: advertiser, assetRef, targetPlacementId: id, displayName: 'Airport Chaos' }, actor).id;
    store.setCreativeStatus(creative, 'APPROVED', null, actor);
    return creative;
  });
  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 3_600_000).toISOString();
  const campaign = store.createCampaign({ advertiserId: advertiser, title: 'Internal world QA', startsAt: start, endsAt: end }, actor).id;
  ids.forEach((id, index) => store.addAssignment(campaign, creatives[index], id, actor));
  store.setCampaignStatus(campaign, 'IN_REVIEW', null, actor);
  store.setCampaignStatus(campaign, 'APPROVED', null, actor);
  const gates = { qaServing: true, globalPause: false, hubEnabled: false, worldEnabled: true, externalLinks: false };
  return { dir, assets, db, store, advertiser, creatives, campaign, start, end, gates,
    cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('P5 world serving is default-deny, separate from Hub, and exact-boundary safe', () => {
  const f = fixture();
  try {
    const delivery = new SponsorshipDelivery(f.store, f.gates);
    assert.deepEqual(delivery.catalog().world, []);
    f.store.setCampaignDeliveryApproval(f.campaign, true, actor);
    assert.deepEqual(new SponsorshipDelivery(f.store, { ...f.gates, worldEnabled: false, hubEnabled: true }).catalog().world, []);
    assert.deepEqual(new SponsorshipDelivery(f.store, { ...f.gates, globalPause: true }).catalog().world, []);
    assert.deepEqual(delivery.catalog(new Date(), 'unknown').world, []);
    assert.deepEqual(delivery.catalog(new Date(Date.parse(f.start) - 1)).world, []);
    assert.equal(delivery.catalog(new Date(f.start)).world.length, 3);
    assert.equal(delivery.catalog(new Date(Date.parse(f.end) - 1)).world.length, 3);
    assert.deepEqual(delivery.catalog(new Date(f.end)).world, []);
    const catalog = delivery.catalog();
    assert.deepEqual(catalog.world.map(item => item.placementId), [...ids].sort());
    assert.equal(catalog.hub, null);
    assert.equal(catalog.sponsors.length, 0);
    assert.ok(catalog.maxAgeMs <= 60_000);
    assert.ok(catalog.world.every(item => item.cityId === 'dallas' && item.assetUrl.startsWith('/api/sponsorship/creative/')));
    assert.ok(!JSON.stringify(catalog).includes('reviewNote'));
    assert.equal(sponsorDeliveryGates({ NODE_ENV: 'production', AIRPORT_CHAOS_DEV_QA: '1', SPONSORSHIP_QA_SERVING_ENABLED: 'true',
      SPONSORSHIP_PAID_WORLD_ENABLED: 'true', SPONSORSHIP_GLOBAL_PAUSE: 'false', AIRPORT_CHAOS_PROFILE_DB: f.db,
      AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets }).worldEnabled, false);
    assert.equal(sponsorDeliveryGates({ NODE_ENV: 'test', AIRPORT_CHAOS_DEV_QA: '1', SPONSORSHIP_QA_SERVING_ENABLED: 'true',
      SPONSORSHIP_PAID_HUB_ENABLED: 'true', SPONSORSHIP_GLOBAL_PAUSE: 'false', AIRPORT_CHAOS_PROFILE_DB: f.db,
      AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets }).worldEnabled, false);
  } finally { f.cleanup(); }
});

test('P5 world eligibility tracks review, integrity, directory approval and pause', () => {
  const f = fixture();
  try {
    f.store.setCampaignDeliveryApproval(f.campaign, true, actor);
    const delivery = new SponsorshipDelivery(f.store, f.gates);
    f.store.setAdvertiserPublicInfo(f.advertiser, 'Internal house-art QA only.', true, actor);
    assert.equal(delivery.catalog().sponsors.length, 1);
    writeFileSync(join(f.assets, 'house-1.png'), Buffer.alloc(64));
    assert.deepEqual(delivery.catalog().world, []);
    f.store.setCreativeStatus(f.creatives[1], 'DISABLED', null, actor);
    assert.deepEqual(delivery.catalog().world, []);
    f.store.setCampaignStatus(f.campaign, 'PAUSED', null, actor);
    assert.deepEqual(delivery.catalog().world, []);
    assert.equal(f.store.getCampaign(f.campaign)?.deliveryApproved, false);
  } finally { f.cleanup(); }
});

test('P5 placement authority rejects blocked, house-only, generated and mismatched creatives', () => {
  const f = fixture();
  try {
    const proposal = f.store.createCampaign({ advertiserId: f.advertiser, title: 'Rejected locations', startsAt: f.start, endsAt: f.end }, actor).id;
    for (const id of ['dallas-downtown-tower-wrap-south', 'dallas-downtown-tower-wrap-west', 'dallas-upper-skyboard-0', 'dallas-unknown']) {
      assert.throws(() => f.store.addAssignment(proposal, f.creatives[0], id, actor));
    }
    assert.throws(() => f.store.addAssignment(proposal, f.creatives[0], ids[1], actor));
    assert.throws(() => f.store.addAssignment(f.campaign, f.creatives[0], ids[0], actor));
    const second = f.store.createCampaign({ advertiserId: f.advertiser, title: 'Overlapping location', startsAt: f.start, endsAt: f.end }, actor).id;
    f.store.addAssignment(second, f.creatives[0], ids[0], actor);
    f.store.setCampaignStatus(second, 'IN_REVIEW', null, actor);
    assert.throws(() => f.store.setCampaignStatus(second, 'APPROVED', null, actor));
  } finally { f.cleanup(); }
});
