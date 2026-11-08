import test from 'node:test';
import {simulate} from './p13-monster-flight.test.mjs';
import {journeyDallas21,journeyDallas22} from '../../shared/journey-mission.mjs';
import {createHuntingWarlordEncounter} from './hunting-warlord.js';
import {createShowdownWarlordEncounter} from './showdown-warlord.js';

test('MONSTER HUNT: real non-Boost Bluejay departure and validated swept hits',t=>{
 t.diagnostic(JSON.stringify(simulate(journeyDallas21,createHuntingWarlordEncounter)));
});
test('MONSTER SHOWDOWN: real non-Boost Bluejay departure and validated swept hits',t=>{
 t.diagnostic(JSON.stringify(simulate(journeyDallas22,createShowdownWarlordEncounter)));
});
