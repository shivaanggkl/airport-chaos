import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {strikingWarlord} from '../../shared/striking-warlord.mjs';
export const M21_INTRO=Object.freeze({walkStart:.35,walkEnd:4,turnEnd:4+model.clips.turn!.duration,aimTurn:12+model.clips.punch!.duration,roar:8,punch:12,cast:16,shoot:16+model.clips.charge!.duration,release:16+model.clips.charge!.duration+strikingWarlord.releaseSeconds,runway:24,objective:26.5,handoff:26.5,duration:28,turnYaw:3.1997298216058336});
export function m21IntroText(t:number):string {
  return t<4?'Dr. Boss is on the move!':t<8?"He's looking for his next target!":t<12?"He's ready to fight!":t<16?'Watch out for his punches!':t<24?"Now he's aiming for the sky!":t<26.5?'Pilot! Dr. Boss is hunting you. Stop him!':t<28?'DEFEAT THE MONSTER':'';
}
const smooth=(t:number,start:number,end:number)=>{const x=Math.max(0,Math.min(1,(t-start)/(end-start)));return x*x*(3-2*x);};
export function m21IntroMotion(t:number,walkStartTime=0):{key:string;time:number;height:number;yawOffset:number;walkTime:number;lookUp:number}{
  const walk=model.clips.walk!,walkTime=walkStartTime+(walk.duration-walkStartTime)*smooth(t,M21_INTRO.walkStart,4);
  let key='idle',time=t;
  if(t>=M21_INTRO.walkStart&&t<4){key='walk';time=walkTime;}
  else if(t>=4&&t<M21_INTRO.turnEnd){key='turn';time=t-4;}
  else if(t>=8&&t<8+model.clips.roar!.duration){key='roar';time=t-8;}
  else if(t>=12&&t<12+model.clips.punch!.duration){key='punch';time=t-12;}
  else if(t>=M21_INTRO.aimTurn&&t<16){key='turn';time=t-M21_INTRO.aimTurn;}
  else if(t>=16&&t<M21_INTRO.shoot){key='charge';time=t-16;}
  else if(t>=M21_INTRO.shoot&&t<24){key='shoot';time=t-M21_INTRO.shoot;}
  const yawOffset=M21_INTRO.turnYaw*(Math.max(0,Math.min(1,(t-4)/model.clips.turn!.duration))+Math.max(0,Math.min(16-M21_INTRO.aimTurn,t-M21_INTRO.aimTurn))/model.clips.turn!.duration);
  const lookUp=smooth(t,4,5.5)*(1-smooth(t,7.5,8))+smooth(t,15.5,16.5)*(1-smooth(t,23.5,24));
  return {key,time:time%model.clips[key]!.duration,height:0,yawOffset,walkTime,lookUp};
}
