import * as THREE from 'three';
import { journeyDallas04, journeyGatePlane } from '../../shared/journey-mission.mjs';

const SEGMENTS = 24;

/** Mission 4 presentation only. The server still validates every gate crossing. */
export class GoldenFlightPath {
  private readonly ribbonPositions = new Float32Array((SEGMENTS + 1) * 6);
  private readonly centerPositions = new Float32Array((SEGMENTS + 1) * 3);
  private readonly ribbonGeometry = new THREE.BufferGeometry();
  private readonly centerGeometry = new THREE.BufferGeometry();
  private readonly ribbonMaterial = new THREE.MeshBasicMaterial({ color: 0x14bff3, transparent: true,
    opacity: .52, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  private readonly centerMaterial = new THREE.LineBasicMaterial({ color: 0xa4f6ff, transparent: true,
    opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  private readonly ribbon: THREE.Mesh;
  private readonly center: THREE.Line;
  private readonly group = new THREE.Group();
  private readonly gatePosition = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly direct = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly approach = new THREE.Vector3();
  private readonly controlA = new THREE.Vector3();
  private readonly controlB = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly derivativeA = new THREE.Vector3();
  private readonly derivativeB = new THREE.Vector3();
  private readonly derivativeC = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  private gateIndex = 0;
  private elapsed = Infinity;

  constructor(private readonly scene: THREE.Scene, private readonly heightAt: (x: number, z: number) => number) {
    const triangles: number[] = [];
    for (let i = 0; i < SEGMENTS; i += 1) triangles.push(2 * i, 2 * i + 1, 2 * i + 2,
      2 * i + 1, 2 * i + 3, 2 * i + 2);
    this.ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(this.ribbonPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.ribbonGeometry.setIndex(triangles);
    this.centerGeometry.setAttribute('position', new THREE.BufferAttribute(this.centerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.ribbon = new THREE.Mesh(this.ribbonGeometry, this.ribbonMaterial);
    this.center = new THREE.Line(this.centerGeometry, this.centerMaterial);
    this.ribbon.frustumCulled = false;
    this.center.frustumCulled = false;
    this.group.name = 'mission-04-blue-pathway';
    this.group.add(this.ribbon, this.center);
    this.group.visible = false;
    scene.add(this.group);
  }

  setGate(index: number, active: boolean): void {
    this.gateIndex = index;
    this.group.visible = active && index < journeyDallas04.gates.length;
    this.elapsed = Infinity;
  }

  update(delta: number, position: THREE.Vector3, velocity: THREE.Vector3, camera: THREE.Camera): void {
    if (!this.group.visible) return;
    this.elapsed += delta;
    if (this.elapsed < .08) return;
    this.elapsed = 0;
    const gate = journeyDallas04.gates[this.gateIndex];
    const plane = journeyGatePlane(journeyDallas04, this.gateIndex);
    if (!gate || !plane || !Number.isFinite(position.x + position.y + position.z)) return;
    this.normal.set(plane.normalX, 0, plane.normalZ);
    this.gatePosition.set(gate.x, this.heightAt(gate.x, gate.z) + gate.altitude, gate.z);
    const passedPlane = (position.x - gate.x) * plane.normalX + (position.z - gate.z) * plane.normalZ >= 0;
    this.target.copy(this.gatePosition);
    if (passedPlane) this.target.addScaledVector(this.normal,
      -Math.max(900, gate.radius * 3));
    const distance = position.distanceTo(this.target);
    const bend = Math.min(1_200, distance * .18);
    this.direct.copy(this.target).sub(position).setY(0);
    if (this.direct.lengthSq() < 1) this.direct.copy(this.normal);
    else this.direct.normalize();
    this.approach.copy(velocity).setY(0);
    if (this.approach.lengthSq() < 100) this.approach.copy(this.direct);
    else {
      this.approach.normalize();
      if (this.approach.dot(this.direct) < .5) this.approach.copy(this.direct);
      else this.approach.add(this.direct).normalize();
    }
    this.start.copy(position).addScaledVector(this.approach, -5);
    this.start.y -= 3;
    this.controlA.copy(this.start).addScaledVector(this.approach, bend);
    this.controlA.y += (this.target.y - this.start.y) * .25;
    this.controlB.copy(this.target).addScaledVector(passedPlane ? this.direct : this.normal, -bend);
    this.derivativeA.copy(this.controlA).sub(this.start);
    this.derivativeB.copy(this.controlB).sub(this.controlA);
    this.derivativeC.copy(this.target).sub(this.controlB);
    this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const maxWidth = Math.min(230, Math.max(145, distance * .08));
    const visualDrop = Math.min(240, Math.max(140, distance * .12));
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const t = i / SEGMENTS, q = 1 - t;
      this.point.copy(this.start).multiplyScalar(q * q * q)
        .addScaledVector(this.controlA, 3 * q * q * t)
        .addScaledVector(this.controlB, 3 * q * t * t)
        .addScaledVector(this.target, t * t * t);
      // Keep the guide below the flight corridor so it reads as a path from the chase camera.
      // It rises to the actual gate center and never asks the player to fly below the terrain.
      this.point.y = Math.max(this.point.y - visualDrop * Math.sin(Math.PI * t) ** 2,
        this.heightAt(this.point.x, this.point.z) + 70);
      const dx = 3 * q * q * this.derivativeA.x + 6 * q * t * this.derivativeB.x + 3 * t * t * this.derivativeC.x;
      const dy = 3 * q * q * this.derivativeA.y + 6 * q * t * this.derivativeB.y + 3 * t * t * this.derivativeC.y;
      const dz = 3 * q * q * this.derivativeA.z + 6 * q * t * this.derivativeB.z + 3 * t * t * this.derivativeC.z;
      const tangentLength = Math.hypot(dx, dy, dz) || 1;
      const along = (this.cameraRight.x * dx + this.cameraRight.y * dy + this.cameraRight.z * dz) / tangentLength;
      const lateralX = this.cameraRight.x - dx / tangentLength * along;
      const lateralY = this.cameraRight.y - dy / tangentLength * along;
      const lateralZ = this.cameraRight.z - dz / tangentLength * along;
      const lateralLength = Math.hypot(lateralX, lateralY, lateralZ) || 1;
      const halfWidth = Math.min(maxWidth, this.point.distanceTo(camera.position) * .25)
        * (1 - t) * Math.min(1, t * 10) * .5;
      const edge = i * 6, center = i * 3;
      this.ribbonPositions[edge] = this.point.x + lateralX / lateralLength * halfWidth;
      this.ribbonPositions[edge + 1] = this.point.y + lateralY / lateralLength * halfWidth;
      this.ribbonPositions[edge + 2] = this.point.z + lateralZ / lateralLength * halfWidth;
      this.ribbonPositions[edge + 3] = this.point.x - lateralX / lateralLength * halfWidth;
      this.ribbonPositions[edge + 4] = this.point.y - lateralY / lateralLength * halfWidth;
      this.ribbonPositions[edge + 5] = this.point.z - lateralZ / lateralLength * halfWidth;
      this.centerPositions[center] = this.point.x;
      this.centerPositions[center + 1] = this.point.y + .5;
      this.centerPositions[center + 2] = this.point.z;
    }
    this.ribbonGeometry.attributes.position!.needsUpdate = true;
    this.centerGeometry.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.ribbonGeometry.dispose();
    this.centerGeometry.dispose();
    this.ribbonMaterial.dispose();
    this.centerMaterial.dispose();
  }
}
