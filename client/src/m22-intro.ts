import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {strikingWarlord} from '../../shared/striking-warlord.mjs';
import {M21_INTRO,m21IntroMotion} from './m21-intro';

export const M22_INTRO=Object.freeze({...M21_INTRO,punch:8,aimTurn:10.4,cast:12,shoot:12+model.clips.charge!.duration,release:12+model.clips.charge!.duration+strikingWarlord.releaseSeconds,roar:20});
export function m22IntroText(t:number):string {
  return t<4?'Dr. Boss is getting smarter!':t<8?"He's watching your every move!":t<12?'His punches are stronger!':t<20?'Watch out! His aim is better now!':t<24?"He's not backing down!":t<26.5?'Pilot! Stay sharp and defeat Dr. Boss!':t<28?'DEFEAT THE MONSTER':'';
}
const smooth=(t:number,start:number,end:number)=>{const x=Math.max(0,Math.min(1,(t-start)/(end-start)));return x*x*(3-2*x);};
/** Normal-rate authored motions; edit out Shoot's held tail at the roar cut. */
export function m22IntroMotion(t:number,walkStartTime=0):ReturnType<typeof m21IntroMotion>&{lookYaw:number}{
  const motion=m21IntroMotion(Math.min(t,7.999),walkStartTime);
  let key=motion.key,time=motion.time;
  if(t>=8){key='idle';time=t;}
  if(t>=8&&t<8+model.clips.punch!.duration){key='punch';time=t-8;}
  else if(t>=M22_INTRO.aimTurn&&t<12){key='turn';time=t-M22_INTRO.aimTurn;}
  else if(t>=12&&t<M22_INTRO.shoot){key='charge';time=t-12;}
  else if(t>=M22_INTRO.shoot&&t<20){key='shoot';time=t-M22_INTRO.shoot;}
  else if(t>=20&&t<20+model.clips.roar!.duration){key='roar';time=t-20;}
  const yawOffset=M21_INTRO.turnYaw*Math.max(0,Math.min(1,(t-4)/model.clips.turn!.duration))+M21_INTRO.turnYaw*Math.max(0,Math.min(12-M22_INTRO.aimTurn,t-M22_INTRO.aimTurn))/model.clips.turn!.duration;
  const tracking=smooth(t,3.3,4.6)*(1-smooth(t,7.4,8)),aim=smooth(t,10.4,12)*(1-smooth(t,19.6,20));
  return {...motion,key,time:time%model.clips[key]!.duration,yawOffset,lookUp:tracking+aim,lookYaw:.22*tracking*Math.sin((t-4)*.8)+.12*aim};
}
