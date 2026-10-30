import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SponsorshipManagementStore, HUB_PLACEMENT_ID, commercialEvidenceKeys, type CommercialEvidence } from './sponsorship-management.js';
import { SponsorshipDelivery, sponsorDeliveryGates } from './sponsorship-delivery.js';
const actor = 'test-host-operator';
const evidence = Object.fromEntries(commercialEvidenceKeys.map(key => [key, `TEST-ONLY-${key}`])) as CommercialEvidence;
function fixture() {
  const dir = mkdtempSync('/tmp/airport-p7-'), assets = join(dir, 'assets'), db = join(dir, 'profiles.sqlite');
  mkdirSync(assets); copyFileSync('server/src/fixtures/p3-demo.webp', join(assets,'house.webp'));
  const store = new SponsorshipManagementStore(db,{assetRoot:assets});
  const advertiser = store.createAdvertiser({companyName:'Airport Chaos — Sponsorship QA Demo'},actor).id;
  store.setAdvertiserStatus(advertiser,'APPROVED',null,actor);
  const creative = store.registerCreative({advertiserId:advertiser,assetRef:'house.webp',targetPlacementId:HUB_PLACEMENT_ID},actor).id;
  store.setCreativeStatus(creative,'APPROVED',null,actor);
  const startsAt = new Date(Date.now()-60000).toISOString(), endsAt = new Date(Date.parse(startsAt)+30*86400000).toISOString();
  const campaign = store.createCampaign({advertiserId:advertiser,title:'Internal 30-day pilot',startsAt,endsAt},actor).id;
  store.addAssignment(campaign,creative,HUB_PLACEMENT_ID,actor);
  store.setCampaignStatus(campaign,'IN_REVIEW',null,actor); store.setCampaignStatus(campaign,'APPROVED',null,actor);
  return {store,dir,db,assets,campaign,creative,advertiser,cleanup(){store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('commercial readiness requires every explicit reference and restricted operator identity',()=>{
 const f=fixture(); try {
  assert.equal(f.store.commercialReadiness(f.campaign).commercial,'BLOCKED');
  for(const key of commercialEvidenceKeys) { const invalid={...evidence}; delete (invalid as Partial<CommercialEvidence>)[key]; assert.throws(()=>f.store.recordCommercialRelease(f.campaign,invalid,false,actor)); }
  assert.throws(()=>f.store.recordCommercialRelease(f.campaign,evidence,false,''));
  assert.throws(()=>f.store.recordCommercialRelease(f.campaign,{...evidence,url:'https://example.com'} as CommercialEvidence,false,actor));
  f.store.recordCommercialRelease(f.campaign,evidence,false,actor);
  const ready=f.store.commercialReadiness(f.campaign); assert.equal(ready.commercial,'RECORDED'); assert.equal(ready.serving,'BLOCKED');
  assert.ok(f.store.auditEvents(100,0,f.campaign).some(row=>row.action==='COMMERCIAL_EVIDENCE_RECORDED'));
  f.store.revokeCommercialRelease(f.campaign,actor); assert.equal(f.store.commercialReadiness(f.campaign).commercial,'BLOCKED');
 } finally {f.cleanup();}
});
test('release references survive restart, but material edits and pause invalidate authorization',()=>{
 const f=fixture(); try {
  f.store.recordCommercialRelease(f.campaign,evidence,false,actor);
  const reopened=new SponsorshipManagementStore(f.db,{assetRoot:f.assets});
  assert.equal(reopened.commercialReadiness(f.campaign).commercial,'RECORDED'); reopened.close();
  f.store.editCampaign(f.campaign,{title:'Reworded internal title'},actor); assert.equal(f.store.commercialReadiness(f.campaign).commercial,'RECORDED');
  f.store.setCampaignStatus(f.campaign,'PAUSED',null,actor); assert.equal(f.store.commercialReadiness(f.campaign).commercial,'BLOCKED');
  f.store.setCampaignStatus(f.campaign,'IN_REVIEW',null,actor); f.store.setCampaignStatus(f.campaign,'APPROVED',null,actor);
  f.store.recordCommercialRelease(f.campaign,evidence,false,actor);
  f.store.editCampaign(f.campaign,{endsAt:new Date(Date.now()+31*86400000).toISOString()},actor);
  assert.equal(f.store.commercialReadiness(f.campaign).commercial,'BLOCKED');
 }finally{f.cleanup();}
});
test('changed public branding or artwork invalidates recorded evidence; suspended advertiser cannot release',()=>{
 const f=fixture();try{
  f.store.recordCommercialRelease(f.campaign,evidence,false,actor);
  f.store.setAdvertiserPublicInfo(f.advertiser,'Changed public description',true,actor);
  assert.ok(f.store.commercialReadiness(f.campaign).blockers.includes('RELEASE_EVIDENCE_STALE'));
  f.store.setCreativeStatus(f.creative,'DISABLED',null,actor);
  assert.throws(()=>f.store.recordCommercialRelease(f.campaign,evidence,false,actor));
  f.store.setAdvertiserStatus(f.advertiser,'SUSPENDED',null,actor);
  assert.equal(f.store.commercialReadiness(f.campaign).technical,'BLOCKED');
 }finally{f.cleanup();}
});
test('simulated signoff cannot operate in production; even recorded approval cannot enable production serving',()=>{
 const f=fixture(); const old=process.env.NODE_ENV, qa=process.env.AIRPORT_CHAOS_DEV_QA;
 try{
  process.env.NODE_ENV='production';process.env.AIRPORT_CHAOS_DEV_QA='1';
  assert.throws(()=>f.store.recordCommercialRelease(f.campaign,evidence,true,actor));
  process.env.NODE_ENV='test'; f.store.recordCommercialRelease(f.campaign,evidence,true,actor);
  assert.equal(f.store.commercialReadiness(f.campaign).commercial,'QA_SIMULATED');
  f.store.setCampaignDeliveryApproval(f.campaign,true,actor);
  const gates=sponsorDeliveryGates({NODE_ENV:'production',AIRPORT_CHAOS_DEV_QA:'1',SPONSORSHIP_QA_SERVING_ENABLED:'true',SPONSORSHIP_PAID_HUB_ENABLED:'true',SPONSORSHIP_GLOBAL_PAUSE:'false',AIRPORT_CHAOS_PROFILE_DB:f.db,AIRPORT_CHAOS_SPONSOR_ASSET_ROOT:f.assets});
  assert.equal(new SponsorshipDelivery(f.store,gates).catalog().hub,null);
  assert.equal(new SponsorshipDelivery(f.store,{...gates,qaServing:true,hubEnabled:true,globalPause:true}).catalog().hub,null);
  assert.equal(new SponsorshipDelivery(f.store,{...gates,qaServing:true,hubEnabled:true,globalPause:false}).catalog(new Date(),'unknown').hub,null);
 }finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;if(qa===undefined)delete process.env.AIRPORT_CHAOS_DEV_QA;else process.env.AIRPORT_CHAOS_DEV_QA=qa;f.cleanup();}
});
test('pilot readiness supports advance review, rejects wrong duration, and does not revive expired campaigns',()=>{
 const f=fixture();try{
  const start=new Date(Date.now()+86400000).toISOString(), end=new Date(Date.parse(start)+30*86400000).toISOString();
  f.store.editCampaign(f.campaign,{startsAt:start,endsAt:end},actor);
  f.store.setCampaignStatus(f.campaign,'APPROVED',null,actor);
  f.store.recordCommercialRelease(f.campaign,evidence,false,actor);
  const future=f.store.commercialReadiness(f.campaign);assert.equal(future.technical,'READY');assert.equal(future.currentScheduleEligible,false);
  assert.equal(f.store.commercialReadiness(f.campaign,end).technical,'BLOCKED');
  f.store.editCampaign(f.campaign,{endsAt:new Date(Date.parse(end)+86400000).toISOString()},actor);
  assert.ok(f.store.commercialReadiness(f.campaign).blockers.includes('FIRST_PILOT_REQUIRES_30_DAYS'));
  assert.throws(()=>f.store.recordCommercialRelease(f.campaign,evidence,false,actor));
 }finally{f.cleanup();}
});
test('first Hub pilot remains exclusive; adjacent 30-day bookings are allowed',()=>{
 const f=fixture();try{
  const first=f.store.getCampaign(f.campaign)!;
  const proposal=(startsAt:string,endsAt:string)=>{const id=f.store.createCampaign({advertiserId:f.advertiser,title:'Second pilot proposal',startsAt,endsAt},actor).id;f.store.addAssignment(id,f.creative,HUB_PLACEMENT_ID,actor);f.store.setCampaignStatus(id,'IN_REVIEW',null,actor);return id;};
  const overlap=proposal(first.startsAt,first.endsAt);
  assert.throws(()=>f.store.setCampaignStatus(overlap,'APPROVED',null,actor),/conflict/i);
  assert.throws(()=>f.store.recordCommercialRelease(overlap,evidence,false,actor));
  const adjacent=proposal(first.endsAt,new Date(Date.parse(first.endsAt)+30*86400000).toISOString());
  f.store.setCampaignStatus(adjacent,'APPROVED',null,actor);assert.equal(f.store.conflicts(adjacent).length,0);
 }finally{f.cleanup();}
});
