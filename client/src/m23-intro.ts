import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M22_INTRO,m22IntroMotion} from './m22-intro';
import {pursuitWarlord} from '../../shared/pursuit-warlord.mjs';

export const M23_INTRO=Object.freeze({...M22_INTRO,run:4,runEnd:7,turn:8,turnEnd:9.4,punch:9.5,roar:8,cast:12,shoot:12,release:12+pursuitWarlord.releaseSeconds});
export function m23IntroText(t:number):string {
  return t<8?'Dr. Boss marches toward downtown.':t<12?'His roar shakes Dallas.':t<21?'Fireballs race toward the city!':t<24?'They miss. Dallas still stands.':t<26.5?'Dallas needs a hero.':t<28?'Pilot, defeat Dr. Boss. Save Dallas!':'';
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
/** Integral of smoothstep: smooth acceleration without speeding up authored clips. */
const ramp=(t:number,start:number,end:number)=>{const x=clamp((t-start)/(end-start));return(end-start)*(x*x*x-.5*x*x*x*x)+Math.max(0,t-end);};
const walkRate=.65;
export function m23GaitTimes(t:number,phase=0,running=false):{walk:number;run:number}{
  if(!running)return {walk:phase+walkRate*ramp(Math.min(t,7),.35,1.1),run:0};
  const runStartRate=walkRate*(model.clips.walk!.stride!/model.clips.walk!.duration)/(model.clips.run!.stride!/model.clips.run!.duration);
  const run=runStartRate*Math.max(0,t-4)+(1-runStartRate)*ramp(t,4,4.65)-ramp(t,6.2,7);
  return {walk:phase+walkRate*ramp(Math.min(t,4),.35,1.1),run:Math.max(0,run)};
}
/** Extend the supplied measured distance curve through complete gait cycles. */
export function m23GaitDistance(key:'walk'|'run',time:number):number {
  const clip=model.clips[key]!,cycles=Math.floor(time/clip.duration),curve=clip.distanceCurve!,index=(time/clip.duration-cycles)*(curve.length-1),lo=Math.floor(index),hi=Math.min(curve.length-1,lo+1);
  return(cycles+curve[lo]!+(curve[hi]!-curve[lo]!)*(index-lo))*clip.stride!*model.height;
}
export function m23Travel(t:number,phase=0,running=false):number {
  const gait=m23GaitTimes(t,phase,running);
  return m23GaitDistance('walk',gait.walk)-m23GaitDistance('walk',phase)+m23GaitDistance('run',gait.run);
}
/** M1 walks, roars, then fires. The running branch preserves M2’s existing sequence. */
export function m23IntroMotion(t:number,phase=0,running=false):ReturnType<typeof m22IntroMotion>{
  const motion=m22IntroMotion(t,phase),gait=m23GaitTimes(t,phase,running);
  let key='idle',time=t;
  if(t>=.35&&t<(running?4:7)){key='walk';time=gait.walk;}
  else if(running&&t>=4&&t<7){key='run';time=gait.run;}
  else if(running&&t>=8&&t<9.4){key='turn';time=t-8;}
  else if(!running&&t>=8&&t<8+model.clips.roar!.duration){key='roar';time=t-8;}
  else if(t>=12&&t<(running?20:12+model.clips.shoot!.duration)){key='shoot';time=t-12;}
  else if(running&&t>=20){key=motion.key;time=motion.time;}
  const yawOffset=(running?1:0)*M22_INTRO.turnYaw*Math.max(0,Math.min(1.4,t-8))/model.clips.turn!.duration;
  const lookUp=smooth((t-1)/1.5)*(1-smooth((t-7)/1))+smooth((t-11.5)/.5)*(1-smooth((t-19.6)/.4));
  return {...motion,key,time:time%model.clips[key]!.duration,yawOffset,walkTime:gait.walk,lookUp,lookYaw:0};
}
