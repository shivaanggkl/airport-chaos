import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { HUB_PLACEMENT_ID, SponsorshipManagementStore } from './sponsorship-management.js';
import { SponsorshipDelivery, SponsorshipReportStore, disabledSponsorGates, sponsorDeliveryGates } from './sponsorship-delivery.js';

const actor = 'isolated-qa-shell';
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'airport-p4-')), db = join(dir, 'profiles.sqlite'), assets = join(dir, 'assets');
  mkdirSync(assets);
  const generated = spawnSync('ffmpeg', ['-y','-v','error','-f','lavfi','-i','color=c=0x123d67:s=800x100','-frames:v','1',join(assets,'house.png')], { timeout: 10_000 });
  assert.equal(generated.status, 0, String(generated.stderr));
  const store = new SponsorshipManagementStore(db, { assetRoot: assets });
  const start = new Date(Date.now() - 60_000).toISOString(), end = new Date(Date.now() + 3600_000).toISOString();
  const advertiser = store.createAdvertiser({ companyName: 'Airport Chaos — Sponsorship QA Demo', website: 'https://example.com' }, actor).id;
  store.setAdvertiserStatus(advertiser, 'APPROVED', null, actor);
  const creative = store.registerCreative({ advertiserId: advertiser, assetRef: 'house.png', targetPlacementId: HUB_PLACEMENT_ID,
    displayName: 'Airport Chaos', tagline: 'Internal QA demo' }, actor).id;
  store.setCreativeStatus(creative, 'APPROVED', null, actor);
  const campaign = store.createCampaign({ advertiserId: advertiser, title: 'Internal test', startsAt: start, endsAt: end }, actor).id;
  store.addAssignment(campaign, creative, HUB_PLACEMENT_ID, actor);
  store.setCampaignStatus(campaign, 'IN_REVIEW', null, actor);
  store.setCampaignStatus(campaign, 'APPROVED', null, actor);
  const gates = { qaServing: true, hubEnabled: true, worldEnabled: false, globalPause: false, externalLinks: false };
  return { dir, db, assets, store, advertiser, creative, campaign, start, end, gates,
    cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('P4 serving is default-deny and requires separate audited approvals', () => {
  const f = fixture();
  try {
    assert.equal(sponsorDeliveryGates({ NODE_ENV: 'production', AIRPORT_CHAOS_DEV_QA: '1', SPONSORSHIP_QA_SERVING_ENABLED: 'true', SPONSORSHIP_PAID_HUB_ENABLED: 'true', SPONSORSHIP_GLOBAL_PAUSE: 'false', AIRPORT_CHAOS_PROFILE_DB: f.db, AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets }).qaServing, false);
    assert.equal(sponsorDeliveryGates({ NODE_ENV: 'test', AIRPORT_CHAOS_DEV_QA: '1', SPONSORSHIP_QA_SERVING_ENABLED: 'true', SPONSORSHIP_PAID_HUB_ENABLED: 'true', SPONSORSHIP_GLOBAL_PAUSE: 'false', AIRPORT_CHAOS_PROFILE_DB: f.db, AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets }).qaServing, true);
    assert.equal(disabledSponsorGates.globalPause, true);
    assert.equal(new SponsorshipDelivery(f.store, f.gates).catalog(new Date()).hub, null);
    f.store.setCampaignDeliveryApproval(f.campaign, true, actor);
    let catalog = new SponsorshipDelivery(f.store, f.gates).catalog(new Date());
    assert.equal(catalog.hub?.name, 'Airport Chaos — Sponsorship QA Demo');
    assert.equal(catalog.sponsors.length, 0);
    assert.equal(catalog.hub?.website, null);
    assert.equal(new SponsorshipDelivery(f.store, { ...f.gates, globalPause: true }).catalog(new Date()).hub, null);
    assert.equal(new SponsorshipDelivery(f.store, f.gates).catalog(new Date(), 'ios').hub, null);
    assert.equal(new SponsorshipDelivery(f.store, f.gates).catalog(new Date(f.start)).hub?.campaignId, f.campaign);
    assert.equal(new SponsorshipDelivery(f.store, f.gates).catalog(new Date(Date.parse(f.end) - 1)).hub?.campaignId, f.campaign);
    assert.equal(new SponsorshipDelivery(f.store, f.gates).catalog(new Date(f.end)).hub, null);
    f.store.setAdvertiserPublicInfo(f.advertiser, 'An internal house-art sponsorship test.', true, actor);
    catalog = new SponsorshipDelivery(f.store, f.gates).catalog(new Date());
    assert.equal(catalog.sponsors.length, 1);
    assert.equal(catalog.sponsors[0].description, 'An internal house-art sponsorship test.');
    assert.ok(catalog.maxAgeMs <= 60_000);
    assert.ok(f.store.auditEvents(25, 0, f.campaign).some(event => event.action === 'DELIVERY_APPROVAL'));
    f.store.setCampaignStatus(f.campaign, 'PAUSED', null, actor);
    assert.equal(new SponsorshipDelivery(f.store, f.gates).catalog(new Date()).hub, null);
    assert.equal(f.store.getCampaign(f.campaign)?.deliveryApproved, false);
  } finally { f.cleanup(); }
});

test('creative tampering and advertiser suspension remove public sponsor; report storage is durable', () => {
  const f = fixture();
  const reports = new SponsorshipReportStore(f.db);
  try {
    f.store.setAdvertiserPublicInfo(f.advertiser, 'An internal house-art sponsorship test.', true, actor);
    f.store.setCampaignDeliveryApproval(f.campaign, true, actor);
    const delivery = new SponsorshipDelivery(f.store, f.gates);
    const sponsor = delivery.catalog().hub!;
    assert.ok(f.store.readCreativeBytes(f.creative)?.bytes.length);
    const id = reports.create(sponsor, 'MISLEADING', 'An internal report fixture');
    assert.equal(reports.get(id)?.campaignId, f.campaign);
    reports.setStatus(id, 'REVIEWED');
    reports.close();
    const reopened = new SponsorshipReportStore(f.db);
    assert.equal(reopened.get(id)?.status, 'REVIEWED');
    reopened.setStatus(id, 'RESOLVED');
    assert.equal(reopened.list(1).length, 1);
    assert.throws(() => reopened.list(101));
    reopened.close();
    writeFileSync(join(f.assets, 'house.png'), Buffer.alloc(64));
    assert.equal(delivery.catalog().hub, null);
    assert.equal(f.store.readCreativeBytes(f.creative), undefined);
    f.store.setAdvertiserStatus(f.advertiser, 'SUSPENDED', null, actor);
    assert.equal(delivery.catalog().hub, null);
    assert.equal(f.store.getCampaign(f.campaign)?.deliveryApproved, false);
  } finally { try { reports.close(); } catch { /* already closed */ } f.cleanup(); }
});

test('local HTTP catalog and report flow never expose management API', async () => {
  const f = fixture();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    f.store.setAdvertiserPublicInfo(f.advertiser, 'An internal house-art sponsorship test.', true, actor);
    f.store.setCampaignDeliveryApproval(f.campaign, true, actor);
    const probe = createServer(); await new Promise<void>(done => probe.listen(0, '127.0.0.1', done));
    const address = probe.address(); assert.ok(address && typeof address !== 'string');
    await new Promise<void>(done => probe.close(() => done()));
    const origin = `http://127.0.0.1:${address.port}`;
    child = spawn(process.execPath, ['--import','tsx','server/src/index.ts'], {
      cwd: resolve(import.meta.dirname, '../..'), env: { ...process.env, PORT: String(address.port), NODE_ENV: 'test', AIRPORT_CHAOS_PROFILE_DB: f.db,
        AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets, AIRPORT_CHAOS_DEV_QA: '1', SPONSORSHIP_QA_SERVING_ENABLED: 'true',
        SPONSORSHIP_PAID_HUB_ENABLED: 'true', SPONSORSHIP_GLOBAL_PAUSE: 'false' }, stdio: ['ignore','pipe','pipe'],
    });
    let output = ''; child.stdout?.on('data', data => { output += String(data); }); child.stderr?.on('data', data => { output += String(data); });
    const deadline = Date.now() + 15_000;
    while (!output.includes('listening') && Date.now() < deadline && child.exitCode === null) await new Promise(done => setTimeout(done, 50));
    assert.match(output, /listening/);
    const response = await fetch(`${origin}/api/sponsorship/catalog`);
    assert.equal(response.status, 200);
    const catalog = await response.json() as { hub: { campaignId: string; creativeId: string; logoUrl: string }; sponsors: unknown[] };
    assert.equal(catalog.hub.campaignId, f.campaign);
    assert.equal(catalog.sponsors.length, 1);
    assert.ok(!(JSON.stringify(catalog).includes('reviewNote')));
    assert.equal((await fetch(`${origin}${catalog.hub.logoUrl}`)).status, 200);
    assert.equal((await fetch(`${origin}/api/sponsorship/campaigns`, { method: 'POST', headers: { Origin: origin } })).status, 404);
    const post = (body: unknown, headers: Record<string,string> = {}) => fetch(`${origin}/api/sponsorship/reports`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await fetch(`${origin}/api/sponsorship/reports`, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await post({ campaignId: f.campaign, creativeId: f.creative, reason: 'OTHER', description: 'x'.repeat(3000) })).status, 413);
    assert.equal((await post({ campaignId: f.campaign, creativeId: f.creative, reason: 'OTHER', description: '\u0000' })).status, 400);
    assert.equal((await post({ campaignId: f.campaign, creativeId: f.creative, reason: 'MISLEADING', description: 'Fixture report' })).status, 201);
    assert.equal((await post({ campaignId: f.campaign, creativeId: f.creative, reason: 'MISLEADING' })).status, 429);
    assert.equal((await post({ campaignId: f.campaign, creativeId: crypto.randomUUID(), reason: 'OTHER' })).status, 400);
    assert.equal((await post({ campaignId: f.campaign, creativeId: f.creative, reason: 'BOGUS' })).status, 400);
    assert.equal((await fetch(`${origin}/api/sponsorship/reports`)).status, 405);
    const reportStore = new SponsorshipReportStore(f.db);
    assert.equal(reportStore.list().length, 1);
    reportStore.close();
    const db = new DatabaseSync(f.db); db.exec('DROP TABLE sponsor_reports'); db.close();
    assert.equal((await post({ campaignId: f.campaign, creativeId: f.creative, reason: 'OTHER' })).status, 503);
    f.store.setCreativeStatus(f.creative, 'DISABLED', null, actor);
    assert.equal((await fetch(`${origin}/api/sponsorship/catalog`).then(r => r.json()) as { hub: unknown }).hub, null);
    assert.equal((await fetch(`${origin}${catalog.hub.logoUrl}`)).status, 404);
  } finally {
    if (child && child.exitCode === null) { child.kill(); await new Promise(done => child!.once('exit', done)); }
    f.cleanup();
  }
});
