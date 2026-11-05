import * as THREE from 'three';

export const TRANSPORT_IMPACT_SCALE=3;
export const CINEMATIC_IMPACT_SECONDS=5.8;

/** Shared soft fire/smoke texture, independent of DOM or additional image assets. */
export function cinematicImpactTexture(fire:boolean):THREE.DataTexture {
  const stops=fire?[[0,255,255,225,255],[.2,255,225,90,255],[.48,255,111,15,217],[1,135,30,0,0]]:[[0,255,255,255,184],[.45,255,255,255,128],[1,255,255,255,0]];
  const size=96,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.min(1,Math.hypot(x+.5-size/2,y+.5-size/2)/(size/2));
    let index=1;while(index<stops.length-1&&r>stops[index]![0]!)index++;
    const a=stops[index-1]!,b=stops[index]!,t=(r-a[0]!)/(b[0]!-a[0]!);
    for(let c=0;c<4;c++)data[(y*size+x)*4+c]=Math.round(a[c+1]!+(b[c+1]!-a[c+1]!)*t);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

/** The M13 impact flash, rolling fire cap, smoke and dust ring. Presentation only. */
export class CinematicImpactBlast {
  readonly root=new THREE.Group();
  private readonly fire:THREE.Texture;
  private readonly smoke:THREE.Texture;
  private readonly ownedTextures:boolean;
  private readonly flash:THREE.Sprite;
  private readonly billows:THREE.Sprite[]=[];
  private readonly ring:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
  constructor(readonly scale=TRANSPORT_IMPACT_SCALE,textures?:{fire:THREE.Texture;smoke:THREE.Texture},fog=true){
    this.ownedTextures=!textures;this.fire=textures?.fire??cinematicImpactTexture(true);this.smoke=textures?.smoke??cinematicImpactTexture(false);
    this.flash=new THREE.Sprite(new THREE.SpriteMaterial({map:this.fire,color:0xffffff,transparent:true,opacity:0,fog,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    this.root.add(this.flash);
    for(let i=0;i<18;i++){const billow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.fire,color:0xffcc75,transparent:true,opacity:0,fog,depthWrite:false,toneMapped:false}));this.billows.push(billow);this.root.add(billow);}
    this.ring=new THREE.Mesh(new THREE.RingGeometry(.8,1,48),new THREE.MeshBasicMaterial({color:0xc5aa7f,transparent:true,opacity:0,fog,depthWrite:false,side:THREE.DoubleSide}));
    this.ring.rotation.x=-Math.PI/2;this.root.add(this.ring);this.root.visible=false;
  }
  update(age:number,contact:THREE.Vector3):void{
    this.root.visible=age>=0&&age<CINEMATIC_IMPACT_SECONDS;if(!this.root.visible)return;
    this.root.position.copy(contact);
    this.flash.position.set(0,45*this.scale,0);this.flash.scale.setScalar((160+Math.min(age/.35,1)*740)*this.scale);
    this.flash.material.opacity=Math.max(0,1-age/1.1);this.flash.visible=age<1.1;
    this.ring.position.set(0,2*this.scale,0);this.ring.scale.setScalar((60+age*320)*this.scale);
    this.ring.material.opacity=Math.max(0,.55-age*.18);this.ring.visible=age<3.1;
    const rise=1-Math.exp(-age*.8);
    for(let i=0;i<this.billows.length;i++){
      const billow=this.billows[i]!,cap=i>=6,angle=(i-6)*Math.PI/6;
      const radius=(cap?90+rise*210:Math.sin(i*2.4)*35)*this.scale;
      billow.position.set(Math.cos(angle)*radius,(cap?110+rise*430+Math.sin(angle*3)*35:45+i*(35+rise*35))*this.scale,Math.sin(angle)*radius);
      const size=(cap?100+rise*240:80+rise*95)*this.scale;billow.scale.set(size,size*(cap?.85:1.35),1);
      const smoke=age>1.25+i*.025,map=smoke?this.smoke:this.fire;
      if(billow.material.map!==map){billow.material.map=map;billow.material.needsUpdate=true;}
      billow.material.color.setHex(smoke?0x665951:0xffbb62);
      billow.material.opacity=Math.min(1,age*5)*Math.min(1,(5.8-age)/1.6)*.88;
    }
  }
  dispose():void{
    this.root.removeFromParent();this.flash.material.dispose();for(const billow of this.billows)billow.material.dispose();
    this.ring.geometry.dispose();this.ring.material.dispose();if(this.ownedTextures){this.fire.dispose();this.smoke.dispose();}this.root.clear();
  }
}
