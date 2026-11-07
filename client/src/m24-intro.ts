import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M23_INTRO,m23IntroMotion} from './m23-intro';
export const M24_INTRO=Object.freeze({...M23_INTRO,roar:12,aimTurn:12+model.clips.roar!.duration,cast:16,shoot:M23_INTRO.shoot+4,release:M23_INTRO.release+4,monsterEnd:24,runway:28,objective:30.5,handoff:30.5,duration:32});
export function m24IntroText(t:number):string {
  return t<4?'Dr. Boss is back for one final battle!':t<8?"He's faster than ever!":t<12?'And stronger than ever!':t<16?"He won't give up!":t<24?'His energy attack is coming!':t<28?'This is your final chance to save Dallas!':t<30.5?"Pilot! It's time to finish this!":t<32?'DEFEAT THE MONSTER':'';
}
/** Reuse stride-matched locomotion; all planted actions play at authored speed. */
export function m24IntroMotion(t:number,phase=0):ReturnType<typeof m23IntroMotion>{
  const motion=m23IntroMotion(t,phase);
  if(t<12)return motion;
  let key='idle',time=t;
  if(t>=12&&t<12+model.clips.roar!.duration){key='roar';time=t-12;}
  else if(t>=M24_INTRO.aimTurn&&t<16){key='turn';time=t-M24_INTRO.aimTurn;}
  else if(t>=16&&t<M24_INTRO.shoot){key='charge';time=t-16;}
  else if(t>=M24_INTRO.shoot&&t<24){key='shoot';time=t-M24_INTRO.shoot;}
  const yawOffset=motion.yawOffset+M24_INTRO.turnYaw*Math.max(0,Math.min(16-M24_INTRO.aimTurn,t-M24_INTRO.aimTurn))/model.clips.turn!.duration;
  const look=Math.max(0,Math.min(1,(t-15.6)/.8))*Math.max(0,Math.min(1,(24-t)/.4));
  return {...motion,key,time:time%model.clips[key]!.duration,yawOffset,lookUp:look*look*(3-2*look),lookYaw:0};
}
