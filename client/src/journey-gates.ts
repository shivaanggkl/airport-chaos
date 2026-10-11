import * as THREE from 'three';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas16, journeyDallas19, journeyDallas20, journeyDallas22, journeyDallas24 } from '../../shared/journey-mission.mjs';

const goldenRace = (id: string): boolean => id === journeyDallas01.id || id === journeyDallas02.id || id === journeyDallas03.id || id === journeyDallas04.id;

const cyan = new THREE.MeshBasicMaterial({ color: 0x64eaff, transparent: true, opacity: .94, depthWrite: false });
const ice = new THREE.MeshBasicMaterial({ color: 0xe4ffff, transparent: true, opacity: .82, depthWrite: false });
const gold = new THREE.MeshBasicMaterial({ color: 0xffcb50, transparent: true, opacity: .96, depthWrite: false });
const rookieGold = new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: .98, depthWrite: false });
const rookieInner = new THREE.MeshBasicMaterial({ color: 0xfff4c9, transparent: true, opacity: .97, depthWrite: false });
const rookieAmber = new THREE.MeshBasicMaterial({ color: 0xffb529, transparent: true, opacity: .98, depthWrite: false });
const rookiePreview = new THREE.MeshBasicMaterial({ color: 0xffd766, transparent: true, opacity: .42, depthWrite: false });
const slalomGold = new THREE.MeshBasicMaterial({ color: 0xf7c948, toneMapped: false, depthWrite: false });
const slalomInner = new THREE.MeshBasicMaterial({ color: 0xfff4c9, toneMapped: false, depthWrite: false });
const slalomAccent = new THREE.MeshBasicMaterial({ color: 0xffd766, toneMapped: false, depthWrite: false });
const ringShape = new THREE.TorusGeometry(1, .08, 8, 48);
const rookieRingShape = new THREE.TorusGeometry(1, .12, 8, 48);
const rookieHaloShape = new THREE.TorusGeometry(1, .22, 8, 48);
const innerShape = new THREE.TorusGeometry(.86, .019, 6, 48);
const slalomInnerShape = new THREE.TorusGeometry(.86, .035, 6, 48);
const precisionOpeningShape = new THREE.TorusGeometry(.92, .015, 6, 48);
const accentShape = new THREE.TorusGeometry(1.09, .048, 6, 24, Math.PI * .48);

export class JourneyGateSystem {
  private readonly gates: THREE.Group[] = [];
  private current = 0;
  private active = true;
  private phase = 0;
  private flashIndex = -1;
  private flashTime = 0;

