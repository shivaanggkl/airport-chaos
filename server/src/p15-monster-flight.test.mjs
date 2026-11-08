import test from 'node:test';
import {simulate} from './p13-monster-flight.test.mjs';
import {journeyDallas23,journeyDallas19} from '../../shared/journey-mission.mjs';
import {createPursuitWarlordEncounter} from './pursuit-warlord.js';
import {createFinalWarlordEncounter} from './final-warlord.js';

test('MONSTER PURSUIT: real non-Boost Bluejay departure and validated swept hits',t=>{
 t.diagnostic(JSON.stringify(simulate(journeyDallas23,createPursuitWarlordEncounter)));
});
test('FINAL MONSTER BATTLE: real non-Boost Bluejay departure and validated swept hits',t=>{
 t.diagnostic(JSON.stringify(simulate(journeyDallas19,createFinalWarlordEncounter)));
});
