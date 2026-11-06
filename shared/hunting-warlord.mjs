import {strikingWarlord} from './striking-warlord.mjs';
export const huntingWarlord=Object.freeze({
 ...strikingWarlord,motions:Object.freeze(['idle','walk','turn','punch','roar','charge','shoot','defeat']),
 roarInterval:18,combatDistance:1800,roamRadius:6000,
});
