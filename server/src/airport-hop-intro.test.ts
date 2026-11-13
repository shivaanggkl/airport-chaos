import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cityAirports } from '../../shared/city-airports.mjs';
import { AirportHopIntro } from '../../client/src/mission-airport-hop-intro.ts';

class ElementFixture {
  style: Record<string, string> = {};
  children: ElementFixture[] = [];
  attributes: Record<string, string> = {};
  textContent = '';
  removed = false;
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  append(...children: ElementFixture[]) { this.children.push(...children); }
  remove() { this.removed = true; }
}

test('airport overview shows three ordered real stops, fits viewports, hands off and disposes', () => {
  const previousDocument = globalThis.document;
  Object.assign(globalThis, { document: {
    createElement: () => new ElementFixture(), createElementNS: () => new ElementFixture(),
  } });
  try {
    const airports = cityAirports.dallas.map(airport => ({ ...airport, name: `Airport ${airport.id}` }));
    for (const [width, height] of [[1440, 900], [844, 390], [667, 375], [375, 812]]) {
      const host = new ElementFixture();
      const intro = new AirportHopIntro(airports, () => 100, host as unknown as HTMLElement);
      const overlay = host.children[0], labels = overlay.children.slice(1);
      assert.deepEqual(labels.map(label => label.children[0].textContent), ['1', '2', '3']);
      assert.deepEqual(labels.map(label => label.children[1].textContent), ['Airport dfw', 'Airport love', 'Airport addison']);
      assert.equal(overlay.children[0].children.length, 2, 'two route arrows');
      const camera = new THREE.PerspectiveCamera(58, width / height, 1, 1_000_000);
      const target = new THREE.Vector3(), chase = new THREE.Vector3(100, 200, 300), chaseTarget = new THREE.Vector3(0, 200, 0);
      for (const elapsed of [0, 5_000, 10_500]) {
        intro.sample(elapsed, camera.position, target, chase, chaseTarget, camera.aspect, 0);
        camera.lookAt(target); intro.update(camera, 0);
        for (const label of labels) {
          assert.ok(parseFloat(label.style.left) > 15 && parseFloat(label.style.left) < 85);
          assert.ok(parseFloat(label.style.top) > 25 && parseFloat(label.style.top) < 72);
        }
      }
      intro.sample(12_000, camera.position, target, chase, chaseTarget, camera.aspect, 1);
      assert.ok(camera.position.equals(chase)); assert.ok(target.equals(chaseTarget));
      camera.lookAt(target); intro.update(camera, 1); assert.equal(overlay.style.opacity, '0');
      intro.dispose(); assert.equal(overlay.removed, true);
    }
  } finally { Object.assign(globalThis, { document: previousDocument }); }
});


test('mission destination reuses the blue beacon at any range without unrelated or duplicate beams',async()=>{
  const previousDocument=globalThis.document,previousWindow=globalThis.window;
  const host=new ElementFixture();
  Object.assign(globalThis,{document:{documentElement:{style:{setProperty(){}}},createElement:()=>new ElementFixture(),querySelector:(id:string)=>id==='#game-root'?host:null},window:{innerWidth:1440,innerHeight:900}});
  try {
    const scene=new THREE.Scene();
    const {NavigationBeaconSystem}=await import('../../client/src/navigation-beacons.ts');
    const beacons=new NavigationBeaconSystem(scene,[
      {id:'love',label:'Metro Central',x:100000,z:0,kind:'airport'},
      {id:'addison',label:'North Metro',x:0,z:-100000,kind:'airport'}],()=>20);
    const group=scene.getObjectByName('sky-navigation-beacons')!;
    const camera=new THREE.PerspectiveCamera(58,1.6,1,200000);
    const exclusion={x:0,y:0,radius:0,active:false};
    beacons.setEnabled(false);
    for(const id of ['love','addison']){
      beacons.update(new THREE.Vector3(),camera,{x:100000,z:0},()=>20,exclusion,id);
      assert.deepEqual(group.children.filter(child=>child.visible).map(child=>child.name),[`sky-beacon-${id}`]);
      const beam=group.getObjectByName(`sky-beacon-${id}`) as THREE.Mesh;
      assert.equal((beam.material as THREE.MeshBasicMaterial).color.getHexString(),'73d8ed');
    }
    beacons.update(new THREE.Vector3(),camera,null,()=>20,exclusion);
    assert.equal(group.children.some(child=>child.visible),false,'ending mission clears beacon');
    beacons.dispose(scene);
  } finally {Object.assign(globalThis,{document:previousDocument,window:previousWindow});}
});
