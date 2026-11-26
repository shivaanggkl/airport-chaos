import * as THREE from 'three';
import type {AircraftType} from './aircraft';
import {cinematicImpactTexture} from './cinematic-impact';
import {createFinaleFlights,DALLAS_FINALE,finalePhase,type FinaleFlight} from './dallas-finale-paths';
import './dallas-finale.css';

type Pilot={root:THREE.Group;aircraft:THREE.Group;flight:FinaleFlight;smoke:THREE.InstancedMesh;revealed:number;position:THREE.Vector3;tangent:THREE.Vector3};
/** A server-confirmed finale, using the existing renderer and real aircraft assets. */
export class DallasFinale {
 readonly element=document.createElement('section');
 private readonly formation=new THREE.Group();
 private readonly camera=new THREE.PerspectiveCamera(48,1,1,100_000);
 private readonly pilots:Pilot[]=[];
 private readonly smokeTexture=cinematicImpactTexture(false);
 private readonly smokeMaterial=new THREE.MeshBasicMaterial({map:this.smokeTexture,color:0xdc143c,transparent:true,depthWrite:false,opacity:.8,toneMapped:false,fog:false});
 private readonly wordMaterial=new THREE.MeshStandardMaterial({color:0xdc143c,metalness:.55,roughness:.28,transparent:true,opacity:0,emissive:0x450916,emissiveIntensity:.35,fog:false});
 private readonly tubes:THREE.Mesh[]=[];
 private readonly puffGeometry=new THREE.PlaneGeometry(1,1);
 private readonly sprinkleGeometry=new THREE.PlaneGeometry(1,2.5);
 private readonly sprinkleMaterial=new THREE.MeshBasicMaterial({vertexColors:false,side:THREE.DoubleSide,toneMapped:false,fog:false});
 private readonly sprinkles=new THREE.InstancedMesh(this.sprinkleGeometry,this.sprinkleMaterial,180);
 private readonly starGeometry=new THREE.BufferGeometry();
 private readonly starPositions=new Float32Array(120*3);
 private readonly starTexture:THREE.CanvasTexture;
 private readonly starMaterial:THREE.PointsMaterial;
 private readonly stars:THREE.Points;
 private readonly matrix=new THREE.Object3D();
 private readonly orientation=new THREE.Matrix4();
 private readonly look=new THREE.Vector3();
 private readonly up=new THREE.Vector3(0,0,1);
 private readonly arrivalDirection=new THREE.Vector3(1,0,0);
 private readonly size=new THREE.Vector2();
 private readonly crimson=new THREE.Color(0xdc143c);
 private readonly gold=new THREE.Color(0xffd44d);
 private readonly caption=document.createElement('p');
 private readonly achievement=document.createElement('div');
 private readonly skip=document.createElement('button');
 private readonly reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 private age=0;
 private disposed=false;
 private lastPhase='';
 private previousFocus:HTMLElement|null=null;
 private readonly keydown=(event:KeyboardEvent)=>{event.stopImmediatePropagation();if(event.code==='Escape'){event.preventDefault();this.finish();}};
 constructor(private readonly renderer:THREE.WebGLRenderer,private readonly scene:THREE.Scene,anchor:THREE.Vector3,private readonly prepareWorld:(camera:THREE.PerspectiveCamera,delta:number)=>void,private readonly host:HTMLElement,createAircraft:(type:AircraftType)=>THREE.Group,private readonly disposeAircraft:(plane:THREE.Group)=>void,private readonly complete:()=>void){
  this.element.className='dallas-finale';this.element.setAttribute('role','dialog');this.element.setAttribute('aria-modal','true');this.element.setAttribute('aria-label','Dallas victory celebration');
  const heading=document.createElement('p');heading.className='dallas-finale__heading';heading.textContent='DALLAS • LEGENDARY VICTORY';
  this.caption.className='dallas-finale__caption';this.caption.setAttribute('aria-live','polite');
  this.achievement.className='dallas-finale__achievement';
  const title=document.createElement('h1');title.textContent='DALLAS SAVED';
  const detail=document.createElement('p');detail.textContent='You defeated Dr. Boss. You saved the city.';
  const next=document.createElement('p');next.className='dallas-finale__next';next.textContent='See you in California.';
  this.achievement.append(title,detail,next);
  this.skip.type='button';this.skip.className='dallas-finale__skip';this.skip.textContent='SKIP';this.skip.setAttribute('aria-label','Skip celebration and show mission result');this.skip.onclick=()=>this.finish();
  this.element.append(heading,this.caption,this.achievement,this.skip);
  // The lettering and aircraft live above downtown in the existing Dallas world.
  this.formation.name='dallas-victory-formation';
  this.formation.position.copy(anchor);this.formation.position.y+=3000;
  this.formation.scale.setScalar(30);this.scene.add(this.formation);
  const flights=createFinaleFlights();
  const types:AircraftType[]=['trainer','privateJet','fighter'];
  flights.forEach((flight,index)=>{
   const root=new THREE.Group(),aircraft=createAircraft(types[index]!);root.add(aircraft);this.formation.add(root);
   const fit=()=>{if(this.disposed){this.disposeAircraft(aircraft);return;}const rotation=root.quaternion.clone();root.quaternion.identity();root.scale.setScalar(1);root.updateWorldMatrix(true,true);const size=new THREE.Box3().setFromObject(aircraft).getSize(new THREE.Vector3());size.divideScalar(this.formation.scale.x);root.scale.setScalar(50/Math.max(size.x,size.y,size.z,1));root.quaternion.copy(rotation);};
   fit();void Promise.resolve(aircraft.userData.assetReady).then(fit,fit);
   const smoke=new THREE.InstancedMesh(this.puffGeometry,this.smokeMaterial,flight.samples.length);smoke.count=0;smoke.frustumCulled=false;smoke.name=`dallas-victory-smoke-${types[index]}`;
   flight.samples.forEach((sample,i)=>{this.matrix.position.copy(sample.point);this.matrix.position.z=-2;this.matrix.position.x+=Math.sin(i*2.4)*.7;this.matrix.position.y+=Math.cos(i*1.7)*.7;this.matrix.rotation.set(0,0,i*.31);this.matrix.scale.setScalar(8+(i%5)*.6);this.matrix.updateMatrix();smoke.setMatrixAt(i,this.matrix.matrix);});
   this.formation.add(smoke);this.pilots.push({root,aircraft,flight,smoke,revealed:0,position:new THREE.Vector3(),tangent:new THREE.Vector3()});
   for(const segment of flight.segments)if(segment.ink){const mesh=new THREE.Mesh(new THREE.TubeGeometry(segment.curve,Math.max(16,Math.ceil(segment.curve.getLength()/2)),2.6,8,false),this.wordMaterial);mesh.visible=false;this.tubes.push(mesh);this.formation.add(mesh);}
  });
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.beginPath();
  for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?6:15;const x=16+Math.cos(a)*r,y=16+Math.sin(a)*r;i?context.lineTo(x,y):context.moveTo(x,y);}context.closePath();context.fill();
  this.starTexture=new THREE.CanvasTexture(canvas);this.starMaterial=new THREE.PointsMaterial({map:this.starTexture,color:0xffe49a,size:120,transparent:true,depthWrite:false,toneMapped:false,fog:false});
  this.starGeometry.setAttribute('position',new THREE.BufferAttribute(this.starPositions,3).setUsage(THREE.DynamicDrawUsage));this.stars=new THREE.Points(this.starGeometry,this.starMaterial);this.stars.frustumCulled=false;
  const color=new THREE.Color();for(let i=0;i<180;i++){color.setHex([0xffd44d,0xdc143c,0xfff1cb][i%3]!);this.sprinkles.setColorAt(i,color);}this.sprinkles.frustumCulled=false;
  this.formation.add(this.stars,this.sprinkles);
  this.previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  this.host.classList.add('dallas-finale-active');this.host.append(this.element);window.addEventListener('keydown',this.keydown,true);this.skip.focus({preventScroll:true});
 }
 get active():boolean{return !this.disposed;}
 update(delta:number):void{
  if(this.disposed||document.hidden)return;
  this.age+=Math.min(.05,Math.max(0,delta));const t=this.age;
  if(t>=DALLAS_FINALE.duration){this.finish();return;}
  this.renderer.getSize(this.size);this.camera.aspect=this.size.x/Math.max(1,this.size.y);this.camera.updateProjectionMatrix();
  const distance=Math.max(300,520/this.camera.aspect/(2*Math.tan(THREE.MathUtils.degToRad(24))));
  this.camera.position.set(this.reduced?0:Math.sin(t*.12)*3,-30,distance*(1-.025*THREE.MathUtils.smoothstep(t,0,21)));
  this.formation.localToWorld(this.camera.position);
  this.look.set(0,10,0);this.formation.localToWorld(this.look);this.camera.lookAt(this.look);
  const progress=THREE.MathUtils.clamp((t-DALLAS_FINALE.entry)/(DALLAS_FINALE.writeEnd-DALLAS_FINALE.entry),0,1);
  this.pilots.forEach((pilot,index)=>{
   const {flight}=pilot;let segment=flight.segments.find(s=>progress<=s.end)??flight.segments.at(-1)!;
   const local=THREE.MathUtils.clamp((progress-segment.start)/(segment.end-segment.start),0,1);
   segment.curve.getPointAt(local,pilot.position);segment.curve.getTangentAt(local,pilot.tangent);
   if(t<DALLAS_FINALE.entry){const entrance=THREE.MathUtils.smoothstep(t,0,DALLAS_FINALE.entry);pilot.position.x=THREE.MathUtils.lerp(-260+(index-1)*22,pilot.position.x,entrance);pilot.position.y=THREE.MathUtils.lerp(85-(index-1)*20,pilot.position.y,entrance);pilot.tangent.lerp(this.arrivalDirection,1-entrance).normalize();}
   if(t>DALLAS_FINALE.writeEnd){const exit=t-DALLAS_FINALE.writeEnd;pilot.position.addScaledVector(pilot.tangent,exit*60);pilot.position.z-=exit*9;}
   pilot.root.position.copy(pilot.position);this.look.copy(pilot.position).add(pilot.tangent);this.orientation.lookAt(pilot.position,this.look,this.up);pilot.root.quaternion.setFromRotationMatrix(this.orientation);
   pilot.root.visible=t<16;
   for(const propeller of pilot.aircraft.userData.assetPropellers??[])propeller.rotation.z+=delta*65;
   while(pilot.revealed<flight.samples.length&&flight.samples[pilot.revealed]!.at<=progress)pilot.revealed++;
   pilot.smoke.count=t>=DALLAS_FINALE.entry?pilot.revealed:0;
  });
  const solid=THREE.MathUtils.smoothstep(t,DALLAS_FINALE.writeEnd,DALLAS_FINALE.solidAt);
  this.smokeMaterial.opacity=(1-solid)*.8;this.wordMaterial.opacity=solid;for(const mesh of this.tubes)mesh.visible=solid>0&&t<24.5;
  let gold=THREE.MathUtils.smoothstep(t,13.5,15.2)-THREE.MathUtils.smoothstep(t,15.2,16.4)+THREE.MathUtils.smoothstep(t,16.4,18);
  if(this.reduced)gold=THREE.MathUtils.smoothstep(t,13.5,18);
  this.wordMaterial.color.copy(this.crimson).lerp(this.gold,gold);this.wordMaterial.emissive.copy(this.wordMaterial.color).multiplyScalar(.18);
  this.stars.visible=this.sprinkles.visible=t>=DALLAS_FINALE.solidAt;
  if(t>=DALLAS_FINALE.solidAt){
   const height=520/this.camera.aspect,rain=t-DALLAS_FINALE.solidAt,speed=this.reduced?12:30;
   for(let i=0;i<180;i++){
    const x=((i*.6180339)%1-.5)*570+Math.sin(rain+i)*3,y=height*.7-((i*17+rain*(speed+i%9))%(height*1.4));
    this.matrix.position.set(x,y,25+i%15);this.matrix.rotation.set(rain*.5+i,i*.2,rain+i);this.matrix.scale.setScalar(.6+i%3*.3);this.matrix.updateMatrix();this.sprinkles.setMatrixAt(i,this.matrix.matrix);
    if(i<120){this.starPositions[i*3]=x;this.starPositions[i*3+1]=y+8;this.starPositions[i*3+2]=45;}
   }
   this.sprinkles.instanceMatrix.needsUpdate=true;this.starGeometry.attributes.position!.needsUpdate=true;
  }
  const phase=finalePhase(t);
  if(phase!==this.lastPhase){this.lastPhase=phase;this.caption.textContent=phase==='arrival'?'Dallas skies belong to its heroes.':phase==='writing'?'Bluejay. Nightowl. Firehawk. One victory.':phase==='crimson'||phase==='gold'?'A legendary victory.':'';}
  this.achievement.classList.toggle('is-visible',phase==='achievement');this.caption.hidden=phase==='achievement';
  this.prepareWorld(this.camera,delta);
  this.renderer.render(this.scene,this.camera);
 }
 private finish():void{if(this.disposed)return;this.dispose();this.complete();}
 dispose():void{
  if(this.disposed)return;this.disposed=true;window.removeEventListener('keydown',this.keydown,true);this.element.remove();this.host.classList.remove('dallas-finale-active');
  for(const pilot of this.pilots){this.disposeAircraft(pilot.aircraft);pilot.root.removeFromParent();pilot.smoke.dispose();}
  for(const tube of this.tubes)tube.geometry.dispose();
  this.puffGeometry.dispose();this.smokeMaterial.dispose();this.smokeTexture.dispose();this.wordMaterial.dispose();this.sprinkles.dispose();this.sprinkleGeometry.dispose();this.sprinkleMaterial.dispose();this.starGeometry.dispose();this.starMaterial.dispose();this.starTexture.dispose();this.formation.removeFromParent();this.formation.clear();
  if(this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});
 }
}
