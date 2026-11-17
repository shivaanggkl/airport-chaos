import * as THREE from 'three';
import { sharpshooterTargetPose, type SharpshooterTarget } from '../../shared/sharpshooter-target.mjs';
import { journeyDallasSharpshooter01 } from '../../shared/journey-mission.mjs';

/** One procedural model reused across all stages; no target actors or AI. */
export class SharpshooterTargetView {
  private static shared:SharpshooterTargetView|undefined;
  private static users=0;
  readonly root=new THREE.Group();
  private readonly introScale=new THREE.Vector3();
  private readonly introRotation=new THREE.Quaternion();
  private readonly introDepth=new THREE.Vector3();
  private readonly pulse:THREE.Mesh;
  private readonly geometries:THREE.BufferGeometry[]=[];
  private readonly materials:THREE.Material[]=[];
  constructor(scene:THREE.Scene){
    const shared=SharpshooterTargetView.shared;
    SharpshooterTargetView.users++;
    if(shared){
      for(const child of shared.root.children)this.root.add(child.clone());
      this.pulse=this.root.children[this.root.children.length-1] as THREE.Mesh;
      this.root.visible=false;scene.add(this.root);return;
    }
    SharpshooterTargetView.shared=this;
    const radius=journeyDallasSharpshooter01.targetRadius;
    const colors=[0x061a32,0x39e6ff,0xffffff,0xff646e,0xffffff,0xff646e];
    const sizes=[1,.96,.86,.65,.43,.20];
    for(let i=0;i<sizes.length;i++){
      const geometry=new THREE.CylinderGeometry(radius*sizes[i]!,radius*sizes[i]!,i===0?24:2,48);
      geometry.rotateX(Math.PI/2);
      const material=new THREE.MeshStandardMaterial({color:colors[i],roughness:.45,metalness:.15,
        emissive:colors[i],emissiveIntensity:i===1?.45:.08});
      const mesh=new THREE.Mesh(geometry,material);
      // Matching faces on both sides; the renderer orients the whole target.
      if(i>0){const back=new THREE.Mesh(geometry,material);back.position.z=-14-i*2;this.root.add(back);mesh.position.z=14+i*2;}
      this.geometries.push(geometry);this.materials.push(material);this.root.add(mesh);
    }
    const glowGeometry=new THREE.TorusGeometry(radius*1.015,2.5,6,48);
    const glowMaterial=new THREE.MeshBasicMaterial({color:0x39e6ff,transparent:true,opacity:.5});
    this.pulse=new THREE.Mesh(glowGeometry,glowMaterial);this.root.add(this.pulse);
    this.geometries.push(glowGeometry);this.materials.push(glowMaterial);
    this.root.visible=false;scene.add(this.root);
  }
  update(target:SharpshooterTarget,elapsedMs:number,pilot:THREE.Vector3):void{
    sharpshooterTargetPose(target,elapsedMs,this.root.position);this.root.lookAt(pilot);this.root.visible=true;
    this.pulse.scale.setScalar(1+Math.sin(elapsedMs*.002)*.012);
  }
  /** Render-only emphasis for the placement overview; restored in the same frame. */
  beginIntro(camera:THREE.PerspectiveCamera,viewportHeight:number,emphasis:number):void{
    this.introScale.copy(this.root.scale);this.introRotation.copy(this.root.quaternion);
    if(emphasis<=0)return;
    const depth=Math.max(0,-this.introDepth.copy(this.root.position).applyMatrix4(camera.matrixWorldInverse).z);
    const unitsPerPixel=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,viewportHeight);
    const scale=Math.max(1,18*unitsPerPixel/journeyDallasSharpshooter01.targetRadius);
    this.root.scale.multiplyScalar(THREE.MathUtils.lerp(1,scale,emphasis));
    this.root.lookAt(camera.position);this.root.quaternion.slerp(this.introRotation,1-emphasis);
  }
  endIntro():void{this.root.scale.copy(this.introScale);this.root.quaternion.copy(this.introRotation);}
  dispose():void{
    this.root.removeFromParent();
    if(--SharpshooterTargetView.users===0){const shared=SharpshooterTargetView.shared!;
      for(const geometry of shared.geometries)geometry.dispose();for(const material of shared.materials)material.dispose();
      SharpshooterTargetView.shared=undefined;
    }
  }
}
