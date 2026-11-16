import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PlayerProfileStore } from './player-profiles.js';
import { PlayerWallet, type WalletTransactionReason } from './player-wallet.js';
import { AirAssaultRewards } from './air-assault.js';
import { cityChallenges } from '../../shared/city-challenges.mjs';
import { missionsForCity } from '../../shared/city-missions.mjs';
import { cityDiscoveries } from '../../shared/city-discoveries.mjs';
import { challengeCreditReward } from '../../shared/reward-economy.mjs';
import { aircraftCreditPrice } from '../../shared/aircraft-economy.mjs';

function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'credit-policy-')),path=join(dir,'profiles.sqlite');
  const profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');
  const db=new DatabaseSync(path),wallet=new PlayerWallet(db);
  return {path,profiles,db,wallet,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
const retired:WalletTransactionReason[]=['FLIGHT_REWARD','LANDING_REWARD','DISCOVERY_REWARD','INTERCITY_REWARD','COMBAT_REWARD','EVENT_REWARD','TERRITORY_REWARD','OBJECTIVE_REWARD'];

test('ordinary gameplay and direct retired wallet sources cannot credit, while stats, XP and discovery remain',()=>{
  const f=fixture();try{
    for(const reason of retired){
      assert.equal(f.wallet.credit({pilotId:'pilot',currency:'CREDITS',amount:500,reason}).ok,false);
      f.profiles.awardServerReward('pilot',500,{eventCompletions:1},reason);
    }
    const xp=f.profiles.awardServerRewardAndXp('pilot',75,undefined,'LANDING_REWARD','dfw',
      {source:'LANDING',eventId:'verified-landing',cityId:'dallas',now:Date.now()});
    assert.equal(xp.xp?.awarded,true);
    f.profiles.recordScoredLanding('pilot');
    f.profiles.recordAcceptedFlightDistance('pilot',20_000);
    const discovered=f.profiles.recordVerifiedDiscovery('pilot','dallas',cityDiscoveries.dallas[0]!.id)!;
    assert.ok(discovered);assert.equal(discovered.xp.awarded,true);
    f.profiles.awardServerRewardOnce('pilot','chaos-event:test',100,{eventCompletions:1});
    assert.equal(f.profiles.applyClientReward('pilot',`reward-${Date.now().toString(36)}-fake`,'cargo'),undefined);
    f.profiles.importLegacy('pilot',{credits:99_999});
    const p=f.profiles.getOrCreate('pilot','Pilot');
    assert.equal(p.credits,0);assert.equal(p.totalDistance,20_000);assert.equal(p.successfulLandings,1);
    assert.equal(p.eventCompletions,retired.length+1);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE direction='CREDIT'").get()!.n,0);
  }finally{f.close();}
});

test('daily and weekly ordinary objectives progress with zero payouts, including saved old rewards',()=>{
 const f=fixture();try{
  const before=f.profiles.objectivesForCity('pilot','dallas')!;
  const state=before.objectives.dallas!;
  // Emulate a pre-cleanup saved cycle advertising nonzero rewards.
  for(const item of [...state.daily,...state.weekly])item.reward=999;
  f.db.prepare('UPDATE player_profiles SET objectives=? WHERE pilot_id=?').run(JSON.stringify({dallas:state}),'pilot');
  for(const item of [...state.daily,...state.weekly])f.profiles.recordObjectiveActivity('pilot','dallas',item.activity,1_000_000,item.activity==='landing'?'dfw':undefined);
  const after=f.profiles.getOrCreate('pilot','Pilot');
  assert.equal(after.credits,0);
  assert.ok([...after.objectives.dallas!.daily,...after.objectives.dallas!.weekly].every(item=>item.reward===0));
  assert.ok(after.objectives.dallas!.daily.some(item=>item.progress>0));
 }finally{f.close();}
});

test('Sky Challenge pays its configured reward once per player and survives reopen, replay and receipt pruning',()=>{
 const f=fixture();try{
  const c=cityChallenges.dallas[0]!;const amount=challengeCreditReward(c.reward);
  assert.equal(f.profiles.completeSkyChallenge('pilot','dallas',c.id).credits,amount);
  f.db.exec('DELETE FROM profile_reward_receipts');
  const reopened=new PlayerProfileStore(f.path);
  assert.equal(reopened.completeSkyChallenge('pilot','dallas',c.id).credits,0);
  assert.equal(reopened.completeSkyChallenge('pilot','dallas','forged').credits,0);
  assert.equal(reopened.getOrCreate('pilot','Pilot').credits,amount);
  assert.ok(reopened.getOrCreate('pilot','Pilot').claimedSkyChallenges.includes(c.id));
  reopened.getOrCreate('other','Other');
  assert.equal(reopened.completeSkyChallenge('other','dallas',c.id).credits,amount);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE pilot_id='pilot' AND reason='CHALLENGE_REWARD'").get()!.n,1);
 }finally{f.close();}
});

test('historically paid and wallet-cap Sky Challenges cannot pay after cleanup or spending',()=>{
 const f=fixture();try{
  const [old,capped]=cityChallenges.dallas;
  f.wallet.credit({pilotId:'pilot',currency:'CREDITS',amount:100,reason:'CHALLENGE_REWARD',referenceId:old!.id});
  assert.equal(f.profiles.completeSkyChallenge('pilot','dallas',old!.id).credits,0);
  f.db.prepare("UPDATE player_profiles SET credits=1000000 WHERE pilot_id='pilot'").run();
  assert.equal(f.profiles.completeSkyChallenge('pilot','dallas',capped!.id).credits,0);
  assert.ok(f.profiles.getOrCreate('pilot','Pilot').claimedSkyChallenges.includes(capped!.id));
  f.wallet.debit({pilotId:'pilot',currency:'CREDITS',amount:1000,reason:'AIRCRAFT_PURCHASE'});
  assert.equal(f.profiles.completeSkyChallenge('pilot','dallas',capped!.id).credits,0);
  assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,999000);
 }finally{f.close();}
});

