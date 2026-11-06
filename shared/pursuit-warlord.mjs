import {ashenWarlordModel as model} from './ashen-warlord-model.mjs';
export const pursuitWarlord=Object.freeze({
 motions:Object.freeze(['idle','walk','run','turn','punch','roar','charge','shoot','defeat']),
 roarInterval:20,roarSeconds:model.clips.roar.duration,combatDistance:1800,roamRadius:6000,
 castSeconds:model.clips.charge.duration,shootSeconds:model.clips.shoot.duration,releaseSeconds:1.3,
 defeatSeconds:model.clips.defeat.duration+.7,runSeconds:3,runCooldown:10,runDistance:3500,
});
