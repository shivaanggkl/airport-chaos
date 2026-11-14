import {M24_INTRO} from './m24-intro';
import {M23_INTRO} from './m23-intro';
import {M22_INTRO} from './m22-intro';
import {M21_INTRO} from './m21-intro';
import {M20_INTRO} from './m20-intro';
import {M19_INTRO,M19_DOWNTOWN} from './m19-intro';
import * as THREE from 'three';

export const MISSION_COMBAT_INTRO_SWEEP_MS = 8_000;
export const MISSION_COMBAT_INTRO_DURATION_MS = 9_000;

/** Shared staged-opponent reveal and player runway handoff. No gameplay entities move. */
export class CombatMissionIntroPath {
  private readonly offset = new THREE.Vector3();
  private readonly shotPosition = new THREE.Vector3();
  private readonly shotTarget = new THREE.Vector3();
  private readonly opponentRadius: number;
  private readonly opponentHeight:number;
  private readonly strikingCameraYaw:number;
  private readonly playerRadius: number;
  private readonly opponentOrigin: THREE.Vector3;
  private readonly downtown=new THREE.Vector3(M19_DOWNTOWN.x,0,M19_DOWNTOWN.z);
  private readonly departureDirection = new THREE.Vector3();
  constructor(readonly opponent: THREE.Group, private readonly player: THREE.Group, readonly missionNumber: 7 | 8 | 9 | 10 | 11 | 12 | 15 | 19 = 7,readonly arrivalIntro=false,readonly strikingIntro=false,private readonly introFist?:THREE.Vector3,private readonly introShot?:THREE.Vector3,readonly huntingIntro=false,readonly showdownIntro=false,readonly pursuitIntro=false,private readonly introFootstep?:()=>number,readonly finalIntro=false,private readonly secondOpponent?:THREE.Group) {
    this.opponentOrigin = opponent.position.clone();
    this.strikingCameraYaw=opponent.rotation.y+(strikingIntro?1.5*3.1997298216058336/3.875:0);
    this.departureDirection.set(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, opponent.rotation.y);
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(opponent).getSize(size);
    this.opponentHeight=size.y;
    this.opponentRadius = Math.max(18, size.x * 1.7, size.z * 1.5);
    new THREE.Box3().setFromObject(player).getSize(size);
    this.playerRadius = Math.max(14, size.x * 1.5, size.z * 1.3);
  }
  get sweepMs():number{if(this.missionNumber===15)return 9500;if(this.finalIntro)return M24_INTRO.handoff*1000;if(this.huntingIntro)return M21_INTRO.handoff*1000;if(this.strikingIntro)return M20_INTRO.handoff*1000;if(this.arrivalIntro)return M19_INTRO.handoff*1000;return this.missionNumber===19?11000:MISSION_COMBAT_INTRO_SWEEP_MS;}
  get durationMs():number{if(this.missionNumber===15)return 10000;if(this.finalIntro)return M24_INTRO.duration*1000;if(this.huntingIntro)return M21_INTRO.duration*1000;if(this.strikingIntro)return M20_INTRO.duration*1000;if(this.arrivalIntro)return M19_INTRO.duration*1000;return this.missionNumber===19?12000:MISSION_COMBAT_INTRO_DURATION_MS;}
  wipe(elapsed: number): number {
    if(this.missionNumber===15)return 0;
    if(this.finalIntro){for(const cut of [24000,28000])if(Math.abs(elapsed-cut)<200)return 1-Math.abs(elapsed-cut)/200;return 0;}
    if(this.huntingIntro){if((this.showdownIntro||this.pursuitIntro)&&Math.abs(elapsed-20000)<150)return 1-Math.abs(elapsed-20000)/150;return Math.max(0,1-Math.abs(elapsed-24000)/250);}
    if(this.strikingIntro)return Math.max(0,1-Math.abs(elapsed-23000)/250);
    if(this.arrivalIntro){for(const cut of [4000,14000])if(Math.abs(elapsed-cut)<250)return 1-Math.abs(elapsed-cut)/250;return 0;}
    if(this.missionNumber===19){if(elapsed<5500)return 0;if(elapsed<6000)return(elapsed-5500)/500;if(elapsed<6500)return 1-(elapsed-6000)/500;return elapsed<11000?0:elapsed<11500?(elapsed-11000)/500:(12000-elapsed)/500;}
    if (elapsed < 3_500) return 0;
    if (elapsed < 4_000) return (elapsed - 3_500) / 500;
    if (elapsed < 4_500) return 1 - (elapsed - 4_000) / 500;
    return elapsed < 8_000 ? 0 : elapsed < 8_500 ? (elapsed - 8_000) / 500 : (9_000 - elapsed) / 500;
  }
  sample(elapsed: number, position: THREE.Vector3, target: THREE.Vector3,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3): void {
    if(this.missionNumber===15){this.sampleTwinHunters(elapsed,position,target,chasePosition,chaseTarget);return;}
    if(this.huntingIntro){this.sampleHunting(elapsed,position,target,chasePosition,chaseTarget);return;}
    if(this.strikingIntro){this.sampleStriking(elapsed,position,target,chasePosition,chaseTarget);return;}
    if(this.arrivalIntro){this.sampleArrival(elapsed,position,target,chasePosition,chaseTarget);return;}
    // Combat aircraft reveal in a short, level airborne pass.
    // Only the temporary visual group moves, never a live opponent or the player.
    if (this.missionNumber !== 19)
      this.opponent.position.copy(this.opponentOrigin).addScaledVector(this.departureDirection, Math.min(Math.max(0, elapsed), 4_000) * (this.missionNumber === 12 ? .6 : this.missionNumber === 9 ? .42 : .16));
    const boss=this.missionNumber===19,cut=boss?6000:4000;
    const enemyShot = elapsed < cut;
    const aircraft = enemyShot ? this.opponent : this.player;
    const t = THREE.MathUtils.smoothstep(elapsed, enemyShot ? 0 : cut+500, enemyShot ? cut-500 : this.sweepMs);
    const radius = enemyShot ? boss?this.opponentHeight*THREE.MathUtils.lerp(1.8,1.1,t):this.opponentRadius : this.playerRadius;
    const angle = enemyShot ? THREE.MathUtils.lerp(boss ? .65 : this.missionNumber === 12 ? -2.6 : this.missionNumber === 11 ? -2.8 : this.missionNumber === 9 ? .3 : this.missionNumber === 8 ? .7 : -2.2, boss ? -.45 : this.missionNumber === 12 ? -.9 : this.missionNumber === 11 ? -1.8 : this.missionNumber === 9 ? .9 : this.missionNumber === 8 ? 1.7 : -1.1, t) : THREE.MathUtils.lerp(1.7, 0, t);
    this.offset.set(Math.sin(angle) * radius, (boss&&enemyShot?this.opponentHeight*THREE.MathUtils.lerp(.25,.65,t):radius*.22), Math.cos(angle) * radius)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, aircraft.rotation.y);
    this.shotPosition.copy(aircraft.position).add(this.offset);
    this.shotTarget.copy(aircraft.position).addScaledVector(THREE.Object3D.DEFAULT_UP, boss&&enemyShot?this.opponentHeight*THREE.MathUtils.lerp(.5,.7,t):1);
    const handoff = enemyShot ? 0 : THREE.MathUtils.smoothstep(elapsed, this.sweepMs-1500, this.sweepMs);
    position.lerpVectors(this.shotPosition, chasePosition, handoff);
    target.lerpVectors(this.shotTarget, chaseTarget, handoff);
  }
  private sampleTwinHunters(elapsed:number,position:THREE.Vector3,target:THREE.Vector3,chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void {
    const orbit=THREE.MathUtils.smoothstep(elapsed,0,8000);
    this.offset.set(Math.sin(.65+orbit*.3)*this.playerRadius,this.playerRadius*.25,Math.cos(.65+orbit*.3)*this.playerRadius)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.player.rotation.y);
    position.copy(this.player.position).add(this.offset);
    target.copy(this.player.position);
    // Frame the real pair together without moving either gameplay entity.
    this.shotTarget.copy(this.opponent.position).lerp(this.secondOpponent!.position,.5);
    const separation=this.opponent.position.distanceTo(this.secondOpponent!.position);
    this.offset.set(Math.sin(orbit*.15)*separation,separation*.22,-separation*1.5);
    this.shotPosition.copy(this.shotTarget).add(this.offset);
    const reveal=THREE.MathUtils.smoothstep(elapsed,2000,3000);
    position.lerp(this.shotPosition,reveal);target.lerp(this.shotTarget,reveal);
    const handoff=THREE.MathUtils.smoothstep(elapsed,8000,10000);
    position.lerp(chasePosition,handoff);target.lerp(chaseTarget,handoff);
  }
  private sampleHunting(elapsed:number,position:THREE.Vector3,target:THREE.Vector3,chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void {
    const t=elapsed/1000,h=this.opponentHeight,root=this.opponent;
    const timing=this.finalIntro?M24_INTRO:this.pursuitIntro?M23_INTRO:this.showdownIntro?M22_INTRO:M21_INTRO;
    if(t>=timing.runway){
      const orbit=THREE.MathUtils.smoothstep(t,timing.runway+.25,timing.handoff),angle=THREE.MathUtils.lerp(1.4,.2,orbit);
      this.offset.set(Math.sin(angle)*this.playerRadius,this.playerRadius*.1,Math.cos(angle)*this.playerRadius).applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.player.rotation.y);
      this.shotPosition.copy(this.player.position).add(this.offset);this.shotTarget.copy(this.player.position).addScaledVector(THREE.Object3D.DEFAULT_UP,1);
      const blend=THREE.MathUtils.smoothstep(t,timing.handoff,timing.duration);
      position.lerpVectors(this.shotPosition,chasePosition,blend);target.lerpVectors(this.shotTarget,chaseTarget,blend);return;
    }
    if(this.finalIntro&&t>=24){
      const radius=THREE.MathUtils.lerp(1.8,2.2,THREE.MathUtils.smoothstep(t,24,28));
      this.offset.copy(root.position).sub(this.downtown);this.offset.y=0;this.offset.normalize().multiplyScalar(h*radius);this.offset.y=h*.7;
      position.copy(root.position).add(this.offset);target.copy(root.position);target.y+=h*.65;return;
    }
    const search=THREE.MathUtils.smoothstep(t,4,7.5),roar=THREE.MathUtils.smoothstep(t,timing.roar-.3,timing.roar+1)*(1-THREE.MathUtils.smoothstep(t,timing.roar+3.8,timing.roar+4.4)),cast=THREE.MathUtils.smoothstep(t,timing.cast,this.showdownIntro||this.pursuitIntro?timing.shoot:21.4);
    let radius=THREE.MathUtils.lerp(1.65,1.2,search);radius=THREE.MathUtils.lerp(radius,.95,roar);radius=THREE.MathUtils.lerp(radius,1.05,cast);
    const punch=(this.showdownIntro||this.pursuitIntro)&&t>=8&&t<12;
    if(this.showdownIntro||this.pursuitIntro){radius=punch?1.25:t>=20?.85:t>=12?THREE.MathUtils.lerp(.95,1.4,THREE.MathUtils.smoothstep(t,timing.release-.3,timing.release)):radius;}
    if(this.pursuitIntro&&t>=timing.cast&&t<(this.finalIntro?24:20))radius=THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.25,.95,cast),1.4,THREE.MathUtils.smoothstep(t,timing.release-.3,timing.release));
    if(this.finalIntro&&t>=12&&t<16)radius=.85;
    const angle=punch?.65:THREE.MathUtils.lerp(.8,.1,search);
    this.offset.set(Math.sin(angle)*h*radius,h*(punch?.32:THREE.MathUtils.lerp(.4,.78,Math.max(search,roar))),Math.cos(angle)*h*radius).applyAxisAngle(THREE.Object3D.DEFAULT_UP,root.rotation.y);
    position.copy(root.position).add(this.offset);target.copy(root.position);target.y+=h*THREE.MathUtils.lerp(.52,.82,Math.max(search,roar));
    if(this.pursuitIntro&&t<8){
      const run=THREE.MathUtils.smoothstep(t,3.7,4.4)*(1-THREE.MathUtils.smoothstep(t,7,8)),angle=THREE.MathUtils.lerp(.75,this.finalIntro?.1:1.35,run);
      this.offset.set(Math.sin(angle)*h*1.8,h*(this.finalIntro?.32:.45),Math.cos(angle)*h*1.8).applyAxisAngle(THREE.Object3D.DEFAULT_UP,root.rotation.y);
      position.copy(root.position).add(this.offset);target.copy(root.position);target.y+=h*.52;
      const age=t-(this.introFootstep?.()??-Infinity);if(age>=0&&age<.2){const shake=Math.sin(age*70)*Math.exp(-age*18)*h*.0015*run;position.y+=shake;}
    }
    if(t>=timing.punch&&t<timing.punch+4&&this.introFist)target.lerp(this.introFist,.35*Math.sin(Math.PI*(t-timing.punch)/4));
    if(t>=timing.roar&&t<timing.roar+3.625){const weight=Math.sin(Math.PI*(t-timing.roar)/3.625);position.x+=Math.sin(t*31)*h*.0018*weight;position.y+=Math.sin(t*37)*h*.001*weight;}
    if(t>=timing.release&&(!(this.showdownIntro||this.pursuitIntro)||t<(this.finalIntro?24:20))&&this.introShot){const weight=THREE.MathUtils.smoothstep(t,timing.release,timing.release+.4);target.lerp(this.introShot,weight);this.shotPosition.copy(this.introShot).add(this.offset);position.lerp(this.shotPosition,weight*.7);}
  }
  private sampleStriking(elapsed:number,position:THREE.Vector3,target:THREE.Vector3,chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void {
    const t=elapsed/1000,h=this.opponentHeight,root=this.opponent;
    if(t>=23){
      const orbit=THREE.MathUtils.smoothstep(t,23.25,M20_INTRO.handoff),angle=THREE.MathUtils.lerp(1.4,.2,orbit);
      this.offset.set(Math.sin(angle)*this.playerRadius,this.playerRadius*.1,Math.cos(angle)*this.playerRadius).applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.player.rotation.y);
      this.shotPosition.copy(this.player.position).add(this.offset);this.shotTarget.copy(this.player.position).addScaledVector(THREE.Object3D.DEFAULT_UP,1);
      const blend=THREE.MathUtils.smoothstep(t,M20_INTRO.handoff,M20_INTRO.duration);
      position.lerpVectors(this.shotPosition,chasePosition,blend);target.lerpVectors(this.shotTarget,chaseTarget,blend);return;
    }
    const jump=THREE.MathUtils.smoothstep(t,1.5,2.1)*(1-THREE.MathUtils.smoothstep(t,7.6,8.2));
    const roar=THREE.MathUtils.smoothstep(t,10.5,12)*(1-THREE.MathUtils.smoothstep(t,14.7,15.3));
    const cast=THREE.MathUtils.smoothstep(t,15,20.4);
    let radius=THREE.MathUtils.lerp(1.5,2.1,jump);radius=THREE.MathUtils.lerp(radius,.95,roar);radius=THREE.MathUtils.lerp(radius,1.05,cast);
    this.offset.set(h*.15,h*THREE.MathUtils.lerp(.28,.8,Math.max(jump,roar,cast)),h*radius).applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.strikingCameraYaw);
    position.copy(root.position).add(this.offset);target.copy(root.position);target.y+=h*THREE.MathUtils.lerp(.52,.8,roar);
    if(t>=8&&t<11&&this.introFist)target.lerp(this.introFist,.35*Math.sin(Math.PI*(t-8)/3));
    if(t>=11&&t<14.625){const weight=Math.sin(Math.PI*(t-11)/3.625);position.x+=Math.sin(t*31)*h*.0018*weight;position.y+=Math.sin(t*37)*h*.001*weight;}
    if(t>=M20_INTRO.release&&this.introShot){const weight=THREE.MathUtils.smoothstep(t,M20_INTRO.release,M20_INTRO.release+.4);target.lerp(this.introShot,weight);this.shotPosition.copy(this.introShot).add(this.offset);position.lerp(this.shotPosition,weight*.7);}
  }
  private sampleArrival(elapsed:number,position:THREE.Vector3,target:THREE.Vector3,chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void {
    const seconds=elapsed/1000,height=this.opponentHeight;
    if(seconds<M19_INTRO.reveal){
      const t=THREE.MathUtils.smoothstep(seconds,0,M19_INTRO.reveal);
      // Aerial view faces away from the approaching monster, preserving the reveal.
      position.set(this.downtown.x+THREE.MathUtils.lerp(3900,3300,t),this.player.position.y+1700,this.downtown.z+THREE.MathUtils.lerp(4000,3600,t));
      target.set(this.downtown.x,this.player.position.y+200,this.downtown.z);
      const shake=THREE.MathUtils.smoothstep(seconds,.8,4);
      position.x+=Math.sin(seconds*23)*3*shake;position.y+=Math.sin(seconds*29)*2*shake;
    }else if(seconds<M19_INTRO.monsterEnd){
      const close=THREE.MathUtils.smoothstep(seconds,M19_INTRO.walkEnd,M19_INTRO.walkEnd+2.5);
      const angle=THREE.MathUtils.lerp(.3,.04,THREE.MathUtils.smoothstep(seconds,4,14));
      const radius=height*THREE.MathUtils.lerp(1.55,.95,close);
      this.offset.set(Math.sin(angle)*radius,height*THREE.MathUtils.lerp(.2,.73,close),Math.cos(angle)*radius).applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.opponent.rotation.y);
      position.copy(this.opponent.position).add(this.offset);
      target.copy(this.opponent.position);target.y+=height*THREE.MathUtils.lerp(.55,.8,close);
      const roar=seconds-M19_INTRO.walkEnd,weight=Math.sin(Math.PI*THREE.MathUtils.clamp(roar/(M19_INTRO.roarEnd-M19_INTRO.walkEnd),0,1));
      position.x+=Math.sin(roar*31)*height*.0018*weight;position.y+=Math.sin(roar*37)*height*.001*weight;
    }else{
      const orbit=THREE.MathUtils.smoothstep(seconds,14.25,M19_INTRO.handoff);
      const angle=THREE.MathUtils.lerp(1.4,.2,orbit);
      this.offset.set(Math.sin(angle)*this.playerRadius,this.playerRadius*.1,Math.cos(angle)*this.playerRadius).applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.player.rotation.y);
      this.shotPosition.copy(this.player.position).add(this.offset);
      this.shotTarget.copy(this.player.position).addScaledVector(THREE.Object3D.DEFAULT_UP,1);
      const handoff=THREE.MathUtils.smoothstep(seconds,M19_INTRO.handoff,M19_INTRO.duration);
      position.lerpVectors(this.shotPosition,chasePosition,handoff);target.lerpVectors(this.shotTarget,chaseTarget,handoff);
    }
  }
  fov(elapsed: number, chaseFov: number): number {
    if(this.missionNumber===15)return THREE.MathUtils.lerp(48,chaseFov,THREE.MathUtils.smoothstep(elapsed,8000,10000));
    if(this.finalIntro)return THREE.MathUtils.lerp(48,chaseFov,THREE.MathUtils.smoothstep(elapsed/1000,M24_INTRO.handoff,M24_INTRO.duration));
    if(this.huntingIntro)return THREE.MathUtils.lerp(48,chaseFov,THREE.MathUtils.smoothstep(elapsed/1000,M21_INTRO.handoff,M21_INTRO.duration));
    if(this.strikingIntro)return THREE.MathUtils.lerp(48,chaseFov,THREE.MathUtils.smoothstep(elapsed/1000,M20_INTRO.handoff,M20_INTRO.duration));
    if(this.arrivalIntro)return THREE.MathUtils.lerp(48,chaseFov,THREE.MathUtils.smoothstep(elapsed/1000,M19_INTRO.handoff,M19_INTRO.duration));
    return THREE.MathUtils.lerp(48, chaseFov, THREE.MathUtils.smoothstep(elapsed, this.sweepMs-1500, this.sweepMs));
  }
  streamingPosition(elapsed: number): THREE.Vector3 {
    if(this.missionNumber===15)return elapsed>=2000&&elapsed<8000?this.opponent.position:this.player.position;
    if(this.finalIntro)return elapsed<28000?this.opponent.position:this.player.position;
    if(this.huntingIntro)return elapsed<24000?this.opponent.position:this.player.position;
    if(this.strikingIntro)return elapsed<23000?this.opponent.position:this.player.position;
    if(this.arrivalIntro)return elapsed<M19_INTRO.reveal*1000?this.downtown:elapsed<M19_INTRO.monsterEnd*1000?this.opponent.position:this.player.position;
    return elapsed < (this.missionNumber===19?6000:4000) ? this.opponent.position : this.player.position;
  }
}
