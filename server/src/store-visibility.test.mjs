import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {cosmeticCatalog,newPilotLiveryIds} from '../../shared/cosmetics.mjs';
import {storePaints,storeFeatured,storePurchaseTarget} from '../../client/src/store-catalog.ts';
import {PlayerProfileStore} from './player-profiles.js';

const hidden=['bluejay-skybolt','bluejay-aurora','mammoth-desert-sand','mammoth-arctic-rescue','nightowl-sky-blue','nightowl-forest-green','nightowl-premium-gold','firehawk-midnight-black'];
test('Store hides only the requested paints; featured offers retain a visible, valid purchase target',()=>{
 assert.deepEqual(storePaints.map(p=>p.id),['bluejay-classic','mammoth-sand','nightowl-sunset-red','firehawk-inferno','firehawk-stealth-gray']);
 for(const id of hidden){assert.ok(cosmeticCatalog.some(p=>p.id===id),'cosmetic asset/config must remain');assert.equal(storePaints.some(p=>p.id===id),false);}
 for(const item of storeFeatured)assert.ok(storePurchaseTarget(item));
 assert.equal(storePurchaseTarget(storeFeatured.find(p=>p.aircraftType==='privateJet')).id,'nightowl-sunset-red');
});
test('new pilots start in Legacy White; existing selections, hidden ownership and balances survive reload',()=>{
 const dir=mkdtempSync(join(tmpdir(),'airport-store-visibility-')),path=join(dir,'profiles.sqlite');
 const store=new PlayerProfileStore(path),db=new DatabaseSync(path);
 try{
  const fresh=store.getOrCreate('new','Pilot');
  assert.equal(newPilotLiveryIds.trainer,'bluejay-classic');assert.equal(fresh.cosmetics.equipped['livery:trainer'],'bluejay-classic');assert.ok(fresh.cosmetics.ownedIds.includes('bluejay-classic'));
  store.getOrCreate('legacy','Pilot');
  db.prepare('DELETE FROM pilot_cosmetics WHERE pilot_id=? AND cosmetic_id=?').run('legacy','bluejay-classic');
  db.prepare('UPDATE pilot_equipped_cosmetics SET cosmetic_id=? WHERE pilot_id=? AND category=?').run('bluejay-skybolt','legacy','livery:trainer');
  const grant=db.prepare('INSERT OR IGNORE INTO pilot_cosmetics VALUES(?,?,?)');for(const id of hidden)grant.run('legacy',id,1);
  const before=store.getOrCreate('legacy','Pilot');
  const reopened=new PlayerProfileStore(path),after=reopened.getOrCreate('legacy','Pilot');
  assert.equal(after.cosmetics.equipped['livery:trainer'],'bluejay-skybolt');assert.equal(after.cosmetics.ownedIds.includes('bluejay-classic'),false);
  for(const id of hidden)assert.ok(after.cosmetics.ownedIds.includes(id));
  assert.deepEqual([after.credits,after.skyTokens],[before.credits,before.skyTokens]);
  assert.equal(reopened.equipCosmetic('legacy','bluejay-aurora').ok,true);
  assert.equal(new PlayerProfileStore(path).getOrCreate('legacy','Pilot').cosmetics.equipped['livery:trainer'],'bluejay-aurora');
  assert.equal(reopened.getOrCreate('new','Pilot').cosmetics.equipped['livery:trainer'],'bluejay-classic');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
