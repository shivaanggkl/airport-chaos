import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';

export const M19_INTRO = Object.freeze({reveal:4,walkEnd:9,roarEnd:9+model.clips.roar!.duration,monsterEnd:14,objective:18,handoff:18.5,duration:20});
export const M19_DOWNTOWN = Object.freeze({x:-2191,z:-1201});
export function m19IntroText(seconds:number):string {
  return seconds<M19_INTRO.reveal?''
    :seconds<M19_INTRO.walkEnd?'MONSTER DR. BOSS'
    :seconds<M19_INTRO.monsterEnd?'DR. BOSS'
    :seconds<M19_INTRO.objective?"CONTROL: Pilot! Monster Dr. Boss is heading downtown! Stop him before it's too late!"
    :seconds<M19_INTRO.duration?'DEFEAT THE MONSTER':'';
}
/** Match displacement to the supplied gait's measured distance, including its nonuniform steps. */
export function m19WalkDistance(clipTime:number):number {
  const clip=model.clips.walk!,curve=clip.distanceCurve!,index=Math.max(0,Math.min(1,clipTime/clip.duration))*(curve.length-1);
  const lo=Math.floor(index),hi=Math.min(curve.length-1,lo+1);
  return (curve[lo]!+(curve[hi]!-curve[lo]!)*(index-lo))*clip.stride!*model.height;
}
