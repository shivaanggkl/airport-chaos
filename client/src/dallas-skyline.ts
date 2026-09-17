import * as THREE from 'three';
import { dallasFacadePalette, generateDallasSkyline } from '../../shared/dallas-skyline.mjs';
import type { AirportDefinition, ObstacleBounds } from './dallas-world';

export function addDowntownDistrict(scene:THREE.Scene, obstacles:ObstacleBounds[], airports:ReadonlyArray<AirportDefinition>, heightAt:(x:number,z:number)=>number):void {
  const buildings=generateDallasSkyline(airports,obstacles);
  const geometry=new THREE.BoxGeometry(1,1,1);
  const matrix=new THREE.Object3D();
  const parts: Array<Array<{x:number;y:number;z:number;w:number;h:number;d:number;tilt?:number}>>=dallasFacadePalette.map(()=>[]);
  for(const b of buildings){
    const y=heightAt(b.x,b.z),p=parts[b.material];
    const add=(x:number,z:number,w:number,d:number,h:number,base:number,tilt=0)=>p.push({x,y:y+base+h/2,z,w,h,d,tilt});
    add(b.x,b.z,b.width,b.depth,16,0);
    if(b.pattern===5){for(const sign of [-1,1])add(b.x+sign*b.width*.26,b.z,b.width*.4,b.depth*.85,b.height-16,16);}
    else if([4,8,11,12].includes(b.pattern)){
      add(b.x,b.z,b.width*.9,b.depth*.9,b.height*.65-16,16);
      add(b.x,b.z,b.width*.68,b.depth*.68,b.height*.25,b.height*.65);
      add(b.x,b.z,b.width*.46,b.depth*.46,b.height*.1,b.height*.9);
    }else{
      add(b.x,b.z,b.width*.88,b.depth*.88,b.height-24,16);
      add(b.x,b.z,b.width*.76,b.depth*.76,8,b.height-8,b.pattern===9?.1:0);
    }
    if(b.pattern===6)add(b.x,b.z,2,2,24,b.height);
    if(b.pattern===7){ // Inset pale roof bars form an H, batched with the facade.
      const roof=parts[5];
      for(const dx of [-8,8])roof.push({x:b.x+dx,y:y+b.height+1,z:b.z,w:3,h:1,d:24});
      roof.push({x:b.x,y:y+b.height+1,z:b.z,w:18,h:1,d:3});
    }
    obstacles.push({x:b.x,z:b.z,halfX:b.width/2,halfZ:b.depth/2,height:b.height+(b.pattern===6?24:3),baseY:y,polygon:[]});
  }
  parts.forEach((entries,index)=>{
    const material=new THREE.MeshStandardMaterial({color:dallasFacadePalette[index],roughness:index===5||index===6||index===7?.72:.3,metalness:.22});
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 facadePosition;');
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>\nfacadePosition = (instanceMatrix * vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 facadePosition;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float column=facadePosition.x+facadePosition.z;
        vec2 cell=vec2(column/${4+index%4}.0,facadePosition.y/${4+index%3}.0);
        vec2 grid=fract(cell);
        vec2 aa=max(fwidth(cell),vec2(.015));
        float detail=1.0-smoothstep(.15,.65,max(aa.x,aa.y));
        float windowX=smoothstep(.18-aa.x,.18+aa.x,grid.x)*(1.0-smoothstep(.94-aa.x,.94+aa.x,grid.x));
        float windowY=smoothstep(.22-aa.y,.22+aa.y,grid.y)*(1.0-smoothstep(.92-aa.y,.92+aa.y,grid.y));
        float windowMask=mix(.7,windowX*windowY,detail);
        float variation=fract(sin(dot(floor(cell),vec2(12.9898,78.233)))*43758.5453);
        float band=mod(floor(cell.y),${3+index%5}.0);
        float stripe=mod(floor(cell.x),${2+index%4}.0);
        diffuseColor.rgb *= mix(.76,1.06,windowMask);
        diffuseColor.rgb *= ${index%2===0?'mix(.91,1.06,step(.8,stripe))':'mix(.90,1.06,step(.8,band))'};
        totalEmissiveRadiance += vec3(.30,.38,.36)*windowMask*step(.83,variation)*detail*.09;
      `);
    };
    material.customProgramCacheKey=()=>`dallas-facade-${index}`;
    const mesh=new THREE.InstancedMesh(geometry,material,entries.length);mesh.name=`dallas-downtown-facade-${index}`;
    entries.forEach((p,i)=>{matrix.position.set(p.x,p.y,p.z);matrix.scale.set(p.w,p.h,p.d);matrix.rotation.set(0,0,p.tilt??0);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);});
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();scene.add(mesh);
  });
}
