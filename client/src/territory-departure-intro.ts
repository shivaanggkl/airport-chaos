import * as THREE from 'three';
import {territoryDeparture, territoryDepartureFleetMs, territoryDeparturePose, type TerritoryDeparturePose} from '../../shared/territory-departure.mjs';

export type DepartureAircraft = {plane:THREE.Group;markers:readonly THREE.Object3D[];name:string;assignment:string};

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
  private rendering = false;
  private readonly framing: number[];
  private readonly playerFraming: number;
  readonly origin: THREE.Vector3;

  constructor(readonly aircraft:readonly DepartureAircraft[], readonly player:THREE.Group) {
    this.origin = aircraft[0]!.plane.position.clone();
    this.framing=aircraft.map(actor=>Math.max(12,airframeSize(actor.plane)*.85));
    this.playerFraming=Math.max(12,airframeSize(player)*.85);
    this.saved = aircraft.map(actor=>({position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),order:actor.plane.rotation.order,visible:false,markers:actor.markers.map(marker=>({marker,visible:false}))}));
  }

  activeSlot(elapsed:number):number {
    return Math.max(0,Math.min(this.aircraft.length-1,Math.floor((elapsed-territoryDeparture.establishMs)/territoryDeparture.spacingMs)));
  }

  text(elapsed:number):string {
    if(elapsed<territoryDeparture.establishMs)return 'DFW DEPARTURES\n9 rivals. 6 unowned territories.\nCapture all 6 together to win';
    const slot=this.activeSlot(elapsed),actor=this.aircraft[slot]!;
    return `DEPARTURE ${String(slot+1).padStart(2,'0')} / ${this.aircraft.length} · ${actor.name.toUpperCase()}\n${actor.assignment}\nCapture all 6 together to win`;
  }

  sample(elapsed:number,position:THREE.Vector3,target:THREE.Vector3):void {
    const slot=this.activeSlot(elapsed);
    territoryDeparturePose(slot,elapsed,this.origin,this.pose);
    const distance=this.framing[slot]!;
    target.set(this.pose.position.x,this.pose.position.y+distance*.05,this.pose.position.z+distance*.15);
    const lift=THREE.MathUtils.smoothstep(elapsed-territoryDeparture.establishMs-slot*territoryDeparture.spacingMs,territoryDeparture.rollMs,territoryDeparture.rollMs+1000);
    const side=slot%3===1?distance:-distance;
    position.set(this.pose.position.x+side,this.pose.position.y+distance*(.2+lift*.18),this.pose.position.z+(slot%3===1?distance:-distance*1.2));
    if(elapsed<territoryDeparture.establishMs){
      const establish=1-THREE.MathUtils.smoothstep(elapsed,0,territoryDeparture.establishMs);
      position.x-=establish*distance*2;position.y+=establish*distance;position.z+=establish*distance*3;
      target.z+=establish*distance;
    }
  }

  handoff(elapsed:number,position:THREE.Vector3,target:THREE.Vector3,chasePosition:THREE.Vector3,chaseTarget:THREE.Vector3):void {
    const blend=THREE.MathUtils.smoothstep(elapsed,0,territoryDeparture.handoffMs);
    position.set(this.player.position.x-this.playerFraming,this.player.position.y+this.playerFraming*.3,this.player.position.z-this.playerFraming*1.3).lerp(chasePosition,blend);
    target.set(this.player.position.x,this.player.position.y+this.playerFraming*.05,this.player.position.z+this.playerFraming*.15).lerp(chaseTarget,blend);
  }

  beginRender(elapsed:number,handoff=false):void {
    if(this.rendering)return;
    this.rendering=true;
    for(let slot=0;slot<this.aircraft.length;slot++){
      const actor=this.aircraft[slot]!,saved=this.saved[slot]!;
      saved.position.copy(actor.plane.position);saved.quaternion.copy(actor.plane.quaternion);saved.order=actor.plane.rotation.order;saved.visible=actor.plane.visible;
      for(const entry of saved.markers){entry.visible=entry.marker.visible;entry.marker.visible=false;}
      territoryDeparturePose(slot,elapsed,this.origin,this.pose);
      actor.plane.position.copy(this.pose.position);actor.plane.rotation.set(this.pose.rotation.x,this.pose.rotation.y,this.pose.rotation.z,'YXZ');
      actor.plane.visible=handoff||elapsed<territoryDepartureFleetMs&&(slot===0||elapsed>=territoryDeparture.establishMs+slot*territoryDeparture.spacingMs);
    }
  }

  endRender():void {
    if(!this.rendering)return;
    this.rendering=false;
    for(let slot=0;slot<this.aircraft.length;slot++){
      const actor=this.aircraft[slot]!,saved=this.saved[slot]!;
      actor.plane.position.copy(saved.position);actor.plane.rotation.order=saved.order;actor.plane.quaternion.copy(saved.quaternion);actor.plane.visible=saved.visible;
      for(const entry of saved.markers)entry.marker.visible=entry.visible;
    }
  }
}
