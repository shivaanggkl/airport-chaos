import * as THREE from 'three';
import { dallasCoinTrail } from '../../shared/collectible-trail.mjs';
export const coinHuntIntroTexts=[
 'DALLAS BONUS ROUND!','Follow the golden coin trail!',
 'Every coin is worth 1 Credit!','Collect as many as you can before time runs out!',
] as const;
/** Presentation only: the real aircraft, pickup state and mission clock never advance. */
export class CoinHuntIntro {
 private position=new THREE.Vector3();readonly target=new THREE.Vector3();
 sample(elapsed:number,handoff:number,altitude:number,camera:THREE.PerspectiveCamera,chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3,chaseFov:number):void {
  const seconds=elapsed/1000;
  if(seconds<3){
   const middle=dallasCoinTrail[15]!;
   this.target.set(middle.x,altitude,middle.z);
   const framing=Math.max(1,1.25/camera.aspect);
   this.position.set((3000-seconds*250)*framing,2200*framing,4000*framing).add(this.target);
  }else if(seconds<6){
   const index=Math.min(60,Math.floor((seconds-3)*18)),p=dallasCoinTrail[index]!,next=dallasCoinTrail[index+9]!;
   const t=(seconds-3)*18-index,q=dallasCoinTrail[index+1]!;
   this.position.set(p.x+(q.x-p.x)*t+850,altitude+420,p.z+(q.z-p.z)*t-1600);
   this.target.set(next.x,altitude,next.z);
  }else if(seconds<9){
   const p=dallasCoinTrail[30]!;
   this.target.set(p.x,altitude,p.z);this.position.set(p.x+120*Math.sin(seconds-6),altitude+40,p.z-500+(seconds-6)*30);
  }else{
   this.position.set(900,500,-800).multiplyScalar(Math.max(0,12-seconds)/3).add(chasePosition);
   this.target.copy(chaseTarget);
  }
  camera.position.copy(this.position).lerp(chasePosition,handoff);
  this.target.lerp(chaseTarget,handoff);camera.lookAt(this.target);
  camera.fov=THREE.MathUtils.lerp(seconds<3?62:54,chaseFov,handoff);camera.updateProjectionMatrix();
 }
}
