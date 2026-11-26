import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SponsorshipInquiryStore, validateSponsorshipInquiry } from './sponsorship-inquiries.js';
import {advertisingWaitlistConsent} from '../../shared/advertising-packages.mjs';

const valid = {
  companyName: 'Example Flight Co', contactName: 'Test Operator', workEmail: 'pilot@example.com',
  website: 'https://example.com', interest: 'HUB', message: 'We would like to discuss a Hub placement.',
};

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolveWait => server.listen(0, '127.0.0.1', resolveWait));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>(resolveWait => server.close(() => resolveWait()));
  return address.port;
}

async function runServer(db: string, enabled: boolean, perform: (url: string) => Promise<void>): Promise<void> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: resolve(import.meta.dirname, '../..'),
    env: { ...process.env, PORT: String(port), AIRPORT_CHAOS_PROFILE_DB: db,
      SPONSORSHIP_PUBLIC_INQUIRIES_ENABLED: enabled ? 'true' : 'false', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  try {
    const deadline = Date.now() + 15_000;
    while (!output.includes('listening') && Date.now() < deadline && child.exitCode === null)
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    assert.equal(child.exitCode, null, output);
    assert.match(output, /listening/);
    await perform(origin);
    assert.equal(output.includes('pilot@example.com'), false, 'Contact information must not reach general logs');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolveWait => child.once('exit', resolveWait));
  }
}

