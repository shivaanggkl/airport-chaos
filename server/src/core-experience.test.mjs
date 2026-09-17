import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { applyAircraftCosmetics } from '../../client/src/aircraft-cosmetics.js';
import { aircraftFlightEnvelope, FLIGHT_UNITS_PER_METER } from '../../shared/aircraft-flight-envelope.mjs';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { generateDallasSkyline, dallasFacadePalette, dallasFacadePatterns, skylineAirportExcluded } from '../../shared/dallas-skyline.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';

test('every aircraft has a fast finite envelope, with independent safe ground handling',()=>{
  for(const envelope of Object.values(aircraftFlightEnvelope)){
    assert.ok(envelope.topSpeed>=5000);
    assert.equal(envelope.maxSpeed*FLIGHT_UNITS_PER_METER,envelope.topSpeed);
    assert.ok(Object.values(envelope).every(value=>Number.isFinite(value)&&value>0));
    assert.ok(envelope.groundMaxSpeed<envelope.maxSpeed/5);
    assert.ok(envelope.safeLandingSpeed>envelope.takeoffSpeed);
  }
  assert.ok(aircraftFlightEnvelope.fighter.maxSpeed>aircraftFlightEnvelope.privateJet.maxSpeed);
  assert.ok(aircraftFlightEnvelope.cargo.acceleration/aircraftFlightEnvelope.cargo.inertia<aircraftFlightEnvelope.trainer.acceleration/aircraftFlightEnvelope.trainer.inertia);
});
test('cosmetic path isolates instances, preserves glass and repaints late loaded paint slots',()=>{
  const shared = new THREE.MeshStandardMaterial({color:0xffffff}); shared.name='AC_LIVERY_PRIMARY';
  const glass = new THREE.MeshStandardMaterial({color:0x123456}); glass.name='AC_GLASS';
  const root=new THREE.Group(),other=new THREE.Mesh(new THREE.BoxGeometry(),shared);
  const paint=new THREE.Mesh(new THREE.BoxGeometry(),shared);root.add(paint,new THREE.Mesh(new THREE.BoxGeometry(),glass));
  const equipped={'livery:trainer':'bluejay-sunset'};
  applyAircraftCosmetics(root,'trainer',equipped);
  assert.equal(paint.material.color.getHex(),0xd96b27);assert.equal(other.material.color.getHex(),0xffffff);assert.equal(glass.color.getHex(),0x123456);
  const late=new THREE.Mesh(new THREE.BoxGeometry(),shared);root.add(late);
  applyAircraftCosmetics(root,'trainer',root.userData.equippedCosmetics);
  assert.equal(late.material.color.getHex(),0xd96b27);
  applyAircraftCosmetics(root,'trainer',{'livery:trainer':'unknown'});
  assert.equal(paint.material.color.getHex(),0x1769b8);
  assert.ok(cosmeticCatalog.filter(item=>item.category==='livery'&&item.aircraftRestriction==='trainer').length>=10);
});
test('Dallas core is deterministic, at least 80% high-rise, with 15 facades and safe airport approaches',()=>{
  const buildings=generateDallasSkyline(cityAirports.dallas);
  assert.deepEqual(buildings,generateDallasSkyline(cityAirports.dallas));
  assert.ok(buildings.length>250);assert.ok(buildings.filter(b=>b.height>=100).length/buildings.length>=.8);
  assert.ok(dallasFacadePalette.length>=15);assert.ok(dallasFacadePatterns.length>=15);
  for(const b of buildings)assert.equal(skylineAirportExcluded(b.x,b.z,65,cityAirports.dallas),false);
  assert.equal(skylineAirportExcluded(cityAirports.dallas[0].x,cityAirports.dallas[0].z,65,cityAirports.dallas),true);
});

test('equipped paint survives aircraft changes, a city arrival, and a reopened profile store', async()=>{
  const {mkdtempSync}=await import('node:fs'); const {tmpdir}=await import('node:os'); const {join}=await import('node:path');
  const {PlayerProfileStore}=await import('./player-profiles.js');
  const path=join(mkdtempSync(join(tmpdir(),'airport-paint-')),'profiles.sqlite');
  const db=new PlayerProfileStore(path);db.getOrCreate('paint-pilot','Pilot');db.awardServerReward('paint-pilot',50000);
  assert.equal(db.purchaseCosmetic('paint-pilot','bluejay-sunset').ok,true);
  assert.equal(db.equipCosmetic('paint-pilot','bluejay-sunset').ok,true);
  assert.equal(db.purchaseAircraft('paint-pilot','cargo').ok,true);
  assert.equal(db.equipAircraft('paint-pilot','cargo')?.selectedAircraft,'cargo');
  const now=Date.now();assert.equal(db.startIntercityRoute('paint-pilot','dallas-milwaukee','dallas',now).ok,true);
  assert.equal(db.completeIntercityArrival('paint-pilot','milwaukee',now+60000).profile?.cosmetics.equipped['livery:trainer'],'bluejay-sunset');
  const reopened=new PlayerProfileStore(path);
  assert.equal(reopened.getOrCreate('paint-pilot','Pilot').cosmetics.equipped['livery:trainer'],'bluejay-sunset');
});
