import * as THREE from 'three';
import { dallasCoinTrail, coinCollected, type CoinHuntState } from '../../shared/collectible-trail.mjs';
import { animateCreditFlight } from './credit-flight';
export const coinArtwork='/media/missions/credit-coin.webp';
/** One draw call and a bounded five-element animation pool; no gameplay ownership here. */
export class CollectibleTrailView {
  readonly mesh:THREE.InstancedMesh;
  readonly counter=document.createElement('span');
  private count=document.createElement('strong');
  private texture=new THREE.TextureLoader().load(coinArtwork);
  private transform=new THREE.Object3D();
  private screenPoint=new THREE.Vector3();
  private screenX=new Float32Array(dallasCoinTrail.length);
  private screenY=new Float32Array(dallasCoinTrail.length);
  private lastVisibleAt=new Float64Array(dallasCoinTrail.length).fill(-Infinity);
  private state:CoinHuntState|null=null;
  private flights:Array<{node:HTMLImageElement;animations:Animation[];until:number}>=[];
  private lastSound=0;
  private demo=false;
  private pulse:Animation|undefined;
  constructor(private scene:THREE.Scene,header:HTMLElement){
    this.texture.colorSpace=THREE.SRGBColorSpace;
    // Alpha-cutout faces write depth so overlapping instances occlude correctly.
    // Blended instances cannot be sorted individually and show through one another.
    const material=new THREE.MeshBasicMaterial({map:this.texture,transparent:false,alphaTest:.08,side:THREE.DoubleSide,depthWrite:true,fog:false,toneMapped:false});
    this.mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(90,90),material,dallasCoinTrail.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;
    scene.add(this.mesh);
    this.counter.className='coin-hunt-counter';this.counter.hidden=true;
    const icon=Object.assign(document.createElement('img'),{src:coinArtwork,alt:''});
    this.counter.append(icon,this.count);header.append(this.counter);
    for(let i=0;i<5;i++){
      const node=Object.assign(document.createElement('img'),{src:coinArtwork,alt:'',className:'coin-hunt-flying-credit',hidden:true});
      document.body.append(node);this.flights.push({node,animations:[],until:0});
    }
  }
  setState(state:CoinHuntState,reset:boolean,_camera:THREE.Camera,sound:()=>void):void {
    const now=performance.now(),previous=reset?null:this.state;
    if(reset)this.clearAnimations();
    let first=-1;
    if(previous)for(let group=0;group<state.mask.length;group++){
      if(state.mask[group]===previous.mask[group])continue;
      for(let bit=0;bit<4;bit++){const i=group*4+bit;
        if(!coinCollected(previous.mask,i)&&coinCollected(state.mask,i)){if(first<0&&now-this.lastVisibleAt[i]!<250)first=i;}}
    }
    this.state=state;this.demo=false;this.counter.hidden=false;this.setCount(state.collected);
    if(previous&&Math.floor(state.collected/10)>Math.floor(previous.collected/10)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      this.pulse?.cancel();this.pulse=this.count.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:220});
    }
    if(first>=0){
      this.fly(this.screenX[first]!,this.screenY[first]!);
    }
    if(previous&&state.collected>previous.collected&&now-this.lastSound>180){sound();this.lastSound=now;}
  }
  setCount(value:number):void {
    this.count.textContent=`${value} CREDITS COLLECTED`;
  }
  fly(x:number,y:number):void {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const now=performance.now(),slot=this.flights.find(f=>f.until<=now);if(!slot)return;
    for(const animation of slot.animations)animation.cancel();
    const rect=this.counter.getBoundingClientRect();slot.node.hidden=false;slot.until=now+400;
    slot.animations=animateCreditFlight(slot.node,Math.max(0,Math.min(innerWidth,x)),Math.max(0,Math.min(innerHeight,y)),rect.left+rect.width/2,rect.top+rect.height/2,400);
  }
  demonstrate():void {
    if(this.demo)return;this.demo=true;this.setCount(1);this.fly(innerWidth*.5,innerHeight*.52);
  }
  restoreCounter():void {this.demo=false;if(this.state)this.setCount(this.state.collected);this.clearAnimations();}
  update(camera:THREE.Camera,now:number):void {
    if(!this.state)return;
    camera.updateMatrixWorld();
    const view=camera.matrixWorldInverse.elements;
    // Keep approaching coins readable without letting them fill the screen.
    const maxPixels=Math.min(72,innerHeight*.0975);
    const scalePerDepth=camera instanceof THREE.PerspectiveCamera
      ? 2*Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2))*maxPixels/(Math.max(1,innerHeight)*90)
      : Infinity;
    for(let i=0;i<dallasCoinTrail.length;i++){
      const p=dallasCoinTrail[i]!,collected=coinCollected(this.state.mask,i);
      const scale=collected?0:1;
      this.transform.position.set(p.x,this.state.altitude+Math.sin(now*.0015+i*.3)*5,p.z);
      const {x,y,z}=this.transform.position;
      const depth=-(view[2]!*x+view[6]!*y+view[10]!*z+view[14]!);
      const size=scalePerDepth===Infinity?1:Math.min(1,Math.max(0,depth)*scalePerDepth);
      // Remember the actual visible pickup, never project a passed coin on confirmation.
      if(!collected&&depth>0&&depth<6000){
        this.screenPoint.copy(this.transform.position).project(camera);
        if(Math.abs(this.screenPoint.x)<=1&&Math.abs(this.screenPoint.y)<=1&&this.screenPoint.z>=-1&&this.screenPoint.z<=1){
          this.screenX[i]=(this.screenPoint.x+1)*innerWidth/2;
          this.screenY[i]=(1-this.screenPoint.y)*innerHeight/2;this.lastVisibleAt[i]=now;
        }
      }
      this.transform.quaternion.copy(camera.quaternion);this.transform.scale.setScalar(scale*size);
      this.transform.updateMatrix();this.mesh.setMatrixAt(i,this.transform.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
    for(const f of this.flights)if(f.until<=now&&!f.node.hidden){f.node.hidden=true;for(const a of f.animations)a.cancel();f.animations=[];}
  }
  private clearAnimations():void {
    this.lastVisibleAt.fill(-Infinity);this.pulse?.cancel();this.pulse=undefined;
    for(const f of this.flights){for(const a of f.animations)a.cancel();f.animations=[];f.until=0;f.node.hidden=true;}
  }
  dispose():void {
    this.clearAnimations();this.counter.remove();for(const f of this.flights)f.node.remove();
    this.scene.remove(this.mesh);this.mesh.geometry.dispose();(this.mesh.material as THREE.Material).dispose();this.texture.dispose();
  }
}
