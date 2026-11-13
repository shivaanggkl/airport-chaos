import * as THREE from 'three';
import { dallasCoinTrail, coinCollected, type CoinHuntState } from '../../shared/collectible-trail.mjs';
import { animateCreditFlight } from './credit-flight';
export const coinArtwork='/media/missions/credit-coin.webp';
/** One draw call and a bounded five-element animation pool; no gameplay ownership here. */
export class CollectibleTrailView {
  readonly mesh:THREE.InstancedMesh;
  readonly counter=document.createElement('span');
  private count=document.createElement('strong');
  private pending=document.createElement('small');
  private texture=new THREE.TextureLoader().load(coinArtwork);
  private transform=new THREE.Object3D();
  private flashUntil=new Float64Array(100);
  private state:CoinHuntState|null=null;
  private flights:Array<{node:HTMLImageElement;animations:Animation[];until:number}>=[];
  private lastSound=0;
  private demo=false;
  constructor(private scene:THREE.Scene,header:HTMLElement){
    this.texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:this.texture,transparent:true,alphaTest:.08,side:THREE.DoubleSide,depthWrite:false,fog:false,toneMapped:false});
    this.mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(200,200),material,100);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.frustumCulled=false;
    scene.add(this.mesh);
    this.counter.className='coin-hunt-counter';this.counter.hidden=true;
    const icon=Object.assign(document.createElement('img'),{src:coinArtwork,alt:''});
    this.counter.append(icon,this.count,this.pending);header.append(this.counter);
    for(let i=0;i<5;i++){
      const node=Object.assign(document.createElement('img'),{src:coinArtwork,alt:'',className:'coin-hunt-flying-credit',hidden:true});
      document.body.append(node);this.flights.push({node,animations:[],until:0});
    }
  }
  setState(state:CoinHuntState,reset:boolean,camera:THREE.Camera,sound:()=>void):void {
    const now=performance.now(),previous=reset?null:this.state;
    if(reset)this.clearAnimations();
    let first=-1;
    if(previous)for(let i=0;i<100;i++)if(!coinCollected(previous.mask,i)&&coinCollected(state.mask,i)){
      this.flashUntil[i]=now+220;if(first<0)first=i;
    }
    this.state=state;this.demo=false;this.counter.hidden=false;this.setCount(state.collected);
    if(first>=0){
      const p=dallasCoinTrail[first]!;
      this.transform.position.set(p.x,state.altitude,p.z).project(camera);
      this.fly((this.transform.position.x+1)*innerWidth/2,(1-this.transform.position.y)*innerHeight/2);
      if(now-this.lastSound>180){sound();this.lastSound=now;}
    }
  }
  setCount(value:number):void {
    this.count.textContent=`COINS ${value} / 90`;this.pending.textContent=`${value*10} CREDITS PENDING`;
  }
  fly(x:number,y:number):void {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const now=performance.now(),slot=this.flights.find(f=>f.until<=now);if(!slot)return;
    for(const animation of slot.animations)animation.cancel();
    const rect=this.counter.getBoundingClientRect();slot.node.hidden=false;slot.until=now+600;
    slot.animations=animateCreditFlight(slot.node,Math.max(0,Math.min(innerWidth,x)),Math.max(0,Math.min(innerHeight,y)),rect.left+rect.width/2,rect.top+rect.height/2,600);
  }
  demonstrate():void {
    if(this.demo)return;this.demo=true;this.setCount(1);this.fly(innerWidth*.5,innerHeight*.52);
  }
  restoreCounter():void {this.demo=false;if(this.state)this.setCount(this.state.collected);this.clearAnimations();}
  update(camera:THREE.Camera,now:number):void {
    if(!this.state)return;
    for(let i=0;i<100;i++){
      const p=dallasCoinTrail[i]!,collected=coinCollected(this.state.mask,i);
      const scale=collected?Math.max(0,(this.flashUntil[i]!-now)/220):1;
      this.transform.position.set(p.x,this.state.altitude+Math.sin(now*.0015+i*.3)*5,p.z);
      this.transform.quaternion.copy(camera.quaternion);this.transform.scale.setScalar(scale);
      this.transform.updateMatrix();this.mesh.setMatrixAt(i,this.transform.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
    for(const f of this.flights)if(f.until<=now&&!f.node.hidden){f.node.hidden=true;for(const a of f.animations)a.cancel();f.animations=[];}
  }
  private clearAnimations():void {
    this.flashUntil.fill(0);
    for(const f of this.flights){for(const a of f.animations)a.cancel();f.animations=[];f.until=0;f.node.hidden=true;}
  }
  dispose():void {
    this.clearAnimations();this.counter.remove();for(const f of this.flights)f.node.remove();
    this.scene.remove(this.mesh);this.mesh.geometry.dispose();(this.mesh.material as THREE.Material).dispose();this.texture.dispose();
  }
}
