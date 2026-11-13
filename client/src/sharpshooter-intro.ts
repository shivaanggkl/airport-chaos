import * as THREE from 'three';
import { createProjectileCore, fitProjectileRound } from './projectile-visual';

/** Presentation only: no fire intents, damage, target removal, or gameplay transforms survive rendering. */
export class SharpshooterIntro {
  private readonly round=createProjectileCore();
  readonly aimPoint=new THREE.Vector3();
  readonly flightPosition=new THREE.Vector3();
  aiming=false;
  locked=false;
  private readonly focus=new THREE.Vector3();
  private viewCamera:THREE.PerspectiveCamera|undefined;
  private viewportHeight=1080;
  private readonly center=new THREE.Vector3();
  private readonly plane=new THREE.Vector3();
  private readonly look=new THREE.Vector3();
  private readonly direction=new THREE.Vector3();
  private readonly muzzle=new THREE.Vector3();
  private readonly savedPosition=new THREE.Vector3();
  private readonly savedRotation=new THREE.Quaternion();
  private readonly rotation=new THREE.Quaternion();
  private readonly matrix=new THREE.Matrix4();
  private readonly up=new THREE.Vector3(0,1,0);
  private readonly savedOffset=new THREE.Vector3();
  private savedVisible=true;
  private showPlane=false;
  private lastImpact=-1;
  private radius=0;
  constructor(private readonly scene:THREE.Scene,private readonly targets:THREE.Vector3[],private readonly targetRadius:number){
    for(const target of targets)this.center.add(target);
    this.center.multiplyScalar(1/Math.max(1,targets.length));
    for(const target of targets)this.radius=Math.max(this.radius,target.distanceTo(this.center)+targetRadius*1.1);
    this.round.visible=false;scene.add(this.round);
  }
  sample(elapsed:number,handoff:number,camera:THREE.PerspectiveCamera,aircraft:THREE.Object3D,
    chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3,chaseFov:number,onImpact:(point:THREE.Vector3)=>void,viewportHeight=1080):void {
    this.viewCamera=camera;this.viewportHeight=viewportHeight;
    if(Math.abs(camera.fov-chaseFov)>=.01){camera.fov=chaseFov;camera.updateProjectionMatrix();}
    this.aiming=false;this.locked=false;
    const t=Math.min(elapsed,11_000);
    const half=THREE.MathUtils.degToRad(chaseFov/2);
    const distance=this.radius/Math.sin(Math.min(half,Math.atan(Math.tan(half)*camera.aspect)))*1.3;
    // A raised three-quarter sweep reveals the depth and height between the three locations.
    this.direction.subVectors(aircraft.position,this.center).normalize();
    const angle=-.55+.95*Math.min(t/3000,1),x=this.direction.x,z=this.direction.z;
    this.direction.set(x*Math.cos(angle)+z*Math.sin(angle),.42,z*Math.cos(angle)-x*Math.sin(angle)).normalize();
    camera.position.copy(this.center).addScaledVector(this.direction,distance);
    this.look.copy(this.center);
    this.showPlane=t>=3600;
    this.round.visible=false;
    if(t>=3000&&this.targets.length){
      const stage=Math.min(2,Math.floor((t-3000)/2500));
      const target=this.targets[Math.min(stage,this.targets.length-1)]!;
      const phase=THREE.MathUtils.clamp((t-3000-stage*2500)/2500,0,1);
      this.direction.subVectors(aircraft.position,target).normalize();
      this.plane.copy(target).addScaledVector(this.direction,1500-650*phase);
      this.focus.copy(target);
      this.matrix.lookAt(this.plane,target,this.up);this.rotation.setFromRotationMatrix(this.matrix);
      if(stage>0&&phase<.24){
        const previous=this.targets[Math.min(stage-1,this.targets.length-1)]!;
        this.muzzle.subVectors(aircraft.position,previous).normalize().multiplyScalar(850).add(previous);
        const transition=THREE.MathUtils.smoothstep(phase/ .24,0,1);
        this.plane.lerp(this.muzzle,1-transition);
        this.focus.copy(previous).lerp(target,transition);
        this.matrix.lookAt(this.muzzle,previous,this.up);
        this.rotation.slerp(this.savedRotation.setFromRotationMatrix(this.matrix),1-transition);
      }
      // Preserve the selected aircraft's established chase distance and on-screen size.
      this.savedOffset.subVectors(chasePosition,aircraft.position).applyQuaternion(this.savedRotation.copy(aircraft.quaternion).invert());
      this.savedOffset.applyQuaternion(this.rotation);
      const blend=THREE.MathUtils.smoothstep((t-3000)/600,0,1);
      this.muzzle.copy(this.plane).add(this.savedOffset);
      camera.position.lerp(this.muzzle,blend);this.look.lerp(this.focus,blend);
      this.aiming=this.showPlane&&phase>=.24&&handoff===0;
      this.locked=this.aiming&&phase>=.3;this.aimPoint.copy(target);this.flightPosition.copy(this.plane);
      // A straight crimson practice shot demonstrates each target without consuming it.
      const shot=(phase-.34)/.38;
      if(shot>=0&&shot<1&&handoff===0){
        this.round.visible=true;
        this.round.position.copy(this.plane).lerp(target,shot);
      }
      if(shot>=1&&stage>this.lastImpact&&handoff===0){this.lastImpact=stage;onImpact(target);}
    }
    if(this.showPlane){this.plane.lerp(aircraft.position,handoff);this.rotation.slerp(aircraft.quaternion,handoff);}
    camera.position.lerp(chasePosition,handoff);this.look.lerp(chaseTarget,handoff);
    camera.lookAt(this.look);camera.updateMatrixWorld();
    if(this.round.visible)fitProjectileRound(this.round,1000,camera,viewportHeight);
  }
  begin(aircraft:THREE.Object3D,getMuzzle:(point:THREE.Vector3)=>void,elapsed:number):void {
    this.savedPosition.copy(aircraft.position);this.savedRotation.copy(aircraft.quaternion);this.savedVisible=aircraft.visible;
    if(!this.showPlane){aircraft.visible=false;return;}
    aircraft.position.copy(this.plane);aircraft.quaternion.copy(this.rotation);aircraft.updateMatrixWorld(true);
    if(this.round.visible){
      getMuzzle(this.muzzle);
      const stage=Math.min(2,Math.floor((Math.min(elapsed,11000)-3000)/2500));
      const phase=THREE.MathUtils.clamp((elapsed-3000-stage*2500)/2500,0,1);
      this.round.position.copy(this.muzzle).lerp(this.targets[Math.min(stage,this.targets.length-1)]!,(phase-.34)/.38);
      if(this.viewCamera)fitProjectileRound(this.round,1000,this.viewCamera,this.viewportHeight);
    }
  }
  end(aircraft:THREE.Object3D):void {
    aircraft.position.copy(this.savedPosition);aircraft.quaternion.copy(this.savedRotation);aircraft.visible=this.savedVisible;aircraft.updateMatrixWorld(true);
  }
  dispose():void {this.round.removeFromParent();} // Geometry and material belong to the common projectile renderer.
}