  constructor(private readonly scene: THREE.Scene, private readonly heightAt: (x: number, z: number) => number,
    private readonly mission: typeof journeyDallas01 | typeof journeyDallas02 | typeof journeyDallas03 | typeof journeyDallas04 | typeof journeyDallas05 | typeof journeyDallas06 | typeof journeyDallas07 | typeof journeyDallas10 | typeof journeyDallas11 | typeof journeyDallas12 | typeof journeyDallas13 | typeof journeyDallas16 | typeof journeyDallas19 | typeof journeyDallas20 | typeof journeyDallas22 | typeof journeyDallas24 = journeyDallas01) {
    for (const [index, gate] of mission.gates.entries()) {
      const group = new THREE.Group();
      group.name = `${mission.id}-gate-${index + 1}`;
      group.position.set(gate.x, heightAt(gate.x, gate.z) + gate.altitude, gate.z);
      group.scale.setScalar(gate.radius);
      const next = mission.gates[Math.min(index + 1, mission.gates.length - 1)]!;
      const previous = mission.gates[Math.max(0, index - 1)]!;
      if (mission.id === journeyDallas20.id || mission.id === journeyDallas22.id || mission.id === journeyDallas24.id) {
        const face = mission.id === journeyDallas24.id ? journeyDallas24.gates[index]! : mission.id === journeyDallas22.id ? journeyDallas22.gates[index]! : journeyDallas20.gates[index]!;
        group.lookAt(gate.x + face.normalX, group.position.y + face.normalY, gate.z + face.normalZ);
      } else group.lookAt(gate.x + (mission.id === journeyDallas19.id ? journeyDallas19.exit.normalX : next.x - previous.x),
        group.position.y, gate.z + (mission.id === journeyDallas19.id ? journeyDallas19.exit.normalZ : next.z - previous.z));
      const rookie = goldenRace(mission.id);
      const slalom = mission.id === journeyDallas04.id;
      const rim = new THREE.Mesh(rookie ? rookieRingShape : ringShape, slalom ? slalomGold : rookie ? rookieGold : cyan);
      const core = new THREE.Mesh(slalom ? slalomInnerShape : mission.id === journeyDallas05.id || mission.id === journeyDallas10.id || mission.id === journeyDallas11.id || mission.id === journeyDallas12.id || mission.id === journeyDallas13.id || mission.id === journeyDallas16.id || mission.id === journeyDallas19.id || mission.id === journeyDallas20.id || mission.id === journeyDallas22.id || mission.id === journeyDallas24.id ? precisionOpeningShape : innerShape, slalom ? slalomInner : rookie ? rookieInner : ice);
      const accent = new THREE.Mesh(accentShape, slalom ? slalomAccent : rookie ? rookieAmber : gold);
      accent.rotation.z = -.3;
      if (slalom) accent.scale.setScalar(.98); // Keep the solid highlight inside the accepted outer rim.
      const burst = new THREE.Mesh(ringShape, gold.clone());
      (burst.material as THREE.MeshBasicMaterial).opacity = 0;
      burst.visible = false;
      group.add(rim, core, accent, burst);
      if (rookie) group.add(new THREE.Mesh(rookieHaloShape,
        new THREE.MeshBasicMaterial({ color: 0xffd766, transparent: true, opacity: slalom ? .3 : .16,
          blending: slalom ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, toneMapped: !slalom })));
      scene.add(group);
      this.gates.push(group);
    }
    this.refresh();
  }

  setProgress(gatesPassed: number, active: boolean): void {
    const next = Math.max(0, Math.min(this.mission.gates.length, gatesPassed));
    if (goldenRace(this.mission.id) && next === 0) { this.flashIndex = -1; this.flashTime = 0; }
    if (next > this.current) { this.flashIndex = this.mission.id === journeyDallas04.id ? -1 : this.current; this.flashTime = .5; }
    this.current = next;
    this.active = active;
    this.refresh();
  }

  target(): { x: number; y: number; z: number; index: number } | undefined {
    const gate = this.mission.gates[this.current];
    return this.active && gate ? { x: gate.x, y: this.heightAt(gate.x, gate.z) + gate.altitude, z: gate.z, index: this.current } : undefined;
  }