test('AI Air Assault cannot mint Credits after wins, survival, restart or replay',()=>{
 const f=fixture();try{
  for(const result of ['full','survival','destroyed'] as const){
   const rewards=new AirAssaultRewards(f.path);assert.equal(rewards.settle('pilot','encounter',0,result,5000).reward,0);rewards.close();
  }
  assert.equal(f.profiles.getOrCreate('pilot','Pilot').credits,0);
 }finally{f.close();}
});

test('existing balances, purchase price, entitlement and ledger remain intact on reopen',()=>{
 const f=fixture();try{
  assert.equal(aircraftCreditPrice('privateJet'),15000);
  f.wallet.credit({pilotId:'pilot',currency:'CREDITS',amount:18000,reason:'ADMIN_ADJUSTMENT',idempotencyKey:'existing-balance'});
  assert.equal(f.profiles.purchaseCosmetic('pilot','nightowl-sunset-red').ok,true);
  const rows=f.db.prepare('SELECT * FROM wallet_transactions ORDER BY created_at,transaction_id').all();
  const reopened=new PlayerProfileStore(f.path),p=reopened.getOrCreate('pilot','Pilot');
  assert.equal(p.credits,3000);assert.ok(p.unlockedAircraft.includes('privateJet'));
  assert.deepEqual(f.db.prepare('SELECT * FROM wallet_transactions ORDER BY created_at,transaction_id').all(),rows);
 }finally{f.close();}
});

test('live gameplay payouts use zero Credits and approved challenge settlement follows validated gates',()=>{
 const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/distanceRewardMeters|distanceBatchCredits|bankChaos\(/);
 assert.match(source,/return \{ score: Math.round\(score \* multiplier\), credits: 0, multiplier \}/);
 assert.match(source,/const landingCredits = 0/);
 assert.match(source,/profileStore.completeSkyChallenge\(player.pilotId, player.cityId, challenge.id, now\)/);
 assert.match(source,/gateIndex !== active.gateIndex/);
 assert.match(source,/player.isBot \|\| other.isBot/);
 assert.match(source,/message.type === 'profileReward'[\s\S]*?return;/);
});


test('legacy city activities retain completion, Score and XP without repeatable mission Credits',()=>{
 const f=fixture();try{
  const mission=missionsForCity('dallas').find(m=>!m.retired)!;
  assert.equal(mission.creditReward,0);
  assert.equal(f.profiles.acceptMission('pilot','dallas',mission.id,false).ok,true);
  const active=f.profiles.missionState('pilot','dallas')!.active!;
  const result=f.profiles.completeMission('pilot','dallas',active.attemptId)!;
  assert.equal(result.credits,0);assert.equal(result.cargoBonusCredits,0);
  assert.equal(result.profile.credits,0);assert.equal(result.score,mission.scoreReward);
  assert.equal(result.profile.missions.dallas!.completions[mission.id]!.count,1);
 }finally{f.close();}
});
