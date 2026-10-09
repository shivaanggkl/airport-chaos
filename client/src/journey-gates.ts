import * as THREE from 'three';
import { journeyDallas01, journeyDallas03, journeyDallas05 } from '../../shared/journey-mission.mjs';

const cyan = new THREE.MeshBasicMaterial({ color: 0x64eaff, transparent: true, opacity: .94, depthWrite: false });
const ice = new THREE.MeshBasicMaterial({ color: 0xe4ffff, transparent: true, opacity: .82, depthWrite: false });
const gold = new THREE.MeshBasicMaterial({ color: 0xffcb50, transparent: true, opacity: .96, depthWrite: false });
const ringShape = new THREE.TorusGeometry(1, .08, 8, 48);
const innerShape = new THREE.TorusGeometry(.86, .019, 6, 48);
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
    private readonly mission: typeof journeyDallas01 | typeof journeyDallas03 | typeof journeyDallas05 = journeyDallas01) {
    for (const [index, gate] of mission.gates.entries()) {
      const group = new THREE.Group();
      group.name = `${mission.id}-gate-${index + 1}`;
      group.position.set(gate.x, heightAt(gate.x, gate.z) + gate.altitude, gate.z);
      group.scale.setScalar(gate.radius);
      const next = mission.gates[Math.min(index + 1, mission.gates.length - 1)]!;
      const previous = mission.gates[Math.max(0, index - 1)]!;
      group.lookAt(gate.x + next.x - previous.x, group.position.y, gate.z + next.z - previous.z);
      const rim = new THREE.Mesh(ringShape, cyan);
      const core = new THREE.Mesh(mission.id === journeyDallas05.id ? precisionOpeningShape : innerShape, ice);
      const accent = new THREE.Mesh(accentShape, gold);
      accent.rotation.z = -.3;
      const burst = new THREE.Mesh(ringShape, gold.clone());
      (burst.material as THREE.MeshBasicMaterial).opacity = 0;
      burst.visible = false;
      group.add(rim, core, accent, burst);
      scene.add(group);
      this.gates.push(group);
    }
    this.refresh();
  }

  setProgress(gatesPassed: number, active: boolean): void {
    const next = Math.max(0, Math.min(4, gatesPassed));
    if (next > this.current) { this.flashIndex = this.current; this.flashTime = .5; }
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
    if (this.active && current && this.mission.id !== journeyDallas05.id) current.scale.setScalar(this.mission.gates[this.current]!.radius * (1 + .025 * Math.sin(this.phase * 2.5)));
    if (this.flashTime > 0) {
      this.flashTime = Math.max(0, this.flashTime - delta);
      const burst = this.gates[this.flashIndex]?.children[3] as THREE.Mesh | undefined;
      if (burst) {
        burst.visible = this.flashTime > 0;
        burst.scale.setScalar(1.04 + (1 - this.flashTime / .5) * .4);
        (burst.material as THREE.MeshBasicMaterial).opacity = this.flashTime * 1.6;
      }
      if (this.flashTime === 0) this.refresh();
    }
  }

  private refresh(): void {
    this.gates.forEach((group, index) => {
      group.visible = (this.active && (index === this.current || index === this.current + 1)) ||
        (index === this.flashIndex && this.flashTime > 0);
      group.children.slice(0, 3).forEach((object, part) => {
        if (object instanceof THREE.Mesh) object.material = index === this.current
          ? part === 2 ? gold : part === 1 ? ice : cyan
          : ice;
      });
      if (index !== this.current || this.mission.id === journeyDallas05.id)
        group.scale.setScalar(this.mission.gates[index]!.radius * (index === this.current ? 1 : .82));
    });
  }

  dispose(): void {
    for (const gate of this.gates) {
      (gate.children[3] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material.dispose();
      this.scene.remove(gate);
    }
  }
}
