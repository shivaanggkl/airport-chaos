import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M22_INTRO,m22IntroMotion} from './m22-intro';

export const M23_INTRO=Object.freeze({...M22_INTRO,run:4,runEnd:7,turn:8,turnEnd:9.4,punch:9.5});
export function m23IntroText(t:number):string {
  return t<4?'Dr. Boss is moving again!':t<8?'Now he can RUN!':t<12?"And he's ready to attack!":t<20?"He's still got his energy powers!":t<24?"He's coming after you!":t<26.5?'Pilot! Stop Dr. Boss before he gets away!':t<28?'DEFEAT THE MONSTER':'';
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
/** Integral of smoothstep: smooth acceleration without speeding up authored clips. */
const ramp=(t:number,start:number,end:number)=>{const x=clamp((t-start)/(end-start));return(end-start)*(x*x*x-.5*x*x*x*x)+Math.max(0,t-end);};
const walkRate=.65;
const runStartRate=walkRate*(model.clips.walk!.stride!/model.clips.walk!.duration)/(model.clips.run!.stride!/model.clips.run!.duration);
export function m23GaitTimes(t:number,phase=0):{walk:number;run:number}{
  const walk=phase+walkRate*ramp(Math.min(t,4),.35,1.1);
  const run=runStartRate*Math.max(0,t-4)+(1-runStartRate)*ramp(t,4,4.65)-ramp(t,6.2,7);
  return {walk,run:Math.max(0,run)};
}
/** Extend the supplied measured distance curve through complete gait cycles. */
export function m23GaitDistance(key:'walk'|'run',time:number):number {
  const clip=model.clips[key]!,cycles=Math.floor(time/clip.duration),curve=clip.distanceCurve!,index=(time/clip.duration-cycles)*(curve.length-1),lo=Math.floor(index),hi=Math.min(curve.length-1,lo+1);
  return(cycles+curve[lo]!+(curve[hi]!-curve[lo]!)*(index-lo))*clip.stride!*model.height;
}
export function m23Travel(t:number,phase=0):number {
  const gait=m23GaitTimes(t,phase);
  return m23GaitDistance('walk',gait.walk)-m23GaitDistance('walk',phase)+m23GaitDistance('run',gait.run);
}
/** Planted authored turn and complete punch, followed by the existing full cast/release/roar sequence. */
export function m23IntroMotion(t:number,phase=0):ReturnType<typeof m22IntroMotion>{
  const motion=m22IntroMotion(t,phase),gait=m23GaitTimes(t,phase);
  let key='idle',time=t;
  if(t>=.35&&t<4){key='walk';time=gait.walk;}
  else if(t>=4&&t<7){key='run';time=gait.run;}
  else if(t>=8&&t<9.4){key='turn';time=t-8;}
  else if(t>=9.5&&t<9.5+model.clips.punch!.duration){key='punch';time=t-9.5;}
  else if(t>=12){key=motion.key;time=motion.time;}
  const yawOffset=M22_INTRO.turnYaw*Math.max(0,Math.min(1.4,t-8))/model.clips.turn!.duration;
  const lookUp=smooth((t-1)/1.5)*(1-smooth((t-7)/1))+smooth((t-11.5)/.5)*(1-smooth((t-19.6)/.4));
  return {...motion,key,time:time%model.clips[key]!.duration,yawOffset,walkTime:gait.walk,lookUp,lookYaw:0};
}
