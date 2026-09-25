import * as THREE from 'three';
import { createRingSponsor, type RingSponsorship } from './ad-placement';

export type SkyChallengeType =
  | 'speed'
  | 'precision'
  | 'inverted'
  | 'lowAltitude'
  | 'dive'
  | 'climb'
  | 'corkscrew'
  | 'flyby';

export type SkyChallengeGate = {
  x: number;
  z: number;
  altitude: number;
  radius: number;
  maxAltitude?: number;
  minDescentRate?: number;
  inverted?: boolean;
};

export type SkyChallengeDefinition = {
  id: string;
  name: string;
  type: SkyChallengeType;
  gates: readonly SkyChallengeGate[];
  reward: number;
  timeLimit: number;
  requiredAircraftType?: 'trainer' | 'privateJet' | 'cargo' | 'fighter';
  sponsor?: RingSponsorship;
};

export type SkyChallengeMarker = {
  id: string;
  label: string;
  x: number;
  z: number;
  active: boolean;
};

export type SkyChallengeHud = {
  name: string;
  gate: number;
  total: number;
  combo: number;
  timeRemaining: number;
} | null;

type ChallengeCallbacks = {
  onScore: (points: number) => void;
  onCredits: (credits: number) => void;
  onMessage: (message: string) => void;
  onStateChange: () => void;
  onStarted?: (id: string) => void;
  onGate?: (id: string, gateIndex: number) => void;
  onComplete?: (id: string) => void;
};

type ChallengeRuntime = {
  definition: SkyChallengeDefinition;
  gates: THREE.Mesh[];
};

type ActiveChallenge = {
  runtime: ChallengeRuntime;
  gateIndex: number;
  combo: number;
  elapsed: number;
};

