import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SponsorshipInquiryStore, validateSponsorshipInquiry } from './sponsorship-inquiries.js';
import { HUB_PLACEMENT_ID, SPONSORSHIP_SERVING_DEFAULTS, SponsorshipManagementStore } from './sponsorship-management.js';
import { SponsorshipDelivery } from './sponsorship-delivery.js';

const operator = 'test-host-shell';
const start = '2026-11-01T00:00:00Z', end = '2026-12-01T00:00:00Z';
const qualified = 'dallas-dfw-terminal-sign';

function fixture(): { dir: string; db: string; assets: string; store: SponsorshipManagementStore; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'airport-p3-'));
  const db = join(dir, 'profiles.sqlite'), assets = join(dir, 'assets');
  mkdirSync(assets);
  const image = spawnSync('ffmpeg', ['-y','-v','error','-f','lavfi','-i','color=c=blue:s=800x100','-frames:v','1',join(assets,'demo.png')], { timeout: 10_000 });
  assert.equal(image.status, 0, String(image.stderr));
  const store = new SponsorshipManagementStore(db, { assetRoot: assets });
  return { dir, db, assets, store, cleanup: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
function approvedAdvertiser(store: SponsorshipManagementStore, name = 'Demo Aviation'): string {
  const id = store.createAdvertiser({ companyName: name, website: 'https://example.com' }, operator).id;
  store.setAdvertiserStatus(id, 'APPROVED', 'Fixture approval', operator);
  return id;
}
function approvedCreative(store: SponsorshipManagementStore, advertiserId: string, targetPlacementId = qualified): string {
  const id = store.registerCreative({ advertiserId, assetRef: 'demo.png', targetPlacementId, displayName: 'Demo Aviation' }, operator).id;
  store.setCreativeStatus(id, 'APPROVED', 'Fixture review', operator);
  return id;
}
function proposed(store: SponsorshipManagementStore, advertiserId: string, creativeId: string, startsAt = start, endsAt = end, placementId = qualified): string {
  const id = store.createCampaign({ advertiserId, title: 'Internal 30-day pilot', startsAt, endsAt }, operator).id;
  store.addAssignment(id, creativeId, placementId, operator);
  store.setCampaignStatus(id, 'IN_REVIEW', null, operator);
  return id;
}

test('migration is repeatable, isolated from P2 inquiry data, and page reads are bounded', () => {
  const f = fixture();
  try {
    const inquiryStore = new SponsorshipInquiryStore(f.db);
    const input = validateSponsorshipInquiry({ companyName: 'Example Company', workEmail: 'demo@example.com', interest: 'HUB', message: 'Please contact our business team.' })!;
    const inquiry = inquiryStore.create(input);
    assert.ok('id' in inquiry);
    inquiryStore.close();
    const advertiser = f.store.createAdvertiser({ companyName: 'Example Company', inquiryId: inquiry.id }, operator);
    f.store.close();
    const reopened = new SponsorshipManagementStore(f.db, { assetRoot: f.assets });
    assert.equal(reopened.getAdvertiser(advertiser.id)?.inquiryId, inquiry.id);
    assert.throws(() => reopened.listAdvertisers(101));
    assert.throws(() => reopened.auditEvents(25, 10_001));
    reopened.close();
    const db = new DatabaseSync(f.db);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sponsorship_inquiries').get() as { n: number }).n, 1);
    db.close();
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('advertiser review and creative approval enforce input, asset, ownership, and immutable content', () => {
  const f = fixture();
  try {
    assert.throws(() => f.store.createAdvertiser({ companyName: 'X' }, operator));
    assert.throws(() => f.store.createAdvertiser({ companyName: 'Bad', website: 'https://127.0.0.1' }, operator));
    const advertiser = approvedAdvertiser(f.store);
    const other = approvedAdvertiser(f.store, "Demo'); DROP TABLE sponsor_advertisers;--");
    assert.equal(f.store.listAdvertisers().length, 2);
    assert.throws(() => f.store.setAdvertiserStatus(advertiser, 'APPROVED', null, operator));
    for (const assetRef of ['../demo.png','/etc/passwd','missing.png'])
      assert.throws(() => f.store.registerCreative({ advertiserId: advertiser, assetRef, targetPlacementId: qualified }, operator));
    assert.throws(() => f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.png', targetPlacementId: 'dallas-downtown-tower-wrap-south' }, operator));
    assert.throws(() => f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.png', targetPlacementId: 'dallas-skyboard-upper-0-0-0' }, operator));
    const creative = approvedCreative(f.store, advertiser);
    assert.equal(f.store.getCreative(creative)?.status, 'APPROVED');
    assert.throws(() => f.store.setCreativeStatus(creative, 'APPROVED', null, operator));
    const directDb = new DatabaseSync(f.db);
    assert.throws(() => directDb.prepare('UPDATE sponsor_creatives SET sha256 = ? WHERE id = ?').run('tampered', creative));
    directDb.close();
    assert.throws(() => f.store.createCampaign({ advertiserId: other, title: 'bad', startsAt: end, endsAt: start }, operator));
    const campaign = f.store.createCampaign({ advertiserId: other, title: 'Other advertiser', startsAt: start, endsAt: end }, operator);
    assert.throws(() => f.store.addAssignment(campaign.id, creative, qualified, operator));
    const original = readFileSync(join(f.assets, 'demo.png'));
    const modified = Buffer.from(original); modified[modified.length - 20] ^= 1;
    writeFileSync(join(f.assets, 'demo.png'), modified);
    assert.equal(f.store.validateCreative(creative), false);
    const ownedCampaign = proposed(f.store, advertiser, creative);
    assert.throws(() => f.store.setCampaignStatus(ownedCampaign, 'APPROVED', null, operator), /CREATIVE_NOT_APPROVED/);
    writeFileSync(join(f.assets, 'demo.png'), original);
    assert.equal(f.store.validateCreative(creative), true);
    f.store.setAdvertiserStatus(advertiser, 'SUSPENDED', null, operator);
    assert.throws(() => f.store.setCampaignStatus(ownedCampaign, 'APPROVED', null, operator), /ADVERTISER_NOT_APPROVED/);
    f.store.setAdvertiserStatus(advertiser, 'APPROVED', null, operator);
    f.store.setCreativeStatus(creative, 'DISABLED', null, operator);
    assert.throws(() => f.store.setCreativeStatus(creative, 'APPROVED', null, operator));
    f.store.setAdvertiserStatus(other, 'REJECTED', 'Fixture rejection', operator);
    assert.equal(f.store.getAdvertiser(other)?.status, 'REJECTED');
  } finally { f.cleanup(); }
});

test('invalid, oversized, unsupported and mismatched image files fail closed', () => {
  const f = fixture();
  try {
    const advertiser = approvedAdvertiser(f.store);
    writeFileSync(join(f.assets, 'bad.png'), Buffer.from('not an image'));
    writeFileSync(join(f.assets, 'large.png'), Buffer.alloc(1024 * 1024 + 1));
    copyFileSync(join(f.assets, 'demo.png'), join(f.assets, 'fake.jpg'));
    writeFileSync(join(f.assets, 'truncated.png'), readFileSync(join(f.assets, 'demo.png')).subarray(0, 100));
    symlinkSync(join(f.assets, 'demo.png'), join(f.assets, 'linked.png'));
    for (const assetRef of ['bad.png','large.png','fake.jpg','truncated.png','linked.png'])
      assert.throws(() => f.store.registerCreative({ advertiserId: advertiser, assetRef, targetPlacementId: qualified }, operator));
    assert.throws(() => f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.png', targetPlacementId: 'dallas-love-terminal-sign' }, operator));
    assert.throws(() => f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.png', targetPlacementId: 'dallas-dfw-west-corridor' }, operator));
    const converted = spawnSync('ffmpeg', ['-y','-v','error','-i',join(f.assets,'demo.png'),'-frames:v','1','-c:v','mjpeg',join(f.assets,'demo.jpg')], { timeout: 10_000 });
    assert.equal(converted.status, 0, String(converted.stderr));
    assert.equal(f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.jpg', targetPlacementId: qualified }, operator).format, 'JPEG');
    copyFileSync(new URL('./fixtures/p3-demo.webp', import.meta.url), join(f.assets, 'demo.webp'));
    assert.equal(f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.webp', targetPlacementId: qualified }, operator).format, 'WEBP');
    for (const [id, filename, size] of [
      ['dallas-love-terminal-sign','love.png','780x160'],
      ['dallas-dfw-north-arrival','arrival.png','680x210'],
    ]) {
      const image = spawnSync('ffmpeg', ['-y','-v','error','-f','lavfi','-i',`color=c=blue:s=${size}`,'-frames:v','1',join(f.assets,filename)], { timeout: 10_000 });
      assert.equal(image.status, 0, String(image.stderr));
      assert.equal(f.store.registerCreative({ advertiserId: advertiser, assetRef: filename, targetPlacementId: id }, operator).targetPlacementId, id);
    }
    const hubCreative = f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.png', targetPlacementId: HUB_PLACEMENT_ID }, operator);
    assert.equal(hubCreative.targetPlacementId, HUB_PLACEMENT_ID);
    const hubCampaign = f.store.createCampaign({ advertiserId: advertiser, title: 'Hub fixture', startsAt: start, endsAt: end }, operator);
    assert.deepEqual(f.store.listAssignments(hubCampaign.id), []);
    f.store.addAssignment(hubCampaign.id, hubCreative.id, HUB_PLACEMENT_ID, operator);
    assert.equal(f.store.listAssignments(hubCampaign.id)[0].city, 'global');
  } finally { f.cleanup(); }
});

test('campaign approval, half-open UTC schedule, conflict and adjacent periods', () => {
  const f = fixture();
  try {
    const advertiser = approvedAdvertiser(f.store), creative = approvedCreative(f.store, advertiser);
    const empty = f.store.createCampaign({ advertiserId: advertiser, title: 'No assignment', startsAt: start, endsAt: end }, operator);
    f.store.setCampaignStatus(empty.id, 'IN_REVIEW', null, operator);
    assert.throws(() => f.store.setCampaignStatus(empty.id, 'APPROVED', null, operator), /NO_ASSIGNMENTS/);
    const unreviewedCreative = f.store.registerCreative({ advertiserId: advertiser, assetRef: 'demo.png', targetPlacementId: qualified }, operator);
    const unreviewedCampaign = proposed(f.store, advertiser, unreviewedCreative.id);
    assert.throws(() => f.store.setCampaignStatus(unreviewedCampaign, 'APPROVED', null, operator), /CREATIVE_NOT_APPROVED/);
    const first = proposed(f.store, advertiser, creative);
    assert.throws(() => f.store.addAssignment(first, creative, qualified, operator), /Duplicate/);
    f.store.setCampaignStatus(first, 'APPROVED', null, operator);
    assert.equal(f.store.preview(first, '2026-10-31T23:59:59.999Z').scheduleEligible, false);
    assert.equal(f.store.preview(first, start).scheduleEligible, true);
    assert.equal(f.store.preview(first, '2026-11-30T23:59:59.999Z').scheduleEligible, true);
    assert.equal(f.store.preview(first, end).scheduleEligible, false);
    assert.equal(f.store.preview(first, '2026-12-01T00:00:00.001Z').scheduleEligible, false);
    assert.equal(f.store.preview(first, start).publicServingAllowed, false);
    assert.ok(f.store.preview(first, start).blockers.includes('GLOBAL_PAUSE'));
    assert.ok(f.store.preview(first, start).blockers.includes('WORLD_SERVING_DISABLED'));
    assert.deepEqual(SPONSORSHIP_SERVING_DEFAULTS, { globalPause: true, hubEnabled: false, worldEnabled: false });
    const overlapping = proposed(f.store, advertiser, creative, '2026-11-15T00:00:00Z', '2026-12-15T00:00:00Z');
    assert.equal(f.store.conflicts(overlapping).length, 1);
    assert.throws(() => f.store.setCampaignStatus(overlapping, 'APPROVED', null, operator), /PLACEMENT_CONFLICT/);
    const adjacent = proposed(f.store, advertiser, creative, end, '2026-12-31T00:00:00Z');
    f.store.setCampaignStatus(adjacent, 'APPROVED', null, operator);
    assert.equal(f.store.preview(adjacent, end).scheduleEligible, true);
    assert.throws(() => f.store.createCampaign({ advertiserId: advertiser, title: 'Bad timezone', startsAt: '2026-11-01T00:00:00-05:00', endsAt: end }, operator));
    assert.throws(() => f.store.createCampaign({ advertiserId: advertiser, title: 'Bad date', startsAt: '2026-02-30T00:00:00Z', endsAt: end }, operator));
  } finally { f.cleanup(); }
});

test('material edits invalidate approval, pause/cancel preserve audit, and conflicts serialize across connections', async () => {
  const f = fixture();
  try {
    const advertiser = approvedAdvertiser(f.store), creative = approvedCreative(f.store, advertiser);
    const first = proposed(f.store, advertiser, creative), second = proposed(f.store, advertiser, creative);
    const approveInProcess = (id: string) => new Promise<number>((resolveExit, rejectExit) => {
      const child = spawn(process.execPath, ['--import','tsx','server/src/sponsorship-management-cli.ts','campaign','approve',id], {
        cwd: resolve(import.meta.dirname, '../..'),
        env: { ...process.env, AIRPORT_CHAOS_PROFILE_DB: f.db, AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets },
        stdio: 'ignore',
      });
      child.once('error', rejectExit);
      child.once('exit', code => resolveExit(code ?? -1));
    });
    {
      const results = await Promise.all([approveInProcess(first), approveInProcess(second)]);
      assert.deepEqual(results.sort(), [0, 1]);
      const winner = f.store.getCampaign(first)?.status === 'APPROVED' ? first : second;
      assert.equal(f.store.preview(winner, start).scheduleEligible, true);
      const replacement = approvedCreative(f.store, advertiser);
      f.store.changeAssignment(f.store.listAssignments(winner)[0].id, replacement, operator);
      assert.equal(f.store.getCampaign(winner)?.status, 'IN_REVIEW');
      f.store.setCampaignStatus(winner, 'APPROVED', null, operator);
      f.store.editCampaign(winner, { endsAt: '2026-12-02T00:00:00Z' }, operator);
      assert.equal(f.store.getCampaign(winner)?.status, 'IN_REVIEW');
      assert.equal(f.store.preview(winner, start).scheduleEligible, false);
      f.store.setCampaignStatus(winner, 'APPROVED', null, operator);
      f.store.setCampaignStatus(winner, 'PAUSED', null, operator);
      assert.equal(f.store.preview(winner, start).scheduleEligible, false);
      f.store.setCampaignStatus(winner, 'CANCELLED', null, operator);
      assert.throws(() => f.store.editCampaign(winner, { title: 'Changed' }, operator));
      assert.ok(f.store.auditEvents(100, 0, winner).some(event => event.action === 'STATUS' && event.details.includes('CANCELLED')));
    }
  } finally { f.cleanup(); }
});

test('CLI completes isolated internal lifecycle and leaves public serving disabled', () => {
  const f = fixture();
  try {
    const env = { ...process.env, AIRPORT_CHAOS_PROFILE_DB: f.db, AIRPORT_CHAOS_SPONSOR_ASSET_ROOT: f.assets };
    const cli = (...args: string[]) => {
      const result = spawnSync(process.execPath, ['--import','tsx','server/src/sponsorship-management-cli.ts',...args], { cwd: resolve(import.meta.dirname, '../..'), env, encoding: 'utf8', timeout: 10_000 });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    const advertiser = cli('advertiser','create','Fixture Company').id as string;
    cli('advertiser','approve',advertiser);
    const creative = cli('creative','register',advertiser,'demo.png',qualified,'Fixture Company').id as string;
    cli('creative','approve',creative);
    const campaign = cli('campaign','create',advertiser,'Fixture 30-day campaign',start,end).id as string;
    cli('assignment','add',campaign,creative,qualified);
    cli('campaign','review',campaign);
    cli('campaign','approve',campaign);
    const preview = cli('campaign','preview',campaign,start);
    assert.equal(preview.scheduleEligible, true);
    assert.equal(preview.publicServingAllowed, false);
    assert.equal(new SponsorshipDelivery(f.store).catalog(new Date(start)).hub, null);
    cli('campaign','pause',campaign);
    assert.equal(cli('campaign','preview',campaign,start).scheduleEligible, false);
    const campaignAudit = cli('audit','record',campaign);
    assert.ok(campaignAudit.length >= 5);
    assert.ok(campaignAudit.some((event: { action: string }) => event.action === 'ADD'));
    assert.ok(cli('audit','record',advertiser).length >= campaignAudit.length);
  } finally { f.cleanup(); }
});

test('approved internal records do not expose a public campaign API or replace the Sponsors page', async () => {
  const f = fixture();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const advertiser = approvedAdvertiser(f.store), creative = approvedCreative(f.store, advertiser);
    const campaign = proposed(f.store, advertiser, creative);
    f.store.setCampaignStatus(campaign, 'APPROVED', null, operator);
    const probe = createServer();
    await new Promise<void>(done => probe.listen(0, '127.0.0.1', done));
    const address = probe.address();
    assert.ok(address && typeof address !== 'string');
    await new Promise<void>(done => probe.close(() => done()));
    const origin = `http://127.0.0.1:${address.port}`;
    child = spawn(process.execPath, ['--import','tsx','server/src/index.ts'], {
      cwd: resolve(import.meta.dirname, '../..'),
      env: { ...process.env, PORT: String(address.port), AIRPORT_CHAOS_PROFILE_DB: f.db,
        SPONSORSHIP_PUBLIC_INQUIRIES_ENABLED: 'false', NODE_ENV: 'test' },
      stdio: ['ignore','pipe','pipe'],
    });
    let output = '';
    child.stdout?.on('data', chunk => { output += String(chunk); });
    child.stderr?.on('data', chunk => { output += String(chunk); });
    const deadline = Date.now() + 15_000;
    while (!output.includes('listening') && Date.now() < deadline && child.exitCode === null)
      await new Promise(done => setTimeout(done, 50));
    assert.match(output, /listening/);
    const sponsorPage = await fetch(`${origin}/sponsors`);
    assert.equal(sponsorPage.status, 200);
    const hidden = await fetch(`${origin}/api/sponsorship/campaigns`, { method: 'POST', headers: { Origin: origin } });
    assert.equal(hidden.status, 404);
    assert.equal(f.store.preview(campaign, start).publicServingAllowed, false);
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(done => child!.once('exit', done));
    }
    f.cleanup();
  }
});
