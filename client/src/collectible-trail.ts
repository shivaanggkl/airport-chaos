import * as THREE from 'three';
import { dallasCoinTrail, coinCollected, queryCoinTrail, type CoinHuntState } from '../../shared/collectible-trail.mjs';
import { animateCreditFlight } from './credit-flight';
export const coinArtwork='/media/missions/credit-coin.webp';
/** One draw call and a bounded five-element animation pool; no gameplay ownership here. */
export class CollectibleTrailView {
  readonly mesh:THREE.InstancedMesh;
  readonly counter=document.createElement('span');
  private count=document.createElement('strong');
  private texture=new THREE.TextureLoader().load(coinArtwork);
  private transform=new THREE.Object3D();
  private flashUntil=new Float64Array(1000);
  private state:CoinHuntState|null=null;
  private flights:Array<{node:HTMLImageElement;animations:Animation[];until:number}>=[];
  private lastSound=0;
  private demo=false;
  private visibleIds=new Int32Array(48);
  private scores=new Float64Array(48);
  private visibleCount=0;
  private nextSelection=0;
  private selectionX=0;private selectionZ=0;private selectionHeading=0;private selectionNow=0;
  private pulse:Animation|undefined;
  private selectCoin=(index:number):void=>{
    if(!this.state||(coinCollected(this.state.mask,index)&&this.flashUntil[index]!<=this.selectionNow))return;
    const p=dallasCoinTrail[index]!,dx=p.x-this.selectionX,dz=p.z-this.selectionZ;
    const distance=dx*dx+dz*dz;if(distance>1800*1800)return;
    const forward=-Math.sin(this.selectionHeading)*dx-Math.cos(this.selectionHeading)*dz;
    const score=distance+(forward < -400?1800000:0);
    let at=this.visibleCount;
    if(at===48){if(score>=this.scores[47]!)return;at=47;}else this.visibleCount++;
    while(at>0&&score<this.scores[at-1]!){this.scores[at]=this.scores[at-1]!;this.visibleIds[at]=this.visibleIds[at-1]!;at--;}
    this.scores[at]=score;this.visibleIds[at]=index;
  };
  constructor(private scene:THREE.Scene,header:HTMLElement){
    this.texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map:this.texture,transparent:true,alphaTest:.08,side:THREE.DoubleSide,depthWrite:false,fog:false,toneMapped:false});
    this.mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(90,90),material,48);
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
  setState(state:CoinHuntState,reset:boolean,camera:THREE.Camera,sound:()=>void):void {
    const now=performance.now(),previous=reset?null:this.state;
    if(reset)this.clearAnimations();
    let first=-1;
    if(previous)for(let group=0;group<state.mask.length;group++){
      if(state.mask[group]===previous.mask[group])continue;
      for(let bit=0;bit<4;bit++){const i=group*4+bit;
        if(!coinCollected(previous.mask,i)&&coinCollected(state.mask,i)){this.flashUntil[i]=now+220;if(first<0)first=i;}}
    }
    this.state=state;this.demo=false;this.counter.hidden=false;this.setCount(state.collected);
    if(previous&&Math.floor(state.collected/10)>Math.floor(previous.collected/10)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      this.pulse?.cancel();this.pulse=this.count.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:220});
    }
    if(first>=0){
      const p=dallasCoinTrail[first]!;
      this.transform.position.set(p.x,state.altitude,p.z).project(camera);
      this.fly((this.transform.position.x+1)*innerWidth/2,(1-this.transform.position.y)*innerHeight/2);
      if(now-this.lastSound>180){sound();this.lastSound=now;}
    }
  }
  setCount(value:number):void {
    this.count.textContent=`${value} CREDITS COLLECTED`;
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
  update(camera:THREE.Camera,now:number,position:THREE.Vector3=camera.position,heading=0):void {
    if(!this.state)return;
    if(now>=this.nextSelection){
      this.nextSelection=now+150;this.selectionNow=now;this.selectionX=position.x;this.selectionZ=position.z;this.selectionHeading=heading;
      this.visibleCount=0;
      queryCoinTrail(position.x-1800,position.x+1800,position.z-1800,position.z+1800,this.selectCoin);
      this.mesh.count=this.visibleCount;
    }
    for(let slot=0;slot<this.visibleCount;slot++){
      const i=this.visibleIds[slot]!,p=dallasCoinTrail[i]!,collected=coinCollected(this.state.mask,i);
      const scale=collected?Math.max(0,(this.flashUntil[i]!-now)/220):1;
      this.transform.position.set(p.x,this.state.altitude+Math.sin(now*.0015+i*.3)*5,p.z);
      this.transform.quaternion.copy(camera.quaternion);this.transform.scale.setScalar(scale);
      this.transform.updateMatrix();this.mesh.setMatrixAt(slot,this.transform.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
    for(const f of this.flights)if(f.until<=now&&!f.node.hidden){f.node.hidden=true;for(const a of f.animations)a.cancel();f.animations=[];}
  }
  private clearAnimations():void {
    this.flashUntil.fill(0);this.nextSelection=0;this.pulse?.cancel();this.pulse=undefined;
    for(const f of this.flights){for(const a of f.animations)a.cancel();f.animations=[];f.until=0;f.node.hidden=true;}
  }
  dispose():void {
    this.clearAnimations();this.counter.remove();for(const f of this.flights)f.node.remove();
    this.scene.remove(this.mesh);this.mesh.geometry.dispose();(this.mesh.material as THREE.Material).dispose();this.texture.dispose();
  }
}
