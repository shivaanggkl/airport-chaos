import {ashenWarlordModel as model} from './ashen-warlord-model.mjs';
/** M22-only configuration, independent of other missions' combat settings. */
export const showdownWarlord=Object.freeze({
 motions:Object.freeze(['idle','walk','turn','punch','roar','charge','shoot','defeat']),
 roarInterval:18,roarSeconds:model.clips.roar.duration,combatDistance:1800,roamRadius:6000,
 castSeconds:model.clips.charge.duration,shootSeconds:model.clips.shoot.duration,releaseSeconds:1.3,
 defeatSeconds:model.clips.defeat.duration+.7,
 decisionInterval:.1,restSeconds:.65,restVariation:.55,flankDistance:900,repositionSeconds:3,
});
