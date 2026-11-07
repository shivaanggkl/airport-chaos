import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';

// One slow authored step, then the complete 3.625-second Roar, ending exactly at 6s.
export const M19_INTRO = Object.freeze({walkEnd: 6-model.clips.roar!.duration, monsterEnd: 6, handoff: 10.5, duration: 12});
export function m19IntroText(seconds:number):string {
  return seconds<M19_INTRO.walkEnd?'ASHEN WARLORD':seconds<M19_INTRO.monsterEnd
    ?'CONTROL: MONSTER HEADING DOWNTOWN!':seconds<M19_INTRO.handoff?'PILOT, STOP IT BEFORE DALLAS FALLS!':'';
}
/** Match displacement to the supplied gait's measured distance, including its nonuniform steps. */
export function m19WalkDistance(clipTime:number):number {
  const clip=model.clips.walk!,curve=clip.distanceCurve!,index=Math.max(0,Math.min(1,clipTime/clip.duration))*(curve.length-1);
  const lo=Math.floor(index),hi=Math.min(curve.length-1,lo+1);
  return (curve[lo]!+(curve[hi]!-curve[lo]!)*(index-lo))*clip.stride!*model.height;
}