  update(delta: number): void {
    if (!this.active && this.flashTime <= 0) return;
    this.phase += delta;
    const current = this.gates[this.current];
    if (this.active && current && goldenRace(this.mission.id)) {
      (current.children[4] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material.opacity =
        this.mission.id === journeyDallas04.id ? .29 + .055 * Math.sin(this.phase * 2.5) + this.flashTime * .28 : .15 + .045 * Math.sin(this.phase * 2.5);
      current.children[2]!.rotation.z = this.phase * .65;
    }
    if (this.active && current && !goldenRace(this.mission.id) && this.mission.id !== journeyDallas05.id && this.mission.id !== journeyDallas10.id && this.mission.id !== journeyDallas11.id && this.mission.id !== journeyDallas12.id && this.mission.id !== journeyDallas13.id && this.mission.id !== journeyDallas16.id && this.mission.id !== journeyDallas19.id && this.mission.id !== journeyDallas20.id && this.mission.id !== journeyDallas22.id) current.scale.setScalar(this.mission.gates[this.current]!.radius * (1 + .025 * Math.sin(this.phase * 2.5)));
    if (this.active && current && (this.mission.id === journeyDallas10.id || this.mission.id === journeyDallas11.id || this.mission.id === journeyDallas12.id || this.mission.id === journeyDallas13.id || this.mission.id === journeyDallas16.id || this.mission.id === journeyDallas19.id || this.mission.id === journeyDallas20.id || this.mission.id === journeyDallas22.id || this.mission.id === journeyDallas24.id))
      current.children[2]!.scale.setScalar(1 + .025 * Math.sin(this.phase * 2.5));
    if (this.flashTime > 0) {
      this.flashTime = Math.max(0, this.flashTime - delta);
      const burst = this.gates[this.flashIndex]?.children[3] as THREE.Mesh | undefined;
      if (burst) {
        burst.visible = this.flashTime > 0;
        burst.scale.setScalar(1.04 + (1 - this.flashTime / .5) * (goldenRace(this.mission.id) && this.flashIndex === this.mission.gates.length - 1 ? .75 : .4));
        (burst.material as THREE.MeshBasicMaterial).opacity = this.flashTime * 1.6;
      }
      if (this.flashTime === 0) this.refresh();
    }
  }

  private refresh(): void {
    this.gates.forEach((group, index) => {
      group.visible = (this.active && (index === this.current || this.mission.id !== journeyDallas04.id && index === this.current + 1 ||
        (this.mission.id === journeyDallas10.id || this.mission.id === journeyDallas11.id || this.mission.id === journeyDallas12.id || this.mission.id === journeyDallas13.id || this.mission.id === journeyDallas16.id || this.mission.id === journeyDallas19.id || this.mission.id === journeyDallas20.id || this.mission.id === journeyDallas22.id || this.mission.id === journeyDallas24.id) && index > this.current)) ||
        (index === this.flashIndex && this.flashTime > 0);
      if (goldenRace(this.mission.id)) {
        const active = index === this.current;
        const slalom = this.mission.id === journeyDallas04.id;
        (group.children[0] as THREE.Mesh).material = active ? slalom ? slalomGold : rookieGold : rookiePreview;
        (group.children[1] as THREE.Mesh).material = active ? slalom ? slalomInner : rookieInner : rookiePreview;
        (group.children[2] as THREE.Mesh).material = active ? slalom ? slalomAccent : rookieAmber : rookiePreview;
        (group.children[4] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material.opacity = active ? slalom ? .3 : .16 : .07;
        group.scale.setScalar(this.mission.gates[index]!.radius);
        return;
      }
      group.children.slice(0, 3).forEach((object, part) => {
        if (object instanceof THREE.Mesh) object.material = index === this.current
          ? part === 2 ? gold : part === 1 ? ice : cyan
          : ice;
      });
      if (this.mission.id === journeyDallas10.id || this.mission.id === journeyDallas11.id || this.mission.id === journeyDallas12.id || this.mission.id === journeyDallas13.id || this.mission.id === journeyDallas16.id || this.mission.id === journeyDallas19.id || this.mission.id === journeyDallas20.id || this.mission.id === journeyDallas22.id || this.mission.id === journeyDallas24.id) group.children[2]!.scale.setScalar(this.mission.id === journeyDallas12.id && index === 2 ? 1.2 : 1);
      if (index !== this.current || this.mission.id === journeyDallas05.id || this.mission.id === journeyDallas10.id || this.mission.id === journeyDallas11.id || this.mission.id === journeyDallas12.id || this.mission.id === journeyDallas13.id || this.mission.id === journeyDallas16.id || this.mission.id === journeyDallas19.id || this.mission.id === journeyDallas20.id || this.mission.id === journeyDallas22.id || this.mission.id === journeyDallas24.id)
        group.scale.setScalar(this.mission.gates[index]!.radius * (index === this.current ? 1 : .82));
    });
  }

  dispose(): void {
    for (const gate of this.gates) {
      (gate.children[3] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material.dispose();
      if (goldenRace(this.mission.id))
        (gate.children[4] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material.dispose();
      this.scene.remove(gate);
    }
  }
}
