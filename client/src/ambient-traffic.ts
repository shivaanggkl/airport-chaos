import * as THREE from 'three';
import { attachAircraftAsset, type AircraftAssetType } from './assets';
import type { EntityType, EventCombatMode } from './entity-types';

export type AmbientTrafficKind = 'civilian' | 'privateJet' | 'cargo' | 'helicopter' | 'highAltitude';
export type AmbientTrafficWaypoint = { x: number; z: number; altitude: number };
export type AmbientTrafficRoute = {
  id: string;
  kind: AmbientTrafficKind;
  aircraftType?: AircraftAssetType;
  speed: number;
  points: ReadonlyArray<AmbientTrafficWaypoint>;
  phase?: number;
  eventEligible?: boolean;
  entityType?: Extract<EntityType, 'ambient' | 'event'>;
  eventCombatMode?: EventCombatMode;
};
export type AmbientCloud = { x: number; z: number; altitude: number; width: number; depth: number };
export type AtmosphereZoneType = 'storm' | 'wind' | 'thermal';
export type AtmosphereZone = {
  id: string;
  type: AtmosphereZoneType;
  x: number;
  z: number;
  radius: number;
  altitude: number;
  strength: number;
  active: boolean;
};
export type AmbientTrafficConfig = {
  routes: ReadonlyArray<AmbientTrafficRoute>;
  clouds?: ReadonlyArray<AmbientCloud>;
  atmosphereZones?: ReadonlyArray<AtmosphereZone>;
};
export type EventTrafficVisualState = {
  routeId: string;
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
};

type CloudCluster = { group: THREE.Group; cloud: AmbientCloud; distance: number };
type StormCell = { zone: AtmosphereZone; group: THREE.Group; lightning: THREE.Line; distance: number };

type Actor = {
  route: AmbientTrafficRoute;
  root: THREE.Group;
  detail: THREE.Group;
  silhouette: THREE.Mesh;
  silhouetteMaterial: THREE.MeshBasicMaterial;
  silhouetteBaseScale: THREE.Vector3;
  impostor: THREE.Sprite;
  impostorMaterial: THREE.SpriteMaterial;
  rotor?: THREE.Object3D;
  contrail?: THREE.Group;
  eventMarker?: THREE.Sprite;
  segment: number;
  segmentProgress: number;
  previousPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  previousQuaternion: THREE.Quaternion;
  targetQuaternion: THREE.Quaternion;
  pointA: THREE.Vector3;
  pointB: THREE.Vector3;
  entityType: Extract<EntityType, 'ambient' | 'event'>;
  eventCombatMode?: EventCombatMode;
  detailVisible: boolean;
  silhouetteVisible: boolean;
  impostorVisible: boolean;
  serverControlled: boolean;
};

export type AmbientRadarEntity = {
  id: string;
  entityType: Extract<EntityType, 'ambient' | 'event'>;
  eventCombatMode?: EventCombatMode;
  x: number;
  z: number;
  distance: number;
};

const tickSeconds = 0.15;
const detailDistance = 4_200;
const helicopterDetailDistance = 5_500;
// Keep normal traffic perceptible through the requested 8–15 km range. The
// hysteresis below retires an outbound proxy at 15 km rather than popping it
// at the former 14 km edge.
const silhouetteDistance = 16_000;
const highAltitudeDistance = 34_000;
const visibilityHysteresis = 1_000;
const maxDetailedActors = 10;
const maxSilhouetteActors = 22;
const maxCloudClusters = 5;
const cloudPatternSpan = 30_000;
const midSilhouetteStart = 3_000;
const farImpostorStart = 7_500;
const farImpostorBlendEnd = 9_000;
const forward = new THREE.Vector3(0, 0, -1);
const direction = new THREE.Vector3();
const trafficBodyGeometry = new THREE.CapsuleGeometry(0.45, 2.8, 4, 8);
const trafficWingGeometry = new THREE.BoxGeometry(1, 1, 1);
const rotorGeometry = new THREE.BoxGeometry(1, 1, 1);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xd5dde1, roughness: 0.56 });
const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x506c79, roughness: 0.48 });
const helicopterMaterial = new THREE.MeshStandardMaterial({ color: 0x586f77, roughness: 0.62 });
const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0xd9e7e9, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });

