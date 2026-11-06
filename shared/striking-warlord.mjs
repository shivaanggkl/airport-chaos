import {ashenWarlordModel as model} from './ashen-warlord-model.mjs';
/** M20-only timings shared by authoritative combat and authored presentation. */
export const strikingWarlord=Object.freeze({
  motions:Object.freeze(['idle','jump','landing','turn','punch','roar','charge','shoot','defeat']),
  jumpInterval:18,jumpBend:.65,jumpSeconds:model.clips.jump.duration,landSeconds:model.clips.landing.duration,
  jumpHeight:model.height*.22,roarInterval:20,roarSeconds:model.clips.roar.duration,
  castSeconds:model.clips.charge.duration,shootSeconds:model.clips.shoot.duration,releaseSeconds:1.3,
  defeatSeconds:model.clips.defeat.duration+.7,
});
