import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {strikingWarlord} from '../../shared/striking-warlord.mjs';
export const M20_INTRO=Object.freeze({jump:2,land:2+model.clips.jump!.duration,punch:8,roar:11,cast:15,shoot:15+model.clips.charge!.duration,release:15+model.clips.charge!.duration+strikingWarlord.releaseSeconds,runway:23,objective:26.5,handoff:26.5,duration:28});
export function m20IntroText(t:number):string {
  return t<2?'Dr. Boss is back!':t<8?"He's stronger than before!":t<11?'Watch out for his punches!':t<15?"And he's angrier than ever!":t<23?'Now he can shoot energy!':t<26.5?'Pilot! Dr. Boss is back! Stop him!':t<28?'DEFEAT THE MONSTER':'';
}
/** Normal-rate authored clips. The runway cut edits out Shoot's long held tail. */
export function m20IntroMotion(t:number):{key:string;time:number;height:number;yawOffset:number}{
  let key='idle',time=t,height=0;
  const turnSeconds=1.5,turnRate=3.1997298216058336/model.clips.turn!.duration;
  const yawOffset=-turnRate*(turnSeconds-Math.max(0,Math.min(turnSeconds,t-.25)));
  if(t>=.25&&t<1.75){key='turn';time=t-.25;}
  else if(t>=2&&t<M20_INTRO.land){key='jump';time=t-2;const flight=Math.max(0,Math.min(1,(time-strikingWarlord.jumpBend)/(model.clips.jump!.duration-strikingWarlord.jumpBend)));height=4*strikingWarlord.jumpHeight*flight*(1-flight);}
  else if(t>=M20_INTRO.land&&t<8){key='landing';time=t-M20_INTRO.land;}
  else if(t>=8&&t<8+model.clips.punch!.duration){key='punch';time=t-8;}
  else if(t>=11&&t<11+model.clips.roar!.duration){key='roar';time=t-11;}
  else if(t>=15&&t<M20_INTRO.shoot){key='charge';time=t-15;}
  else if(t>=M20_INTRO.shoot&&t<23){key='shoot';time=t-M20_INTRO.shoot;}
  return {key,time:time%model.clips[key]!.duration,height,yawOffset};
}