function post(origin: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${origin}/api/sponsorship/inquiries`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('validates fields, HTTPS host, enums and unknown values', () => {
  assert.equal(validateSponsorshipInquiry(valid)?.workEmail, 'pilot@example.com');
  for (const patch of [
    { companyName: 'x' }, { companyName: '<script>' }, { companyName: 'Bad\nName' }, { workEmail: 'bad' },
    { website: 'http://example.com' }, { website: 'https://localhost' },
    { website: 'https://127.0.0.1' }, { website: 'https://user:secret@example.com' },
    { website: 'https://host.local' }, { website: 'https://admin.localhost' }, { website: 'https://router.home.arpa' },
    { interest: 'OTHER' }, { message: 'short' },
  ]) {
    const sample = { ...valid, ...patch };
    if (patch.companyName === '<script>') assert.ok(validateSponsorshipInquiry(sample));
    else assert.equal(validateSponsorshipInquiry(sample), undefined, JSON.stringify(patch));
  }
  assert.equal(validateSponsorshipInquiry({ ...valid, arbitrary: true }), undefined);
});

test('SQLite inquiries survive reopening and enforce one per email per hour', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airport-sponsor-unit-'));
  const db = join(dir, 'test.sqlite');
  try {
    const input = validateSponsorshipInquiry(valid)!;
    const store = new SponsorshipInquiryStore(db);
    const created = store.create(input, new Date('2026-10-28T12:00:00Z'));
    assert.ok('id' in created);
    assert.equal(store.list().length, 1);
    assert.ok('limited' in store.create(input, new Date('2026-10-28T12:00:02Z')));
    store.close();
    const reopened = new SponsorshipInquiryStore(db);
    assert.equal(reopened.get(created.id)?.status, 'NEW');
    assert.equal(reopened.updateStatus(created.id, 'CONTACTED'), true);
    assert.equal(reopened.get(created.id)?.status, 'CONTACTED');
    assert.ok('id' in reopened.create(input, new Date('2026-10-28T13:00:01Z')));
    const hostileText = validateSponsorshipInquiry({ ...valid, companyName: "Test'); DROP TABLE sponsorship_inquiries;--", workEmail: 'other@example.com', message: '<script>alert(1)</script>' })!;
    const hostileRecord = reopened.create(hostileText);
    assert.ok('id' in hostileRecord);
    assert.equal(reopened.get(hostileRecord.id)?.message, '<script>alert(1)</script>');
    assert.equal(reopened.list().length, 3);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('public API enforces gate, origin, validation, cap, rate and durable response', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'airport-sponsor-api-'));
  const db = join(dir, 'test.sqlite');
  try {
    await runServer(db, false, async origin => {
      assert.deepEqual(await (await fetch(`${origin}/api/sponsorship/inquiries`)).json(), { available: false });
      assert.equal((await post(origin, valid)).status, 503);
    });
    await runServer(db, true, async origin => {
      assert.match(await (await fetch(`${origin}/advertise`)).text(), /Advertise in Airport Chaos/);
      assert.match(await (await fetch(`${origin}/sponsors`)).text(), /Advertise in Airport Chaos/);
      assert.deepEqual(await (await fetch(`${origin}/api/sponsorship/inquiries`)).json(), { available: true });
      assert.equal((await post(origin, valid, { Origin: 'https://evil.example' })).status, 403);
      assert.equal((await post(origin, valid, { Origin: '' })).status, 403);
      assert.equal((await post(origin, valid, { 'Content-Type': 'text/plain' })).status, 415);
      assert.equal((await post(origin, { ...valid, interest: 'INVALID' })).status, 400);
      assert.equal((await post(origin, { ...valid, website: 'https://127.0.0.1' })).status, 400);
      assert.equal((await post(origin, '{broken')).status, 400);
      assert.equal((await post(origin, 'a'.repeat(5_000))).status, 413);
      const oversizedStream = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('a'.repeat(5_000))); controller.close(); },
      });
      assert.equal((await fetch(`${origin}/api/sponsorship/inquiries`, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: oversizedStream, duplex: 'half',
      } as RequestInit & { duplex: 'half' })).status, 413);
      const first = await post(origin, valid);
      assert.equal(first.status, 201);
      const result = await first.json() as { requestId?: string; status?: string };
      assert.match(result.requestId ?? '', /^[0-9a-f-]{36}$/);
      assert.equal(result.status, 'RECEIVED');
      assert.equal((await post(origin, valid)).status, 429);
      assert.equal((await post(origin, { ...valid, workEmail: 'second@example.com' })).status, 201);
      assert.equal((await post(origin, { ...valid, workEmail: 'third@example.com' })).status, 429);
      assert.equal((await fetch(`${origin}/api/sponsorship/inquiries`, { headers: { Origin: origin } })).status, 200);
      assert.equal((await fetch(`${origin}/api/sponsorship/inquiries/${result.requestId}`)).status, 404);
    });
    const store = new SponsorshipInquiryStore(db);
    assert.equal(store.list().length, 2);
    store.close();
    const failing = new DatabaseSync(db);
    failing.exec("CREATE TRIGGER sponsorship_write_fail BEFORE INSERT ON sponsorship_inquiries BEGIN SELECT RAISE(FAIL, 'storage unavailable'); END;");
    failing.close();
    await runServer(db, true, async origin => {
      const response = await post(origin, { ...valid, workEmail: 'failure@example.com' });
      assert.equal(response.status, 503);
      assert.equal(JSON.stringify(await response.json()).includes('failure@example.com'), false);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const waitlist = {requestKind:'WAITLIST',packageId:'HUB_SPOTLIGHT',emailConsent:true,companyName:'Waitlist Company',workEmail:'waitlist@example.com'};

test('waitlist permits only the two canonical packages, explicit consent and valid business fields',()=>{
  const hub=validateSponsorshipInquiry(waitlist)!;
  assert.equal(hub.interest,'HUB');assert.equal(hub.message,'');
  const dallas=validateSponsorshipInquiry({...waitlist,packageId:'DALLAS_NETWORK',message:'Hi'})!;
  assert.equal(dallas.interest,'DALLAS');assert.equal(dallas.message,'Hi');
  for(const patch of [{packageId:'CITY_PARTNER'},{packageId:'HUB'},{packageId:199},{packageId:{id:'HUB_SPOTLIGHT'}},
    {emailConsent:false},{emailConsent:undefined},{emailConsent:'true'},{companyName:'x'},{workEmail:'invalid'},
    {website:'http://example.com'},{website:'https://localhost'},{website:'https://127.0.0.1'},
    {message:1},{message:'x'.repeat(1001)},{price:1},{durationDays:365},{interest:'DALLAS'},
    {consentedAt:'2000-01-01T00:00:00.000Z'},{consentText:'Different consent'},{requestKind:'PURCHASE'}])
      assert.equal(validateSponsorshipInquiry({...waitlist,...patch}),undefined,JSON.stringify(patch));
});

test('additive migration preserves historical inquiries and stores server consent for operators',()=>{
  const dir=mkdtempSync(join(tmpdir(),'airport-waitlist-migrate-')),db=join(dir,'test.sqlite');
  try {
    const legacy=new DatabaseSync(db);
    legacy.exec(`CREATE TABLE sponsorship_inquiries (id TEXT PRIMARY KEY,company_name TEXT NOT NULL,contact_name TEXT,work_email TEXT NOT NULL,website TEXT,interest TEXT NOT NULL CHECK(interest IN ('HUB','DALLAS','CITY_PARTNER','UNSURE')),message TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'NEW');
      INSERT INTO sponsorship_inquiries VALUES ('historical','Old Company',NULL,'old@example.com',NULL,'CITY_PARTNER','Historical request','2026-01-01T00:00:00.000Z','CONTACTED');`);
    legacy.close();
    const store=new SponsorshipInquiryStore(db),old=store.get('historical')!;
    assert.equal(old.interest,'CITY_PARTNER');assert.equal(old.status,'CONTACTED');assert.equal(old.message,'Historical request');
    assert.equal(old.requestKind,'INQUIRY');assert.equal(old.packageId,null);assert.equal(old.emailConsent,null);assert.equal(old.consentedAt,null);assert.equal(old.consentText,null);
    const now=new Date('2026-11-25T12:00:00.000Z'),created=store.create(validateSponsorshipInquiry(waitlist)!,now);
    assert.ok('id' in created);const saved=store.get(created.id)!;
    assert.equal(saved.requestKind,'WAITLIST');assert.equal(saved.packageId,'HUB_SPOTLIGHT');assert.equal(saved.emailConsent,true);
    assert.equal(saved.consentedAt,now.toISOString());assert.equal(saved.consentText,advertisingWaitlistConsent);
    assert.ok('limited' in store.create(validateSponsorshipInquiry({...waitlist,packageId:'DALLAS_NETWORK'})!,now));
    assert.equal(store.updateStatus(created.id,'CONTACTED'),true);store.close();
    const reopened=new SponsorshipInquiryStore(db);assert.equal(reopened.list().length,2);assert.equal(reopened.get(created.id)?.status,'CONTACTED');assert.equal(reopened.get(created.id)?.emailConsent,true);reopened.close();
    const view=awaitOperator(db,'view',created.id);assert.equal(JSON.parse(view).packageId,'HUB_SPOTLIGHT');assert.equal(JSON.parse(view).consentText,advertisingWaitlistConsent);
    assert.match(awaitOperator(db,'list'),/WAITLIST/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
function awaitOperator(db:string,...args:string[]):string {
  const result=spawnSync(process.execPath,['--import','tsx','server/src/sponsorship-inquiries-cli.ts',...args],{env:{...process.env,AIRPORT_CHAOS_PROFILE_DB:db},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);return result.stdout;
}

test('waitlist API keeps the collection gate, validation and rate limits and confirms durable storage only',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'airport-waitlist-api-')),db=join(dir,'test.sqlite');
  try {
    await runServer(db,false,async origin=>{assert.equal((await post(origin,waitlist)).status,503);});
    await runServer(db,true,async origin=>{
      assert.equal((await post(origin,{...waitlist,emailConsent:false})).status,400);
      assert.equal((await post(origin,{...waitlist,packageId:'CITY_PARTNER'})).status,400);
      assert.equal((await post(origin,{...waitlist,price:1})).status,400);
      assert.equal((await post(origin,waitlist,{Origin:'https://evil.example'})).status,403);
      const response=await post(origin,waitlist);assert.equal(response.status,201);
      const result=await response.json() as {requestId:string;status:string};assert.equal(result.status,'RECEIVED');
      const store=new SponsorshipInquiryStore(db);assert.equal(store.get(result.requestId)?.packageId,'HUB_SPOTLIGHT');assert.equal(store.get(result.requestId)?.emailConsent,true);store.close();
      assert.equal((await post(origin,waitlist)).status,429);
      assert.equal((await post(origin,{...waitlist,packageId:'DALLAS_NETWORK',workEmail:'dallas@example.com'})).status,201);
      assert.equal((await post(origin,{...waitlist,workEmail:'third@example.com'})).status,429);
    });
    const broken=new DatabaseSync(db);broken.exec("CREATE TRIGGER waitlist_write_fail BEFORE INSERT ON sponsorship_inquiries BEGIN SELECT RAISE(FAIL,'storage unavailable'); END;");broken.close();
    await runServer(db,true,async origin=>{assert.equal((await post(origin,{...waitlist,workEmail:'failure@example.com'})).status,503);});
    const store=new SponsorshipInquiryStore(db);assert.equal(store.list().length,2);store.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
