import * as THREE from 'three';

export const M19_TIMEOUT = Object.freeze({ shootAt: .35, releaseAt: 1.65, impactAt: 3.65, durationMs: 9500 });

/** Mission-owned aftermath only: no collision, damage or persistent city changes. */
export class MonsterCityBlast {
  readonly root=new THREE.Group();
  private readonly sphere=new THREE.IcosahedronGeometry(1,3);
  private readonly ring=new THREE.RingGeometry(.96,1,96);
  private readonly hot=new THREE.MeshBasicMaterial({color:0xfff2cd,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  private readonly fire=new THREE.MeshBasicMaterial({color:0xff6718,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  private readonly shockMaterial=new THREE.MeshBasicMaterial({color:0xffbd65,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
  private readonly core=new THREE.Mesh(this.sphere,this.hot);
  private readonly cloud=new THREE.Mesh(this.sphere,this.fire);
  private readonly shock=new THREE.Mesh(this.ring,this.shockMaterial);
  constructor(){this.root.name='m19-downtown-timeout-blast';this.root.visible=false;this.shock.rotation.x=-Math.PI/2;this.root.add(this.cloud,this.core,this.shock);}
  update(age:number,position:THREE.Vector3):void{
    this.root.visible=age>=0&&age<5.8;if(!this.root.visible)return;
    this.root.position.copy(position);this.root.position.y+=20;
    const expansion=1-Math.exp(-age*2.2),radius=200+3300*expansion;
    this.core.scale.set(radius*.8,radius*.62,radius*.8);this.core.position.y=radius*.2;
    this.cloud.scale.set(radius,radius*.7,radius);this.cloud.position.y=radius*.22;
    this.hot.opacity=.95*Math.exp(-age*2.1);
    this.fire.opacity=.72*(1-THREE.MathUtils.smoothstep(age,1.8,5.2));
    const shockRadius=150+Math.min(age/3.5,1)*5000;
    this.shock.scale.setScalar(shockRadius);this.shock.position.y=35;
    this.shockMaterial.opacity=.85*(1-THREE.MathUtils.smoothstep(age,.4,4.8));
  }
  dispose():void{this.root.removeFromParent();this.sphere.dispose();this.ring.dispose();this.hot.dispose();this.fire.dispose();this.shockMaterial.dispose();}
}