function createSilhouetteGeometry(): THREE.BufferGeometry {
  // A recognizably winged top-down profile stays legible at distances where a
  // fully detailed GLB would be only a sub-pixel object.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.56, -0.16, 0, -0.12, -1, 0, 0.15,
    0, 0, -0.56, -1, 0, 0.15, -0.2, 0, 0.28,
    0, 0, -0.56, -0.2, 0, 0.28, 0, 0, 0.58,
    0, 0, -0.56, 0, 0, 0.58, 0.2, 0, 0.28,
    0, 0, -0.56, 0.2, 0, 0.28, 1, 0, 0.15,
    0, 0, -0.56, 1, 0, 0.15, 0.16, 0, -0.12,
  ], 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const silhouetteGeometry = createSilhouetteGeometry();

function createEventMarker(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffc05d';
  context.font = '700 17px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('◆ EVENT', 64, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  marker.position.set(0, 5, 0);
  marker.scale.set(9, 2.25, 1);
  marker.renderOrder = 4;
  return marker;
}

function softTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required for ambient sky textures.');
  draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const cloudTexture = softTexture(256, 256, (context) => {
  context.clearRect(0, 0, 256, 256);
  for (const [x, y, radius] of [[72, 144, 76], [124, 110, 92], [181, 137, 71], [111, 180, 69], [203, 183, 51]]) {
    const gradient = context.createRadialGradient(x, y, 4, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.60)');
    gradient.addColorStop(0.48, 'rgba(255,255,255,0.30)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
});
const contrailTexture = softTexture(512, 64, (context) => {
  const horizontal = context.createLinearGradient(0, 0, 512, 0);
  horizontal.addColorStop(0, 'rgba(255,255,255,0)');
  horizontal.addColorStop(0.1, 'rgba(255,255,255,0.08)');
  horizontal.addColorStop(0.42, 'rgba(255,255,255,0.38)');
  horizontal.addColorStop(0.72, 'rgba(255,255,255,0.26)');
  horizontal.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = horizontal;
  context.fillRect(0, 0, 512, 64);
  const vertical = context.createLinearGradient(0, 0, 0, 64);
  vertical.addColorStop(0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.32, 'rgba(255,255,255,0.72)');
  vertical.addColorStop(0.68, 'rgba(255,255,255,0.72)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = vertical;
  context.fillRect(0, 0, 512, 64);
});
const cloudMaterial = new THREE.SpriteMaterial({ map: cloudTexture, color: 0xf4fbff, transparent: true, opacity: 0.7, depthWrite: false });
const stormCloudMaterial = new THREE.SpriteMaterial({ map: cloudTexture, color: 0x425d70, transparent: true, opacity: 0.68, depthWrite: false });
const contrailMaterial = new THREE.MeshBasicMaterial({ map: contrailTexture, color: 0xf8fcff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const impostorTexture = softTexture(96, 64, (context) => {
  context.clearRect(0, 0, 96, 64);
  context.fillStyle = 'rgba(255,255,255,0.94)';
  context.beginPath();
  context.moveTo(48, 4);
  context.lineTo(55, 27);
  context.lineTo(90, 39);
  context.lineTo(90, 45);
  context.lineTo(55, 43);
  context.lineTo(52, 60);
  context.lineTo(44, 60);
  context.lineTo(41, 43);
  context.lineTo(6, 45);
  context.lineTo(6, 39);
  context.lineTo(41, 27);
  context.closePath();
  context.fill();
});
const ambientImpostorMaterial = new THREE.SpriteMaterial({ map: impostorTexture, color: 0xe8f4f6, transparent: true, opacity: 0, depthWrite: false });
const eventImpostorMaterial = new THREE.SpriteMaterial({ map: impostorTexture, color: 0xffc25d, transparent: true, opacity: 0, depthWrite: false });

function aircraftDimensions(type: AircraftAssetType | undefined): { length: number; span: number } {
  if (type === 'cargo') return { length: 8.9, span: 11.5 };
  if (type === 'privateJet') return { length: 9, span: 7.2 };
  if (type === 'fighter') return { length: 8.5, span: 6.8 };
  return { length: 6.6, span: 8.4 };
}

function createAirframe(type: AircraftAssetType | undefined): { detail: THREE.Group; silhouette: THREE.Mesh } {
  const dimensions = aircraftDimensions(type);
  const detail = new THREE.Group();
  const fallback = new THREE.Group();
  const body = new THREE.Mesh(trafficBodyGeometry, bodyMaterial);
  body.rotation.x = Math.PI / 2;
  body.scale.set(0.8, dimensions.length * 0.42, 0.8);
  fallback.add(body);
  const wing = new THREE.Mesh(trafficWingGeometry, wingMaterial);
  wing.scale.set(dimensions.span, 0.12, Math.max(0.8, dimensions.length * 0.16));
  fallback.add(wing);
  detail.add(fallback);
  if (type) attachAircraftAsset(detail, fallback, type, dimensions.length, dimensions.span);

  const silhouette = new THREE.Mesh(silhouetteGeometry, silhouetteMaterial);
  silhouette.scale.set(dimensions.span * 1.7, 1, dimensions.length * 1.7);
  silhouette.visible = false;
  return { detail, silhouette };
}

function createHelicopter(): { detail: THREE.Group; silhouette: THREE.Mesh; rotor: THREE.Object3D } {
  const detail = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 7), helicopterMaterial);
  body.scale.set(1.1, 0.72, 1.9);
  detail.add(body);
  const tail = new THREE.Mesh(trafficWingGeometry, helicopterMaterial);
  tail.scale.set(0.16, 0.18, 2.1);
  tail.position.z = 1.45;
  detail.add(tail);
  const rotor = new THREE.Mesh(rotorGeometry, silhouetteMaterial);
  rotor.scale.set(4.6, 0.04, 0.16);
  rotor.position.y = 0.82;
  detail.add(rotor);
  const silhouette = new THREE.Mesh(silhouetteGeometry, silhouetteMaterial);
  silhouette.scale.set(5.2, 1, 6.2);
  silhouette.visible = false;
  return { detail, silhouette, rotor };
}

export class AmbientTrafficSystem {
  private readonly actors: Actor[] = [];
  private readonly cloudGroup = new THREE.Group();
  private readonly cloudClusters: CloudCluster[] = [];
  private readonly stormCells: StormCell[] = [];
  private readonly eventRoutes: ReadonlyArray<AmbientTrafficRoute>;
  private readonly atmosphereZones: ReadonlyArray<AtmosphereZone>;
  private simulationAccumulator = 0;
  private elapsed = 0;

  constructor(
    private readonly scene: THREE.Scene,
    config: AmbientTrafficConfig,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    // Ordinary ambient routes are intentionally dormant. They remain in the
    // city config so future scripted Escort/Convoy/Emergency events can spawn
    // the same deterministic traffic without a second AI implementation.
    this.eventRoutes = config.routes;
    this.atmosphereZones = config.atmosphereZones ?? [];
    if (config.clouds?.length) this.addClouds(config.clouds);
    if (this.atmosphereZones.length) this.addAtmosphereZones(this.atmosphereZones);
  }

  update(delta: number, playerPosition: THREE.Vector3, camera: THREE.PerspectiveCamera): void {
    this.elapsed += delta;
    this.simulationAccumulator += delta;
    while (this.simulationAccumulator >= tickSeconds) {
      this.simulationAccumulator -= tickSeconds;
      for (const actor of this.actors) if (!actor.serverControlled) this.advance(actor, tickSeconds);
      this.updateLod(playerPosition, camera);
      this.updateClouds(playerPosition);
      this.updateAtmosphere(playerPosition);
    }
    const blend = this.simulationAccumulator / tickSeconds;
    for (const actor of this.actors) {
      actor.root.position.lerpVectors(actor.previousPosition, actor.targetPosition, blend);
      actor.root.quaternion.slerpQuaternions(actor.previousQuaternion, actor.targetQuaternion, blend);
      actor.root.visible = actor.detailVisible || actor.silhouetteVisible || actor.impostorVisible;
      actor.detail.visible = actor.detailVisible;
      actor.silhouette.visible = actor.silhouetteVisible;
      actor.impostor.visible = actor.impostorVisible;
      if (actor.eventMarker) actor.eventMarker.visible = actor.root.visible;
      if (actor.rotor && actor.detail.visible) actor.rotor.rotation.y += delta * 28;
    }
  }

  getRadarEntities(playerPosition: THREE.Vector3, maxDistance: number, limit = 3): AmbientRadarEntity[] {
    return this.actors
      .filter((actor) => actor.root.visible)
      .map((actor) => ({
        id: actor.route.id,
        entityType: actor.entityType,
        eventCombatMode: actor.eventCombatMode,
        x: actor.root.position.x,
        z: actor.root.position.z,
        distance: actor.root.position.distanceTo(playerPosition),
      }))
      .filter((entity) => entity.distance <= maxDistance)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit);
  }

  getEventEligibleTraffic(): ReadonlyArray<{ id: string; kind: AmbientTrafficKind }> {
    return this.eventRoutes
      .filter((route) => route.eventEligible)
      .map((route) => ({ id: route.id, kind: route.kind }));
  }

  getAtmosphereZones(): ReadonlyArray<AtmosphereZone> {
    return this.atmosphereZones;
  }

  getStats(): { actors: number; clouds: number; storms: number } {
    return { actors: this.actors.length, clouds: this.cloudClusters.length, storms: this.stormCells.length };
  }

  getAtmosphereAt(position: THREE.Vector3): AtmosphereZone | null {
    let closest: AtmosphereZone | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const zone of this.atmosphereZones) {
      if (!zone.active) continue;
      const distance = Math.hypot(position.x - zone.x, position.z - zone.z);
      if (distance <= zone.radius && distance < closestDistance) {
        closest = zone;
        closestDistance = distance;
      }
    }
    return closest;
  }

  activateEvent(routeId: string, eventCombatMode: EventCombatMode = 'noncombat'): boolean {
    if (this.actors.some((actor) => actor.route.id === routeId)) return true;
    const route = this.eventRoutes.find((candidate) => candidate.id === routeId);
    if (!route) return false;
    this.actors.push(this.createActor({ ...route, entityType: 'event', eventCombatMode }, this.actors.length));
    return true;
  }

  deactivateEvent(routeId: string): void {
    const index = this.actors.findIndex((actor) => actor.route.id === routeId);
    if (index < 0) return;
    const [actor] = this.actors.splice(index, 1);
    this.scene.remove(actor.root);
  }

  syncEventRoutes(states: readonly EventTrafficVisualState[]): void {
    const wanted = new Set(states.map((state) => state.routeId));
    for (const actor of [...this.actors]) {
      if (!wanted.has(actor.route.id)) this.deactivateEvent(actor.route.id);
    }
    for (const state of states) {
      this.activateEvent(state.routeId, 'noncombat');
      const actor = this.actors.find((candidate) => candidate.route.id === state.routeId);
      if (!actor) continue;
      const wasServerControlled = actor.serverControlled;
      actor.serverControlled = true;
      actor.previousPosition.copy(wasServerControlled ? actor.targetPosition : state.position);
      actor.targetPosition.set(state.position.x, state.position.y, state.position.z);
      direction.set(state.direction.x, state.direction.y, state.direction.z).normalize();
      actor.previousQuaternion.copy(actor.targetQuaternion);
      actor.targetQuaternion.setFromUnitVectors(forward, direction);
      if (!wasServerControlled) {
        actor.root.position.copy(actor.targetPosition);
        actor.root.quaternion.copy(actor.targetQuaternion);
        actor.previousQuaternion.copy(actor.targetQuaternion);
      }
    }
  }

  dispose(): void {
    for (const actor of this.actors) this.scene.remove(actor.root);
    this.scene.remove(this.cloudGroup);
    this.actors.length = 0;
  }

  private createActor(route: AmbientTrafficRoute, index: number): Actor {
    const visual: { detail: THREE.Group; silhouette: THREE.Mesh; rotor?: THREE.Object3D } = route.kind === 'helicopter'
      ? createHelicopter()
      : createAirframe(route.aircraftType);
    const root = new THREE.Group();
    root.name = `ambient-traffic-${route.id}`;
    if (route.kind === 'helicopter') root.scale.setScalar(1.55);
    const silhouetteMaterial = (visual.silhouette.material as THREE.MeshBasicMaterial).clone();
    silhouetteMaterial.opacity = 0;
    visual.silhouette.material = silhouetteMaterial;
    const impostorMaterial = (route.entityType === 'event' ? eventImpostorMaterial : ambientImpostorMaterial).clone();
    const impostor = new THREE.Sprite(impostorMaterial);
    impostor.visible = false;
    root.add(visual.detail, visual.silhouette, impostor);
    const eventMarker = route.entityType === 'event' ? createEventMarker() : undefined;
    if (eventMarker) root.add(eventMarker);
    let contrail: THREE.Group | undefined;
    if (route.kind === 'highAltitude') {
      contrail = this.createContrail();
      root.add(contrail);
    }
    const actor: Actor = {
      route,
      root,
      detail: visual.detail,
      silhouette: visual.silhouette,
      silhouetteMaterial,
      silhouetteBaseScale: visual.silhouette.scale.clone(),
      impostor,
      impostorMaterial,
      rotor: visual.rotor,
      contrail,
      eventMarker,
      segment: 0,
      segmentProgress: 0,
      previousPosition: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      previousQuaternion: new THREE.Quaternion(),
      targetQuaternion: new THREE.Quaternion(),
      pointA: new THREE.Vector3(),
      pointB: new THREE.Vector3(),
      entityType: route.entityType ?? 'ambient',
      eventCombatMode: route.eventCombatMode,
      detailVisible: false,
      silhouetteVisible: false,
      impostorVisible: false,
      serverControlled: false,
    };
    root.userData.entityType = actor.entityType;
    root.userData.eventCombatMode = actor.eventCombatMode ?? 'noncombat';
    const phase = THREE.MathUtils.euclideanModulo(route.phase ?? index * 0.23, 1);
    const routeSegments = Math.max(1, route.points.length);
    actor.segment = Math.floor(phase * routeSegments) % routeSegments;
    actor.segmentProgress = phase * routeSegments - Math.floor(phase * routeSegments);
    this.setSegmentPoints(actor);
    actor.targetPosition.lerpVectors(actor.pointA, actor.pointB, actor.segmentProgress);
    actor.previousPosition.copy(actor.targetPosition);
    direction.copy(actor.pointB).sub(actor.pointA).normalize();
    actor.targetQuaternion.setFromUnitVectors(forward, direction);
    actor.previousQuaternion.copy(actor.targetQuaternion);
    root.position.copy(actor.targetPosition);
    root.quaternion.copy(actor.targetQuaternion);
    this.scene.add(root);
    return actor;
  }

  private updateLod(playerPosition: THREE.Vector3, camera: THREE.PerspectiveCamera): void {
    const candidates = this.actors
      .map((actor) => ({ actor, distance: actor.targetPosition.distanceTo(playerPosition) }))
      .sort((left, right) => left.distance - right.distance);
    let detailed = 0;
    let silhouettes = 0;
    for (const { actor, distance } of candidates) {
      const isHighAltitude = actor.route.kind === 'highAltitude';
      const maxDistance = isHighAltitude ? highAltitudeDistance : silhouetteDistance;
      const rootLimit = maxDistance + (actor.detailVisible || actor.silhouetteVisible ? visibilityHysteresis : -visibilityHysteresis);
      const baseDetailDistance = actor.route.kind === 'helicopter' ? helicopterDetailDistance : detailDistance;
      const detailLimit = baseDetailDistance + (actor.detailVisible ? visibilityHysteresis * 0.45 : -visibilityHysteresis * 0.45);
      const canShow = distance <= rootLimit && silhouettes < maxSilhouetteActors;
      actor.detailVisible = !isHighAltitude && canShow && distance <= detailLimit && detailed < maxDetailedActors;
      const silhouetteEntryDistance = isHighAltitude ? 0 : midSilhouetteStart;
      const silhouetteFullDistance = isHighAltitude ? 1 : detailLimit;
      const silhouetteOpacity = canShow
        ? THREE.MathUtils.clamp(
          (distance - silhouetteEntryDistance) / Math.max(1, silhouetteFullDistance - silhouetteEntryDistance),
          0,
          1,
        ) * (1 - THREE.MathUtils.smoothstep(distance, farImpostorStart, farImpostorBlendEnd))
        : 0;
      const impostorOpacity = canShow
        ? THREE.MathUtils.smoothstep(distance, farImpostorStart, farImpostorBlendEnd)
        : 0;
      actor.silhouetteMaterial.opacity = silhouetteOpacity * 0.94;
      actor.impostorMaterial.opacity = impostorOpacity * (actor.entityType === 'event' ? 1 : 0.9);
      actor.silhouetteVisible = silhouetteOpacity > 0.015;
      actor.impostorVisible = impostorOpacity > 0.015;
      this.updateProxyScreenScale(actor, camera, distance);
      if (actor.detailVisible) detailed += 1;
      if (canShow) silhouettes += 1;
    }
  }

  private updateProxyScreenScale(actor: Actor, camera: THREE.PerspectiveCamera, distance: number): void {
    const viewportHeight = Math.max(1, window.innerHeight);
    const worldPerPixel = distance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / viewportHeight;
    const boost = actor.entityType === 'event' ? 1.2 : actor.route.kind === 'helicopter' ? 1.12 : 1;
    const targetPixels = (distance <= 8_000 ? 10 : 7.5) * boost;
    const targetWidth = THREE.MathUtils.clamp(worldPerPixel * targetPixels, 12, 150);
    const baseWidth = Math.max(1, actor.silhouetteBaseScale.x * 2);
    const silhouetteScale = THREE.MathUtils.clamp(targetWidth / baseWidth, 1, 9);
    actor.silhouette.scale.copy(actor.silhouetteBaseScale).multiplyScalar(silhouetteScale);
    actor.impostor.scale.set(targetWidth, targetWidth * 0.56, 1);
    if (actor.contrail) {
      const distanceFade = THREE.MathUtils.smoothstep(distance, 10_000, highAltitudeDistance);
      actor.contrail.scale.set(1 + distanceFade * 0.36, 1 + distanceFade * 0.14, 1);
    }
  }

  private advance(actor: Actor, delta: number): void {
    actor.previousPosition.copy(actor.targetPosition);
    actor.previousQuaternion.copy(actor.targetQuaternion);
    this.setSegmentPoints(actor);
    const segmentLength = Math.max(1, actor.pointA.distanceTo(actor.pointB));
    actor.segmentProgress += actor.route.speed * delta / segmentLength;
    while (actor.segmentProgress >= 1) {
      actor.segmentProgress -= 1;
      actor.segment = (actor.segment + 1) % actor.route.points.length;
      this.setSegmentPoints(actor);
    }
    actor.targetPosition.lerpVectors(actor.pointA, actor.pointB, actor.segmentProgress);
    direction.copy(actor.pointB).sub(actor.pointA).normalize();
    actor.targetQuaternion.setFromUnitVectors(forward, direction);
  }

  private setSegmentPoints(actor: Actor): void {
    const start = actor.route.points[actor.segment];
    const end = actor.route.points[(actor.segment + 1) % actor.route.points.length];
    actor.pointA.set(start.x, this.heightAt(start.x, start.z) + start.altitude, start.z);
    actor.pointB.set(end.x, this.heightAt(end.x, end.z) + end.altitude, end.z);
  }

  private createContrail(): THREE.Group {
    const contrail = new THREE.Group();
    contrail.name = 'ambient-soft-contrail';
    for (const [offset, width] of [[-12, 42], [12, 34]] as const) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contrailMaterial);
      // Local +Z is behind the aircraft because the shared aircraft forward axis is -Z.
      streak.rotation.y = Math.PI / 2;
      streak.position.set(offset, 0, 480);
      streak.scale.set(1_260, width, 1);
      contrail.add(streak);
    }
    return contrail;
  }

  private addClouds(clouds: ReadonlyArray<AmbientCloud>): void {
    for (let index = 0; index < clouds.length; index += 1) {
      const cloud = clouds[index];
      const cluster = new THREE.Group();
      cluster.name = `ambient-cloud-cluster-${index}`;
      cluster.position.set(cloud.x, this.heightAt(cloud.x, cloud.z) + cloud.altitude, cloud.z);
      for (const [offsetX, offsetY, offsetZ, scale] of [[0, 0, 0, 1], [-0.34, 0.08, 0.12, 0.68], [0.31, -0.05, -0.1, 0.76], [0.08, 0.18, 0.3, 0.58], [-0.12, -0.12, -0.32, 0.54], [0.42, 0.1, 0.24, 0.48]] as const) {
        const puff = new THREE.Sprite(cloudMaterial);
        puff.position.set(offsetX * cloud.width, offsetY * cloud.depth, offsetZ * cloud.depth);
        puff.scale.set(cloud.width * scale, cloud.depth * scale, 1);
        cluster.add(puff);
      }
      this.cloudGroup.add(cluster);
      this.cloudClusters.push({ group: cluster, cloud, distance: Number.POSITIVE_INFINITY });
    }
    this.scene.add(this.cloudGroup);
  }

  private addAtmosphereZones(zones: ReadonlyArray<AtmosphereZone>): void {
    for (const zone of zones) {
      if (!zone.active) continue;
      if (zone.type === 'storm') {
        const group = new THREE.Group();
        group.name = `atmosphere-storm-${zone.id}`;
        group.position.set(zone.x, this.heightAt(zone.x, zone.z) + zone.altitude, zone.z);
        for (const [x, y, z, scale] of [[0, 0, 0, 1], [-0.34, 0.08, 0.12, 0.72], [0.3, -0.04, -0.1, 0.82], [0.08, 0.2, 0.28, 0.66], [-0.1, -0.12, -0.28, 0.58]] as const) {
          const puff = new THREE.Sprite(stormCloudMaterial);
          puff.position.set(x * zone.radius, y * zone.radius * 0.45, z * zone.radius);
          puff.scale.set(zone.radius * scale * 1.35, zone.radius * scale * 0.76, 1);
          group.add(puff);
        }
        const lightningGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-26, 0, 0), new THREE.Vector3(12, -110, 14), new THREE.Vector3(-8, -210, -10), new THREE.Vector3(20, -310, 7),
        ]);
        const lightning = new THREE.Line(lightningGeometry, new THREE.LineBasicMaterial({ color: 0xd9f5ff, transparent: true, opacity: 0.9 }));
        lightning.visible = false;
        group.add(lightning);
        this.cloudGroup.add(group);
        this.stormCells.push({ zone, group, lightning, distance: Number.POSITIVE_INFINITY });
        continue;
      }
      if (zone.type === 'thermal') {
        const group = new THREE.Group();
        group.name = `atmosphere-thermal-${zone.id}`;
        group.position.set(zone.x, this.heightAt(zone.x, zone.z) + 24, zone.z);
        for (const [height, radius] of [[0, 65], [80, 48], [160, 30]] as const) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 1.1, 5, 24),
            new THREE.MeshBasicMaterial({ color: 0xffd476, transparent: true, opacity: 0.24, depthWrite: false }),
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = height;
          group.add(ring);
        }
        this.cloudGroup.add(group);
        // Thermal/wind zones share the metadata channel; they intentionally
        // do not create simulated aircraft or combat entities.
        this.stormCells.push({ zone, group, lightning: new THREE.Line(), distance: Number.POSITIVE_INFINITY });
      }
    }
  }

  private updateClouds(playerPosition: THREE.Vector3): void {
    const wrap = (value: number, center: number): number =>
      center + THREE.MathUtils.euclideanModulo(value - center + cloudPatternSpan * 0.5, cloudPatternSpan) - cloudPatternSpan * 0.5;
    for (const cluster of this.cloudClusters) {
      const x = wrap(cluster.cloud.x, playerPosition.x);
      const z = wrap(cluster.cloud.z, playerPosition.z);
      cluster.group.position.set(x, this.heightAt(x, z) + cluster.cloud.altitude, z);
      cluster.distance = Math.hypot(x - playerPosition.x, z - playerPosition.z);
    }
    this.cloudClusters.sort((left, right) => left.distance - right.distance);
    for (let index = 0; index < this.cloudClusters.length; index += 1) {
      this.cloudClusters[index].group.visible = index < maxCloudClusters && this.cloudClusters[index].distance <= 22_000;
    }
  }

  private updateAtmosphere(playerPosition: THREE.Vector3): void {
    for (const cell of this.stormCells) {
      cell.distance = Math.hypot(cell.zone.x - playerPosition.x, cell.zone.z - playerPosition.z);
      cell.group.visible = cell.distance <= 18_000;
      if (cell.zone.type !== 'storm') continue;
      // Deterministic, sparse flashes give a localized storm read without a
      // weather simulation or a per-frame random effect.
      const phase = (this.elapsed + cell.zone.id.length * 1.73) % 8.6;
      cell.lightning.visible = cell.group.visible && phase < 0.11;
    }
  }
}