const gateGeometry = new THREE.TorusGeometry(1, 0.075, 8, 32);
const inactiveMaterial = new THREE.MeshBasicMaterial({ color: 0x62bcd4, transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false });
const activeMaterial = new THREE.MeshBasicMaterial({ color: 0x5ae2ff, transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false });
const completedMaterial = new THREE.MeshBasicMaterial({ color: 0x78a9b4, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
const startVisibilityDistance = 3_800;
const normalizedAngle = (angle: number): number => THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;

function gateReward(type: SkyChallengeType): number {
  switch (type) {
    case 'precision': return 250;
    case 'inverted': return 300;
    case 'lowAltitude': return 200;
    case 'dive': return 250;
    case 'climb': return 250;
    case 'corkscrew': return 300;
    case 'flyby': return 200;
    default: return 100;
  }
}

function typeLabel(type: SkyChallengeType): string {
  return ({
    speed: 'SPEED RUN', precision: 'PRECISION RUN', inverted: 'INVERTED RUN', lowAltitude: 'LOW ALTITUDE RUN',
    dive: 'DIVE RUN', climb: 'CLIMB RUN', corkscrew: 'CORKSCREW', flyby: 'LANDMARK FLYBY',
  })[type];
}

export class SkyChallengeSystem {
  private readonly runtimes: ChallengeRuntime[];
  private active: ActiveChallenge | null = null;
  private missionGuidance: { id: string; gateIndex: number } | null = null;
  private availabilityElapsed = 0;
  private nearbyStart: ChallengeRuntime | null = null;
  private readonly previousPosition = new THREE.Vector3();
  private readonly segment = new THREE.Vector3();
  private readonly gateCenter = new THREE.Vector3();
  private readonly gateOffset = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();
  private hasPreviousPosition = false;

  constructor(
    private readonly scene: THREE.Scene,
    definitions: readonly SkyChallengeDefinition[],
    private readonly heightAt: (x: number, z: number) => number,
    private readonly callbacks: ChallengeCallbacks,
  ) {
    this.runtimes = definitions.map((definition) => this.createRuntime(definition));
  }

  update(delta: number, position: THREE.Vector3, roll: number, altitude: number, verticalSpeed: number): void {
    if (!this.active) {
      this.availabilityElapsed += delta;
      if (this.availabilityElapsed >= 0.35) {
        this.availabilityElapsed = 0;
        this.updateNearbyStart(position);
      }
      const startGate = this.nearbyStart?.definition.gates[0];
      const crossedStart = Boolean(startGate && (
        this.distanceToGate(position, startGate) <= startGate.radius ||
        (this.hasPreviousPosition && this.segmentDistanceToGate(this.previousPosition, position, startGate) <= startGate.radius)
      ));
      if (this.nearbyStart && crossedStart) {
        this.activate(this.nearbyStart.definition.id);
      }
      this.previousPosition.copy(position);
      this.hasPreviousPosition = true;
      return;
    }

    const active = this.active;
    active.elapsed += delta;
    this.pulseActiveGate(active);
    const definition = active.runtime.definition;
    if (active.elapsed > definition.timeLimit) {
      this.fail('TIME EXPIRED');
      return;
    }
    const gate = definition.gates[active.gateIndex];
    const distance = this.distanceToGate(position, gate);
    if (distance > 12_000) {
      this.fail('LEFT ROUTE');
      return;
    }
    if (gate.maxAltitude !== undefined && distance < Math.max(280, gate.radius * 2) && altitude > gate.maxAltitude) {
      this.fail('ALTITUDE LIMIT');
      return;
    }
    const crossed = distance <= gate.radius || (this.hasPreviousPosition && this.segmentDistanceToGate(this.previousPosition, position, gate) <= gate.radius);
    this.previousPosition.copy(position);
    this.hasPreviousPosition = true;
    if (!crossed) return;
    if (gate.inverted && Math.abs(Math.abs(normalizedAngle(roll)) - Math.PI) > 0.72) {
      this.fail('INVERTED REQUIRED');
      return;
    }
    if (gate.minDescentRate !== undefined && verticalSpeed > gate.minDescentRate) {
      this.fail('DIVE REQUIRED');
      return;
    }
    this.passGate();
  }

  activate(id: string): boolean {
    if (this.active) return this.active.runtime.definition.id === id;
    const runtime = this.runtimes.find((candidate) => candidate.definition.id === id);
    if (!runtime) return false;
    this.active = { runtime, gateIndex: 0, combo: 1, elapsed: 0 };
    this.hasPreviousPosition = false;
    this.callbacks.onStarted?.(id);
    this.nearbyStart = null;
    this.refreshGateVisuals();
    this.callbacks.onMessage(`${typeLabel(runtime.definition.type)} STARTED`);
    this.callbacks.onStateChange();
    return true;
  }

  fail(reason: string): void {
    if (!this.active) return;
    const title = typeLabel(this.active.runtime.definition.type);
    this.active = null;
    this.refreshGateVisuals();
    this.callbacks.onMessage(`${title} FAILED · ${reason}`);
    this.callbacks.onStateChange();
  }

  cancel(): void {
    this.fail('ABANDONED');
  }

  setMissionGuidance(id?: string, gateIndex = 0): void {
    const next = id ? { id, gateIndex: Math.max(0, Math.floor(gateIndex)) } : null;
    if (this.missionGuidance?.id === next?.id && this.missionGuidance?.gateIndex === next?.gateIndex) return;
    this.missionGuidance = next;
    this.refreshGateVisuals();
  }

  getHud(): SkyChallengeHud {
    if (!this.active) return null;
    const { definition } = this.active.runtime;
    return {
      name: typeLabel(definition.type),
      gate: this.active.gateIndex + 1,
      total: definition.gates.length,
      combo: this.active.combo,
      timeRemaining: Math.max(0, definition.timeLimit - this.active.elapsed),
    };
  }

  getMapMarkers(): readonly SkyChallengeMarker[] {
    return this.runtimes.flatMap((runtime) => {
      const active = runtime === this.active?.runtime;
      const guided = this.missionGuidance?.id === runtime.definition.id;
      if (guided) return runtime.definition.gates.map((gate, index) => ({
        id: runtime.definition.id,
        label: index === this.missionGuidance!.gateIndex ? `NEXT GATE ${index + 1}` : `GATE ${index + 1}`,
        x: gate.x,
        z: gate.z,
        active: index === this.missionGuidance!.gateIndex,
      }));
      const gate = active ? runtime.definition.gates[this.active!.gateIndex] : runtime.definition.gates[0];
      return [{ id: runtime.definition.id, label: runtime.definition.name, x: gate.x, z: gate.z, active }];
    });
  }

  getRadarMarker(position: THREE.Vector3): SkyChallengeMarker | null {
    if (this.active) {
      const gate = this.active.runtime.definition.gates[this.active.gateIndex];
      return { id: this.active.runtime.definition.id, label: this.active.runtime.definition.name, x: gate.x, z: gate.z, active: true };
    }
    if (this.missionGuidance) {
      const runtime = this.runtimes.find((candidate) => candidate.definition.id === this.missionGuidance!.id);
      const gate = runtime?.definition.gates[Math.min(runtime.definition.gates.length - 1, this.missionGuidance.gateIndex)];
      if (runtime && gate) return { id: runtime.definition.id, label: `NEXT GATE ${this.missionGuidance.gateIndex + 1}`, x: gate.x, z: gate.z, active: true };
    }
    if (!this.nearbyStart) return null;
    const gate = this.nearbyStart.definition.gates[0];
    if (this.distanceToGate(position, gate) > 3_000) return null;
    return { id: this.nearbyStart.definition.id, label: this.nearbyStart.definition.name, x: gate.x, z: gate.z, active: false };
  }

  getStats(): { gates: number; active: boolean } {
    return { gates: this.runtimes.reduce((count, runtime) => count + runtime.gates.length, 0), active: this.active !== null };
  }

  dispose(): void {
    for (const runtime of this.runtimes) for (const gate of runtime.gates) {
      this.scene.remove(gate);
      (gate.material as THREE.Material).dispose();
    }
  }

  private createRuntime(definition: SkyChallengeDefinition): ChallengeRuntime {
    const gates = definition.gates.map((gate, index) => {
      const mesh = new THREE.Mesh(gateGeometry, inactiveMaterial.clone());
      mesh.name = `sky-challenge-${definition.id}-${index}`;
      mesh.scale.setScalar(gate.radius);
      mesh.position.set(gate.x, this.heightAt(gate.x, gate.z) + gate.altitude, gate.z);
      if (definition.sponsor) mesh.add(createRingSponsor(definition.sponsor, 1));
      const next = definition.gates[index + 1];
      if (next) mesh.lookAt(next.x, this.heightAt(next.x, next.z) + next.altitude, next.z);
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    });
    return { definition, gates };
  }

  private updateNearbyStart(position: THREE.Vector3): void {
    let closest: ChallengeRuntime | null = null;
    let closestDistance = startVisibilityDistance;
    for (const runtime of this.runtimes) {
      const distance = this.distanceToGate(position, runtime.definition.gates[0]);
      if (distance < closestDistance) {
        closest = runtime;
        closestDistance = distance;
      }
    }
    if (closest !== this.nearbyStart) {
      this.nearbyStart = closest;
      this.refreshGateVisuals();
      this.callbacks.onStateChange();
    }
  }

  private passGate(): void {
    const active = this.active;
    if (!active) return;
    const definition = active.runtime.definition;
    this.callbacks.onGate?.(definition.id, active.gateIndex);
    const points = gateReward(definition.type) * active.combo;
    this.callbacks.onScore(points);
    const skill = definition.type === 'inverted' ? 'INVERTED' : definition.type === 'lowAltitude' ? 'LOW PASS' : typeLabel(definition.type);
    this.callbacks.onMessage(`${skill} +${points}${active.combo > 1 ? ` · COMBO x${active.combo}` : ''}`);
    active.gateIndex += 1;
    active.combo = Math.min(5, active.combo + 1);
    if (active.gateIndex < definition.gates.length) {
      this.refreshGateVisuals();
      this.callbacks.onStateChange();
      return;
    }
    const finishBonus = Math.max(0, Math.round((definition.timeLimit - active.elapsed) * 12));
    const totalReward = definition.reward + finishBonus;
    this.callbacks.onCredits(totalReward);
    this.callbacks.onComplete?.(definition.id);
    this.callbacks.onMessage(`${typeLabel(definition.type)} COMPLETE +${totalReward} CREDITS`);
    this.active = null;
    this.refreshGateVisuals();
    this.callbacks.onStateChange();
  }

  private refreshGateVisuals(): void {
    for (const runtime of this.runtimes) {
      for (let index = 0; index < runtime.gates.length; index += 1) {
        runtime.gates[index].visible = false;
        runtime.gates[index].scale.setScalar(runtime.definition.gates[index].radius);
      }
    }
    if (this.active) {
      const { gates } = this.active.runtime;
      if (this.missionGuidance?.id === this.active.runtime.definition.id) {
        for (let index = 0; index < gates.length; index += 1) {
          gates[index].visible = true;
          (gates[index].material as THREE.MeshBasicMaterial).copy(index < this.active.gateIndex
            ? completedMaterial : index === this.active.gateIndex ? activeMaterial : inactiveMaterial);
        }
        return;
      }
      const current = gates[this.active.gateIndex];
      current.visible = true;
      (current.material as THREE.MeshBasicMaterial).copy(activeMaterial);
      const next = gates[this.active.gateIndex + 1];
      if (next) {
        next.visible = true;
        (next.material as THREE.MeshBasicMaterial).copy(inactiveMaterial);
      }
      return;
    }
    if (this.missionGuidance) {
      const runtime = this.runtimes.find((candidate) => candidate.definition.id === this.missionGuidance!.id);
      if (runtime) for (let index = 0; index < runtime.gates.length; index += 1) {
        runtime.gates[index].visible = true;
        (runtime.gates[index].material as THREE.MeshBasicMaterial).copy(index < this.missionGuidance.gateIndex
          ? completedMaterial : index === this.missionGuidance.gateIndex ? activeMaterial : inactiveMaterial);
      }
      return;
    }
    if (this.nearbyStart) {
      const start = this.nearbyStart.gates[0];
      start.visible = true;
      (start.material as THREE.MeshBasicMaterial).copy(inactiveMaterial);
    }
  }

  private pulseActiveGate(active: ActiveChallenge): void {
    const gate = active.runtime.gates[active.gateIndex];
    const definition = active.runtime.definition.gates[active.gateIndex];
    if (!gate || !definition) return;
    gate.scale.setScalar(definition.radius * (1 + Math.sin(active.elapsed * 7) * 0.055));
  }

  private distanceToGate(position: THREE.Vector3, gate: SkyChallengeGate): number {
    const y = this.heightAt(gate.x, gate.z) + gate.altitude;
    return Math.hypot(position.x - gate.x, position.y - y, position.z - gate.z);
  }

  private segmentDistanceToGate(from: THREE.Vector3, to: THREE.Vector3, gate: SkyChallengeGate): number {
    this.gateCenter.set(gate.x, this.heightAt(gate.x, gate.z) + gate.altitude, gate.z);
    this.segment.subVectors(to, from);
    const lengthSquared = this.segment.lengthSq();
    if (lengthSquared <= 0.0001) return from.distanceTo(this.gateCenter);
    const t = THREE.MathUtils.clamp(this.gateOffset.subVectors(this.gateCenter, from).dot(this.segment) / lengthSquared, 0, 1);
    return this.closestPoint.copy(from).addScaledVector(this.segment, t).distanceTo(this.gateCenter);
  }
}
