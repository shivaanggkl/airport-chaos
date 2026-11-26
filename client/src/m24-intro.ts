import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M23_INTRO,m23IntroMotion,m23GaitTimes,m23GaitDistance} from './m23-intro';
export const M24_INTRO=Object.freeze({...M23_INTRO,firingDistances:Object.freeze([18000,20000,22000]),outskirtsDistance:12500,roar:0,run:4,runEnd:11,secondRoar:20,monsterEnd:24,runway:24,objective:26.5,handoff:26.5,duration:28});
export function m24IntroText(t:number):string {
  return t<4?'His roar shakes Dallas.':t<12?'Dr. Boss charges toward downtown!':t<20?'Fireballs strike outside downtown!':t<24?'Downtown is next. Stop him!':t<28?'Pilot, defeat Dr. Boss. Save Dallas!':'';
}
function runTime(t:number,phase:number):number {
  const elapsed=Math.max(0,Math.min(M24_INTRO.runEnd-M24_INTRO.run,t-M24_INTRO.run));
  return phase/model.clips.walk!.duration*model.clips.run!.duration+m23GaitTimes(elapsed,phase).walk-phase;
}
/** Roar on the spot, then take measured running steps toward downtown before firing. */
export function m24Travel(t:number,phase=0):number {
  return m23GaitDistance('run',runTime(t,phase))-m23GaitDistance('run',runTime(0,phase));
}
export function m24IntroMotion(t:number,phase=0):ReturnType<typeof m23IntroMotion>{
  let key='idle',time=t;
  if(t>=0&&t<model.clips.roar!.duration){key='roar';time=t;}
  else if(t>=M24_INTRO.run&&t<M24_INTRO.runEnd){key='run';time=runTime(t,phase);}
  else if(t>=M24_INTRO.secondRoar&&t<M24_INTRO.secondRoar+model.clips.roar!.duration){key='roar';time=t-M24_INTRO.secondRoar;}
  else if(t>=M24_INTRO.shoot&&t<M24_INTRO.shoot+model.clips.shoot!.duration){key='shoot';time=t-M24_INTRO.shoot;}
  return {...m23IntroMotion(t,phase),key,time:time%model.clips[key]!.duration,height:0,yawOffset:0,lookUp:0,lookYaw:0};
}
