import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M23_INTRO,m23IntroMotion,m23GaitTimes,m23GaitDistance} from './m23-intro';
export const M24_INTRO=Object.freeze({...M23_INTRO,roar:12,aimTurn:12+model.clips.roar!.duration,cast:16,shoot:16,release:17.3,monsterEnd:20,runway:24,objective:26.5,handoff:26.5,duration:28});
export function m24IntroText(t:number):string {
  return t<4?'Dr. Boss is back for one final battle!':t<8?"He's faster than ever!":t<12?'And stronger than ever!':t<16?"He won't give up!":t<20?'His energy attack is coming!':t<24?'This is your final chance to save Dallas!':t<26.5?"Pilot! It's time to finish this!":t<28?'DEFEAT THE MONSTER':'';
}
function runTime(t:number,phase:number):number {
  return phase/model.clips.walk!.duration*model.clips.run!.duration+m23GaitTimes(t,phase).walk-phase;
}
export function m24Travel(t:number,phase=0):number {
  return m23GaitDistance('run',runTime(t,phase))-m23GaitDistance('run',runTime(0,phase));
}
/** M2 uses only its approved Run, Turn, Roar, Shoot and Idle clips. */
export function m24IntroMotion(t:number,phase=0):ReturnType<typeof m23IntroMotion>{
  const motion=m23IntroMotion(t,phase,true);
  let key='idle',time=t;
  if(t>=.35&&t<7){key='run';time=runTime(t,phase);}
  else if(t>=8&&t<9.4){key='turn';time=t-8;}
  else if(t>=12&&t<12+model.clips.roar!.duration){key='roar';time=t-12;}
  else if(t>=M24_INTRO.shoot&&t<M24_INTRO.monsterEnd){key='shoot';time=t-M24_INTRO.shoot;}
  return {...motion,key,time:time%model.clips[key]!.duration,lookYaw:0};
}
