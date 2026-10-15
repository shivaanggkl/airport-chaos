import * as THREE from 'three';

type Gate = Readonly<{ x: number; z: number; altitude: number; radius: number }>;

const SHOT_MS = 600;
const HANDOFF_MS = 650;

/** A short, local camera preview. The aircraft and race clock stay at the start. */
export class MissionGateIntro {
  readonly durationMs: number;
  private readonly element: HTMLElement;
  private readonly progressElement: HTMLElement;
  private readonly positions: THREE.Vector3[];
  private readonly targets: THREE.Vector3[];
  private readonly target = new THREE.Vector3();
  private startedAt = performance.now();
  private finished = false;
  private shownGate = -1;

  constructor(root: HTMLElement, gates: readonly Gate[], spawn: Readonly<{ x: number; z: number; altitude: number }>, heightAt: (x: number, z: number) => number,
    private readonly onGate: (index: number | null) => void, title = 'NEEDLE RUSH') {
    this.durationMs = gates.length * SHOT_MS + HANDOFF_MS;
    this.positions = gates.map((gate, index) => {
      const previous = gates[index - 1] ?? spawn;
      const dx = gate.x - previous.x;
      const dz = gate.z - previous.z;
      const length = Math.max(1, Math.hypot(dx, dz));
      const distance = gate.radius * 2.65;
      const x = gate.x - dx / length * distance;
      const z = gate.z - dz / length * distance;
      return new THREE.Vector3(x, Math.max(heightAt(x, z) + 100, heightAt(gate.x, gate.z) + gate.altitude + gate.radius * .55), z);
    });
    this.targets = gates.map(gate => new THREE.Vector3(gate.x, heightAt(gate.x, gate.z) + gate.altitude, gate.z));
    this.element = document.createElement('aside');
    this.element.className = 'mission-gate-intro';
    this.element.setAttribute('aria-label', `${title} gate preview`);
    const heading = document.createElement('strong');
    heading.textContent = title;
    this.progressElement = document.createElement('span');
    const skip = document.createElement('small');
    skip.textContent = 'TAP TO FLY';
    this.element.append(heading, this.progressElement, skip);
    root.append(this.element);
    root.classList.add('mission-gate-intro-active');
    this.showGate(0);
  }

  get active(): boolean { return !this.finished; }

  apply(camera: THREE.PerspectiveCamera, chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3, chaseFov: number, now = performance.now()): boolean {
    if (this.finished) return false;
    const elapsed = Math.max(0, now - this.startedAt);
    if (elapsed >= this.durationMs) { this.finish(); return false; }
    const gateIndex = Math.min(this.positions.length - 1, Math.floor(elapsed / SHOT_MS));
    this.showGate(gateIndex);
    const shotProgress = (elapsed % SHOT_MS) / SHOT_MS;
    const next = Math.min(this.positions.length - 1, gateIndex + 1);
    const travel = THREE.MathUtils.smoothstep(shotProgress, .24, 1);
    camera.position.copy(this.positions[gateIndex]!).lerp(this.positions[next]!, travel);
    this.target.copy(this.targets[gateIndex]!).lerp(this.targets[next]!, travel);
    const handoff = THREE.MathUtils.smoothstep(elapsed - this.positions.length * SHOT_MS, 0, HANDOFF_MS);
    camera.position.lerp(chasePosition, handoff);
    this.target.lerp(chaseTarget, handoff);
    camera.lookAt(this.target);
    camera.fov = THREE.MathUtils.lerp(55, chaseFov, handoff);
    camera.updateProjectionMatrix();
    return true;
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onGate(null);
    this.element.parentElement?.classList.remove('mission-gate-intro-active');
    this.element.remove();
  }

  private showGate(index: number): void {
    if (this.shownGate === index) return;
    this.shownGate = index;
    this.progressElement.textContent = `GATE ${index + 1} / ${this.positions.length}`;
    this.onGate(index);
  }
}
