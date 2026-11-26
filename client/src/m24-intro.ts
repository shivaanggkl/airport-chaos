import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M23_INTRO,m23IntroMotion,m23Travel} from './m23-intro';
export const M24_INTRO=Object.freeze({...M23_INTRO,monsterEnd:20,runway:24,objective:26.5,handoff:26.5,duration:28});
export function m24IntroText(t:number):string {
  return t<4?'Dr. Boss is back for one final battle!':t<8?"He's faster than ever!":t<12?'And stronger than ever!':t<16?"He won't give up!":t<20?'His energy attack is coming!':t<24?'This is your final chance to save Dallas!':t<26.5?"Pilot! It's time to finish this!":t<28?'DEFEAT THE MONSTER':'';
}
/** Match the walking approach and planted roar/throw used in M1’s intro. */
export function m24Travel(t:number,phase=0):number {return m23Travel(t,phase);}
export function m24IntroMotion(t:number,phase=0):ReturnType<typeof m23IntroMotion>{
  const motion=m23IntroMotion(t,phase);
  if(t>=M24_INTRO.monsterEnd)return {...motion,key:'idle',time:t%model.clips.idle!.duration};
  return motion;
}
