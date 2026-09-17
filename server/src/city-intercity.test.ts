import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import {airportsForCity,cityDefinition,normalizeCityId,routeDefinition,routesFromCity}from'../../shared/city-registry.mjs';
import {airportForCity}from'../../shared/city-airports.mjs';
import {weatherZonesForCity}from'../../shared/weather-zones.mjs';
import {PlayerProfileStore}from'./player-profiles.js';
function store(){return new PlayerProfileStore(join(mkdtempSync(join(tmpdir(),'airport-city-')),'profiles.sqlite'));}

test('city registry loads both cities and preserves legacy ids',()=>{assert.equal(cityDefinition('dallas')?.cityId,'dallas');assert.equal(cityDefinition('city_dallas_001')?.cityId,'dallas');assert.equal(cityDefinition('milwaukee')?.cityId,'milwaukee');assert.equal(normalizeCityId('unknown'),undefined);});
test('airport lookup is city scoped and unknown ids are safe',()=>{assert.equal(airportsForCity('dallas').length,4);assert.equal(airportsForCity('milwaukee').length,4);assert.equal(airportForCity('milwaukee','coast')?.id,'coast');assert.equal(airportForCity('dallas','coast'),undefined);});
test('city 2 exposes lightweight weather and bidirectional routes',()=>{assert.equal(weatherZonesForCity('milwaukee').length,3);assert.equal(routesFromCity('dallas')[0]?.toCityId,'milwaukee');assert.equal(routesFromCity('milwaukee')[0]?.toCityId,'dallas');});
test('intercity start, reconnect restore, completion and reward are idempotent',()=>{const db=store();db.getOrCreate('pilot','Pilot');const now=Date.UTC(2026,8,17);assert.equal(db.startIntercityRoute('pilot','dallas-milwaukee','dallas',now).ok,true);assert.equal(db.getOrCreate('pilot','Pilot').intercityRoute?.toCityId,'milwaukee');const first=db.completeIntercityArrival('pilot','milwaukee',now+60_000);assert.equal(first.completed,true);assert.equal(first.credits,routeDefinition('dallas-milwaukee')?.rewardProfile?.credits);const credits=first.profile?.credits;assert.equal(db.completeIntercityArrival('pilot','milwaukee',now+61_000).completed,false);assert.equal(db.getOrCreate('pilot','Pilot').credits,credits);});
test('wrong city and unknown route cannot start or complete',()=>{const db=store();db.getOrCreate('safe','Pilot');assert.equal(db.startIntercityRoute('safe','missing','dallas').ok,false);assert.equal(db.startIntercityRoute('safe','dallas-milwaukee','milwaukee').ok,false);assert.equal(db.completeIntercityArrival('safe','milwaukee').completed,false);});
test('existing profiles migrate additively without active route',()=>{const db=store();const profile=db.getOrCreate('existing','Pilot');assert.equal(profile.intercityRoute,undefined);assert.equal(profile.objectives.dallas!==undefined,true);assert.equal(profile.objectives.milwaukee!==undefined,true);});
