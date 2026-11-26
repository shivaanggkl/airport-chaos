import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M23_INTRO,m23IntroMotion,m23GaitTimes,m23GaitDistance} from './m23-intro';
export const M24_INTRO=Object.freeze({...M23_INTRO,monsterEnd:20,runway:24,objective:26.5,handoff:26.5,duration:28});
export function m24IntroText(t:number):string {
  return t<4?'Dr. Boss is back for one final battle!':t<8?"He's faster than ever!":t<12?'And stronger than ever!':t<16?"He won't give up!":t<20?'His energy attack is coming!':t<24?'This is your final chance to save Dallas!':t<26.5?"Pilot! It's time to finish this!":t<28?'DEFEAT THE MONSTER':'';
}
function runTime(t:number,phase:number):number {
  return phase/model.clips.walk!.duration*model.clips.run!.duration+m23GaitTimes(t,phase).walk-phase;
}
/** Match displacement to the authored running steps; M1 keeps its walking approach. */
export function m24Travel(t:number,phase=0):number {
  return m23GaitDistance('run',runTime(t,phase))-m23GaitDistance('run',runTime(0,phase));
}
export function m24IntroMotion(t:number,phase=0):ReturnType<typeof m23IntroMotion>{
  const motion=m23IntroMotion(t,phase);
  if(motion.key==='walk')return {...motion,key:'run',time:runTime(t,phase)%model.clips.run!.duration};
  if(t>=M24_INTRO.monsterEnd)return {...motion,key:'idle',time:t%model.clips.idle!.duration};
  return motion;
}
