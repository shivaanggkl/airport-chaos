import * as THREE from 'three';
import {territoryDeparture, territoryDepartureFleetStartMs, territoryDepartureTakeoffMs, territoryDepartureFleetMs, territoryDeparturePose, type TerritoryDeparturePose} from '../../shared/territory-departure.mjs';

export type DepartureAircraft = {plane:THREE.Group;markers:readonly THREE.Object3D[];name:string;assignment:string;identityTag?:THREE.Sprite;paintIdentity?:(position:THREE.Vector3Like,distance:number)=>void};

/** Ignore hidden procedural fallbacks and inactive effects when framing the loaded airframe. */
function airframeSize(plane:THREE.Group):number {
  const root=plane.getObjectByName('aircraft-visual-root')??plane,box=new THREE.Box3(),part=new THREE.Box3();
  plane.updateMatrixWorld(true);
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||!object.visible)return;
    let parent=object.parent;
    while(parent&&parent!==plane){if(!parent.visible)return;parent=parent.parent;}
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(!materials.some(material=>material.visible&&material.opacity>.01))return;
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
    if(object.geometry.boundingBox)box.union(part.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
  });
  return box.isEmpty()?20:box.getSize(new THREE.Vector3()).length();
}

/** Borrows the actual mission models for a render only. Network transforms are always restored. */
export class TerritoryDepartureIntro {
  private readonly pose: TerritoryDeparturePose = {position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}};
  private readonly saved;
  private readonly savedLabels;
  private rendering = false;
  private readonly framing: number[];
  private readonly playerFraming: number;
  private readonly nextPaint: number[];
  private readonly maximumFraming: number;
  private readonly projected = new THREE.Vector3();
  readonly origin: THREE.Vector3;

  constructor(readonly aircraft:readonly DepartureAircraft[], readonly player:THREE.Group) {
    this.origin = player.position.clone();
    this.nextPaint=aircraft.map(()=>0);
    this.framing=aircraft.map(actor=>{
      const airframe=actor.plane.getObjectByName('aircraft-visual-root');
      const canonical=airframe?.userData.presentationScale as number|undefined;
      return Math.max(12,airframeSize(actor.plane)*.85*(airframe&&canonical?canonical/airframe.scale.x:1));
    });
    this.playerFraming=Math.max(12,airframeSize(player)*.85);
    this.maximumFraming=Math.max(...this.framing);
    this.savedLabels=aircraft.map(actor=>({label:actor.identityTag,position:new THREE.Vector3(),scale:new THREE.Vector3(),visible:false,opacity:1}));
    this.saved = aircraft.map(actor=>({airframe:actor.plane.getObjectByName('aircraft-visual-root'),airframeScale:new THREE.Vector3(),position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),order:actor.plane.rotation.order,visible:false,markers:actor.markers.map(marker=>({marker,visible:false,position:new THREE.Vector3(),scale:new THREE.Vector3(),opacity:marker instanceof THREE.Sprite?marker.material.opacity:1}))}));
  }

  text(elapsed:number):string {
    if(elapsed<territoryDepartureTakeoffMs)return 'DFW DEPARTURE LINE\n9 rivals. One runway.\nCapture all 6 territories together to win';
    const airborne=Math.max(0,Math.min(this.aircraft.length,Math.floor((elapsed-territoryDepartureTakeoffMs-territoryDeparture.rollMs)/territoryDeparture.spacingMs)+1));
    return `DFW · RUNWAY IN MOTION\n${airborne} / ${this.aircraft.length} AIRBORNE\nCapture all 6 territories together to win`;
  }

  /** A single crane move holds the queue and launch end together; no per-aircraft cuts. */
  sample(elapsed:number,position:THREE.Vector3,target:THREE.Vector3,aspect=16/9):void {
    const length=this.aircraft.length*territoryDeparture.queueSpacing;
    const horizontalHalfFov=Math.atan(Math.tan(THREE.MathUtils.degToRad(21))*Math.max(.65,aspect));
    const distance=Math.max((length*.5+this.maximumFraming)*1.12/Math.tan(horizontalHalfFov),length*.55);
    const rollView=THREE.MathUtils.smoothstep(elapsed,territoryDepartureTakeoffMs-500,territoryDepartureTakeoffMs+3500);
    let center=this.origin.z+length*.5+rollView*length*.85;
    let altitude=this.origin.y;
    const tailStart=territoryDepartureTakeoffMs+(this.aircraft.length-1)*territoryDeparture.spacingMs+territoryDeparture.rollMs;
    const follow=THREE.MathUtils.smoothstep(elapsed,tailStart,territoryDepartureFleetMs);
    territoryDeparturePose(this.aircraft.length-1,elapsed,this.origin,this.pose);
    center=THREE.MathUtils.lerp(center,this.pose.position.z,follow);
    altitude=THREE.MathUtils.lerp(altitude,this.pose.position.y,follow);
    const crane=THREE.MathUtils.smoothstep(elapsed,territoryDepartureFleetStartMs,territoryDepartureTakeoffMs);
    position.set(this.origin.x-distance*(1-.12*crane),altitude+distance*(.48-.08*crane),center-distance*.08);
    target.set(this.origin.x,altitude+12,center);
  }

  handoff(elapsed:number,position:THREE.Vector3,target:THREE.Vector3,chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void {
    const blend=THREE.MathUtils.smoothstep(elapsed,0,territoryDeparture.handoffMs);
    position.set(this.player.position.x-this.playerFraming,this.player.position.y+this.playerFraming*.3,this.player.position.z-this.playerFraming*1.3).lerp(chasePosition,blend);
    target.set(this.player.position.x,this.player.position.y+this.playerFraming*.05,this.player.position.z+this.playerFraming*.15).lerp(chaseTarget,blend);
  }

  beginRender(elapsed:number,handoff=false,camera?:THREE.PerspectiveCamera,viewportHeight=720,viewportWidth=1280):void {
    if(this.rendering)return;
    this.rendering=true;
    camera?.updateMatrixWorld();
    for(let slot=0;slot<this.aircraft.length;slot++){
      const actor=this.aircraft[slot]!,saved=this.saved[slot]!;
      saved.position.copy(actor.plane.position);saved.quaternion.copy(actor.plane.quaternion);saved.order=actor.plane.rotation.order;saved.visible=actor.plane.visible;
      if(saved.airframe){saved.airframeScale.copy(saved.airframe.scale);const scale=saved.airframe.userData.presentationScale as number|undefined;if(scale)saved.airframe.scale.setScalar(scale);}
      for(const entry of saved.markers){entry.visible=entry.marker.visible;entry.position.copy(entry.marker.position);entry.scale.copy(entry.marker.scale);if(entry.marker instanceof THREE.Sprite)entry.opacity=entry.marker.material.opacity;entry.marker.visible=false;}
      territoryDeparturePose(slot,elapsed,this.origin,this.pose);
      actor.plane.position.copy(this.pose.position);actor.plane.rotation.set(this.pose.rotation.x,this.pose.rotation.y,this.pose.rotation.z,'YXZ');
      actor.plane.visible=handoff||elapsed>=territoryDepartureFleetStartMs&&elapsed<territoryDepartureFleetMs;
      const label=actor.identityTag,savedLabel=this.savedLabels[slot]!;
      if(savedLabel.label!==label)this.nextPaint[slot]=0;
      savedLabel.label=label;
      if(label){savedLabel.position.copy(label.position);savedLabel.scale.copy(label.scale);savedLabel.opacity=label.material.opacity;savedLabel.visible=label.visible;label.visible=false;}
      if(label&&actor.plane.visible&&camera){
        const distance=camera.position.distanceTo(actor.plane.position);
        const worldPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,viewportHeight);
        const widthPixels=Math.min(150,Math.max(94,viewportWidth/(this.aircraft.length+1)));
        label.position.copy(actor.plane.position);label.position.y+=this.framing[slot]!*.24+worldPerPixel*(26+(slot%2)*32);
        label.scale.set(worldPerPixel*widthPixels,worldPerPixel*widthPixels*.25,1);
        this.projected.copy(label.position).project(camera);
        label.visible=this.projected.z>-1&&this.projected.z<1&&Math.abs(this.projected.x)<1.1&&Math.abs(this.projected.y)<1.1;
        label.material.opacity=1;
        if(elapsed>=this.nextPaint[slot]!){actor.paintIdentity?.(this.pose.position,actor.plane.position.distanceTo(this.player.position));this.nextPaint[slot]=elapsed+150;}
      }
    }
  }

  endRender():void {
    if(!this.rendering)return;
    this.rendering=false;
    for(let slot=0;slot<this.aircraft.length;slot++){
      const actor=this.aircraft[slot]!,saved=this.saved[slot]!;
      actor.plane.position.copy(saved.position);actor.plane.rotation.order=saved.order;actor.plane.quaternion.copy(saved.quaternion);actor.plane.visible=saved.visible;
      if(saved.airframe)saved.airframe.scale.copy(saved.airframeScale);
      const savedLabel=this.savedLabels[slot]!;
      if(savedLabel.label){savedLabel.label.position.copy(savedLabel.position);savedLabel.label.scale.copy(savedLabel.scale);savedLabel.label.material.opacity=savedLabel.opacity;savedLabel.label.visible=savedLabel.visible;}
      for(const entry of saved.markers){entry.marker.visible=entry.visible;entry.marker.position.copy(entry.position);entry.marker.scale.copy(entry.scale);if(entry.marker instanceof THREE.Sprite)entry.marker.material.opacity=entry.opacity;}
    }
  }
}
