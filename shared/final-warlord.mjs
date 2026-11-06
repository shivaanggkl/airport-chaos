import {showdownWarlord} from './showdown-warlord.mjs';
import {pursuitWarlord} from './pursuit-warlord.mjs';
/** Visible M24 alone: Hard tactics with bounded, non-damaging Run locomotion. */
export const finalWarlord=Object.freeze({...showdownWarlord,motions:pursuitWarlord.motions,
 runSeconds:4,runCooldown:8,runDistance:3500,roarInterval:16,approachBeforeShot:true,
});
