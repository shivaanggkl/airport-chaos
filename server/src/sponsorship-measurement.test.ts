import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { HUB_PLACEMENT_ID, SponsorshipManagementStore } from './sponsorship-management.js';
import { SponsorshipDelivery, SponsorshipReportStore, sponsorDeliveryGates } from './sponsorship-delivery.js';
import { DIRECTORY_PLACEMENT_ID, SponsorshipMeasurementStore, eligibleSponsorEvent, sponsorMeasurementCaveat,
  sponsorMeasurementEnabled, validSponsorEvent, type SponsorEvent } from './sponsorship-measurement.js';

const actor = 'isolated-p6-test';
const worldIds = ['dallas-dfw-terminal-sign', 'dallas-love-terminal-sign', 'dallas-dfw-north-arrival'] as const;
function fixture(now = new Date('2026-10-29T12:00:00.000Z')) {
  const dir = mkdtempSync(join(tmpdir(), 'airport-p6-')), db = join(dir, 'profiles.sqlite'), assets = join(dir, 'assets');
  mkdirSync(assets);
  const management = new SponsorshipManagementStore(db, { assetRoot: assets });
  const advertiser = management.createAdvertiser({ companyName: 'Airport Chaos Sponsorship QA Demo' }, actor).id;
  management.setAdvertiserStatus(advertiser, 'APPROVED', null, actor);
  management.setAdvertiserPublicInfo(advertiser, 'Internal house-art QA only.', true, actor);
  const placements = [HUB_PLACEMENT_ID, ...worldIds];
  const sizes = ['800x100', '650x80', '780x160', '680x210'];
  const creatives = placements.map((placementId, index) => {
    const assetRef = `house-${index}.png`;
    const result = spawnSync('ffmpeg', ['-y','-v','error','-f','lavfi','-i',`color=c=0x123d67:s=${sizes[index]}`,'-frames:v','1',join(assets, assetRef)], { timeout: 10_000 });
    assert.equal(result.status, 0, String(result.stderr));
    const id = management.registerCreative({ advertiserId: advertiser, assetRef, targetPlacementId: placementId, displayName: 'Airport Chaos' }, actor).id;
    management.setCreativeStatus(id, 'APPROVED', null, actor);
    return id;
  });
  const campaign = management.createCampaign({ advertiserId: advertiser, title: 'P6 internal QA',
    startsAt: new Date(now.getTime() - 60 * 60_000).toISOString(), endsAt: new Date(now.getTime() + (31 * 24 - 1) * 60 * 60_000).toISOString() }, actor).id;
  placements.forEach((id, index) => management.addAssignment(campaign, creatives[index], id, actor));
  management.setCampaignStatus(campaign, 'IN_REVIEW', null, actor);
  management.setCampaignStatus(campaign, 'APPROVED', null, actor);
  management.setCampaignDeliveryApproval(campaign, true, actor);
  const reports = new SponsorshipReportStore(db);
  const measurement = new SponsorshipMeasurementStore(db);
  const gates = { qaServing: true, globalPause: false, hubEnabled: true, worldEnabled: true, externalLinks: false, measurementEnabled: true };
  const delivery = new SponsorshipDelivery(management, gates);
  const event = (type: SponsorEvent['type'], index = 0): SponsorEvent => ({ eventId: randomUUID(), type, campaignId: campaign,
    creativeId: creatives[index], placementId: type === 'WORLD_ESTIMATED_EXPOSURE' ? worldIds[index - 1] : HUB_PLACEMENT_ID,
    cityId: type === 'WORLD_ESTIMATED_EXPOSURE' ? 'dallas' : 'global' });
  return { dir, db, assets, management, reports, measurement, advertiser, campaign, creatives, now, gates, delivery, event,
    cleanup: () => { measurement.close(); reports.close(); management.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('P6 events validate live catalog, aggregate by server UTC, and dedupe across restart', () => {
  const f = fixture();
  try {
    const hub = f.event('HUB_ESTIMATED_EXPOSURE');
    const world = f.event('WORLD_ESTIMATED_EXPOSURE', 1);
    const details = { ...f.event('SPONSOR_DETAILS_OPEN'), placementId: DIRECTORY_PLACEMENT_ID, source: 'DIRECTORY' as const };
    assert.equal(validSponsorEvent(hub), true);
    assert.equal(validSponsorEvent({ ...hub, url: 'https://example.com' }), false);
    assert.equal(eligibleSponsorEvent(hub, f.delivery.catalog(f.now)), true);
    assert.equal(eligibleSponsorEvent({ ...world, placementId: 'dallas-downtown-tower-wrap-south' }, f.delivery.catalog(f.now)), false);
    assert.equal(validSponsorEvent({ ...world, placementId: 'dallas-upper-skyboard-01' }), false);
    assert.equal(validSponsorEvent({ ...world, cityId: 'new-york' }), false);
    assert.deepEqual(f.measurement.ingest([hub, world, details], f.delivery, f.management, 'web', f.now), { accepted: 3, duplicate: 0 });
    assert.deepEqual(f.measurement.ingest([hub], f.delivery, f.management, 'web', f.now), { accepted: 0, duplicate: 1 });
    const reopened = new SponsorshipMeasurementStore(f.db);
    assert.deepEqual(reopened.ingest([hub], f.delivery, f.management, 'web', f.now), { accepted: 0, duplicate: 1 });
    assert.equal(reopened.daily(f.campaign, '2026-10-29', '2026-10-29').length, 3);
    assert.equal(reopened.daily(f.campaign, '2026-10-29', '2026-10-29').reduce((n, row) => n + row.count, 0), 3);
    assert.throws(() => reopened.daily(f.campaign, '2020-01-01', '2026-10-29'));
    assert.throws(() => reopened.daily(f.campaign, '2026-99-99', '2026-99-99'));
    reopened.close();
    for (const index of [1, 2, 3]) assert.equal(eligibleSponsorEvent(f.event('WORLD_ESTIMATED_EXPOSURE', index), f.delivery.catalog(f.now)), true);
    assert.throws(() => f.measurement.ingest([{ ...hub, eventId: randomUUID(), placementId: 'house-only' }], f.delivery, f.management, 'web', f.now));
    assert.throws(() => f.measurement.ingest([{ ...hub, eventId: randomUUID(), creativeId: randomUUID() }], f.delivery, f.management, 'web', f.now));
    assert.throws(() => f.measurement.ingest([{ ...hub, eventId: randomUUID() }], f.delivery, f.management, 'web', new Date('2026-11-29T11:00:00.000Z')));
    assert.throws(() => f.measurement.ingest([{ ...hub, eventId: randomUUID() }], f.delivery, f.management, 'web', new Date('2026-10-29T10:59:59.999Z')));
    assert.throws(() => f.measurement.ingest([{ ...hub, eventId: randomUUID(), type: 'SPONSOR_WEBSITE_ACTION', source: 'HUB' }], f.delivery, f.management, 'web', f.now));
    const paused = new SponsorshipDelivery(f.management, { ...f.gates, globalPause: true });
    assert.throws(() => f.measurement.ingest([{ ...hub, eventId: randomUUID() }], paused, f.management, 'web', f.now));
    const reportId = f.reports.create(f.delivery.catalog(f.now).hub!, 'MISLEADING', 'Fixture report');
    assert.equal(f.reports.get(reportId)?.status, 'NEW');
    assert.deepEqual(f.measurement.reportCounts(f.campaign), { total: 1, open: 1, reasons: { MISLEADING: 1 } });
    f.management.setCampaignStatus(f.campaign, 'PAUSED', null, actor);
    assert.throws(() => f.measurement.ingest([{ ...hub, eventId: randomUUID() }], f.delivery, f.management, 'web', f.now));
    assert.match(sponsorMeasurementCaveat, /not independently audited advertising impressions/);
  } finally { f.cleanup(); }
});

test('P6 production measurement gate is off despite local flags', () => {
  const f = fixture();
  try {
    const env = { NODE_ENV: 'production', AIRPORT_CHAOS_DEV_QA: '1', SPONSORSHIP_QA_SERVING_ENABLED: 'true',
      SPONSORSHIP_PAID_HUB_ENABLED: 'true', SPONSORSHIP_ESTIMATE_EVENTS_ENABLED: 'true', SPONSORSHIP_GLOBAL_PAUSE: 'false',
      AIRPORT_CHAOS_PROFILE_DB: f.db, AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets };
    const gates = sponsorDeliveryGates(env);
    assert.equal(gates.measurementEnabled, false);
    assert.equal(sponsorMeasurementEnabled(env, gates), false);
    assert.equal(new SponsorshipDelivery(f.management, gates).catalog(f.now).measurementEnabled, false);
  } finally { f.cleanup(); }
});

test('P6 local HTTP ingestion rejects origin, forged fields and disabled state', async () => {
  const f = fixture(new Date()); let child: ReturnType<typeof spawn> | undefined;
  try {
    const probe = createServer(); await new Promise<void>(done => probe.listen(0, '127.0.0.1', done));
    const address = probe.address(); assert.ok(address && typeof address !== 'string');
    await new Promise<void>(done => probe.close(() => done()));
    const origin = `http://127.0.0.1:${address.port}`;
    child = spawn(process.execPath, ['--import','tsx','server/src/index.ts'], { cwd: resolve(import.meta.dirname, '../..'),
      env: { ...process.env, PORT: String(address.port), NODE_ENV: 'test', AIRPORT_CHAOS_PROFILE_DB: f.db,
        AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets, AIRPORT_CHAOS_DEV_QA: '1', SPONSORSHIP_QA_SERVING_ENABLED: 'true',
        SPONSORSHIP_PAID_HUB_ENABLED: 'true', SPONSORSHIP_PAID_WORLD_ENABLED: 'true', SPONSORSHIP_ESTIMATE_EVENTS_ENABLED: 'true',
        SPONSORSHIP_GLOBAL_PAUSE: 'false' }, stdio: ['ignore','pipe','pipe'] });
    let output = ''; child.stdout?.on('data', data => { output += String(data); }); child.stderr?.on('data', data => { output += String(data); });
    const deadline = Date.now() + 15_000;
    while (!output.includes('listening') && Date.now() < deadline && child.exitCode === null) await new Promise(done => setTimeout(done, 50));
    assert.match(output, /listening/);
    const post = (body: unknown, headers: Record<string,string> = {}) => fetch(`${origin}/api/sponsorship/events`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const valid = f.event('HUB_ESTIMATED_EXPOSURE');
    assert.equal((await post({ events: [valid] })).status, 202);
    assert.equal((await post({ events: [valid] })).status, 202);
    const concurrent = f.event('HUB_ESTIMATED_EXPOSURE');
    assert.deepEqual((await Promise.all([post({ events: [concurrent] }), post({ events: [concurrent] })])).map(response => response.status), [202, 202]);
    assert.equal(f.measurement.daily(f.campaign, new Date(f.now.getTime() - 86400_000).toISOString().slice(0, 10), new Date(Date.now() + 86400_000).toISOString().slice(0, 10)).reduce((sum, row) => sum + row.count, 0), 2);
    assert.equal((await post({ events: [{ ...valid, eventId: randomUUID(), type: 'BOGUS' }] })).status, 400);
    assert.equal((await post({ events: [{ ...valid, eventId: randomUUID(), url: 'https://example.com' }] })).status, 400);
    assert.equal((await post({ events: [{ ...valid, eventId: randomUUID(), campaignId: randomUUID() }] })).status, 400);
    assert.equal((await post({ events: [valid] }, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await post({ events: [valid] }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post({ events: Array.from({ length: 21 }, () => valid) })).status, 400);
    assert.equal((await post({ events: [valid], padding: 'x'.repeat(9000) })).status, 413);
    assert.equal((await fetch(`${origin}/api/sponsorship/events`)).status, 405);
    assert.equal((await fetch(`${origin}/api/sponsorship/measurement/reports`)).status, 404);
    let limited = false;
    for (let attempt = 0; attempt < 241; attempt++) {
      if ((await post({ events: [valid] })).status === 429) { limited = true; break; }
    }
    assert.equal(limited, true);
  } finally {
    if (child && child.exitCode === null) { child.kill(); await new Promise(done => child!.once('exit', done)); }
    f.cleanup();
  }
});
