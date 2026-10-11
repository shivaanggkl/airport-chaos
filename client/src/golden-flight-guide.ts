import * as THREE from 'three';
import { journeyDallas04, journeyGatePlane } from '../../shared/journey-mission.mjs';
import { projectGateCrossing } from './golden-flight-guide-math';

/** Mission 4-only visual aid. It never affects controls or accepted crossings. */
export class GoldenFlightGuide {
  private readonly points = new Float32Array(33 * 3);
  private readonly pathGeometry = new THREE.BufferGeometry();
  private readonly pathMaterial = new THREE.LineBasicMaterial({ color: 0x8eefff, transparent: true, opacity: .55,
    blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly path: THREE.Line;
  private readonly markerMaterial = new THREE.MeshBasicMaterial({ color: 0x84f7ff, transparent: true, opacity: .78, depthWrite: false, depthTest: false });
  private readonly markerGeometry = new THREE.TorusGeometry(1, .17, 6, 16);
  private readonly marker: THREE.Mesh;
  private readonly gatePosition = new THREE.Vector3();
  private readonly guideTarget = new THREE.Vector3();
  private readonly approach = new THREE.Vector3();
  private readonly direct = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly controlA = new THREE.Vector3();
  private readonly controlB = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly markerTarget = new THREE.Vector3();
  private readonly normal = { x: 0, z: 0 };
  private readonly facing = new THREE.Vector3(0, 0, 1);
  private index = 0;
  private visible = true;
  private elapsed = 0;

  constructor(private readonly scene: THREE.Scene, private readonly heightAt: (x: number, z: number) => number) {
    this.pathGeometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
    this.path = new THREE.Line(this.pathGeometry, this.pathMaterial);
    this.path.frustumCulled = false;
    this.path.name = 'mission-04-flight-guide';
    this.marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    this.marker.name = 'mission-04-crossing-prediction';
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    scene.add(this.path, this.marker);
  }

  setGate(index: number, active: boolean): void {
    this.index = index;
    this.visible = active && index < journeyDallas04.gates.length;
    this.path.visible = this.visible;
    this.marker.visible = false;
    this.elapsed = Infinity;
  }

  update(delta: number, position: THREE.Vector3, velocity: THREE.Vector3): void {
    if (!this.visible) return;
    this.elapsed += delta;
    if (this.elapsed < .08) return;
    this.elapsed = 0;
    const gate = journeyDallas04.gates[this.index]!;
    const plane = journeyGatePlane(journeyDallas04, this.index);
    if (!plane) return;
    this.normal.x = plane.normalX;
    this.normal.z = plane.normalZ;
    this.gatePosition.set(gate.x, this.heightAt(gate.x, gate.z) + gate.altitude, gate.z);
    this.path.visible = position.y - this.heightAt(position.x, position.z) > 550;
    this.tangent.set(plane.normalX, 0, plane.normalZ);
    const passedPlane = (position.x - gate.x) * plane.normalX + (position.z - gate.z) * plane.normalZ >= 0;
    this.guideTarget.copy(this.gatePosition);
    if (passedPlane) this.guideTarget.addScaledVector(this.tangent, -Math.max(900, gate.radius * 3));
    const distance = position.distanceTo(this.guideTarget);
    const bend = Math.min(1500, distance * .22);
    this.direct.copy(this.guideTarget).sub(position).setY(0);
    if (this.direct.lengthSq() < 1) this.direct.copy(this.tangent);
    else this.direct.normalize();
    this.approach.copy(velocity).setY(0);
    if (this.approach.lengthSq() < 100) this.approach.copy(this.direct);
    else {
      this.approach.normalize();
      if (this.approach.dot(this.direct) < .5) this.approach.copy(this.direct);
      else this.approach.add(this.direct).normalize();
    }
    this.controlA.copy(position).addScaledVector(this.approach, bend);
    this.controlA.y += (this.guideTarget.y - position.y) * .25;
    this.controlB.copy(this.guideTarget).addScaledVector(passedPlane ? this.direct : this.tangent, -bend);
    const p = this.pathGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= 32; i += 1) {
      const t = i / 32, q = 1 - t;
      this.point.copy(position).multiplyScalar(q * q * q)
        .addScaledVector(this.controlA, 3 * q * q * t)
        .addScaledVector(this.controlB, 3 * q * t * t)
        .addScaledVector(this.guideTarget, t * t * t);
      p.setXYZ(i, this.point.x, this.point.y, this.point.z);
    }
    p.needsUpdate = true;
    this.pathGeometry.computeBoundingSphere();
    const prediction = projectGateCrossing(position, velocity, this.gatePosition, this.normal, gate.radius);
    if (!prediction) { this.marker.visible = false; return; }
    const cap = gate.radius * 1.22 / Math.max(gate.radius * 1.22, Math.hypot(prediction.lateral, prediction.vertical));
    this.markerTarget.set(this.gatePosition.x - plane.normalZ * prediction.lateral * cap - plane.normalX * 8,
      this.gatePosition.y + prediction.vertical * cap,
      this.gatePosition.z + plane.normalX * prediction.lateral * cap - plane.normalZ * 8);
    if (this.marker.visible) this.marker.position.lerp(this.markerTarget, .55);
    else this.marker.position.copy(this.markerTarget);
    this.marker.quaternion.setFromUnitVectors(this.facing, this.tangent);
    this.marker.scale.setScalar(Math.max(9, gate.radius * .072));
    this.markerMaterial.color.setHex(prediction.state === 'MISS' ? 0x71b9e0 : prediction.state === 'EDGE' ? 0x9de8f5 : 0x84f7ff);
    this.markerMaterial.opacity = prediction.state === 'MISS' ? .58 : .82;
    this.marker.visible = true;
  }

  dispose(): void {
    this.scene.remove(this.path, this.marker);
    this.pathGeometry.dispose();
    this.pathMaterial.dispose();
    this.markerGeometry.dispose();
    this.markerMaterial.dispose();
  }
}
