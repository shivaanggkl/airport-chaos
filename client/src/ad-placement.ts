import * as THREE from 'three';

export type AdPlacementType = 'BILLBOARD' | 'BUILDING_SCREEN' | 'AIRPORT_SIGN' | 'AIRCRAFT_LIVERY';
export type AdCreative = {
  reference: string;
  headline: string;
  subline?: string;
  background?: string;
  foreground?: string;
};
export type AdPlacement = {
  id: string;
  cityId: string;
  type: AdPlacementType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  creative: AdCreative;
  sponsorName: string;
  startAt: string;
  endAt: string;
  enabled: boolean;
  targetAircraftType?: 'trainer' | 'privateJet' | 'cargo' | 'fighter';
};

type PlacementMetrics = {
  impressions: number;
  totalVisibleSeconds: number;
  continuousVisibleSeconds: number;
  lastImpressionAt: number;
};

type RenderedPlacement = {
  placement: AdPlacement;
  group: THREE.Group;
  normal: THREE.Vector3;
  metrics: PlacementMetrics;
  maxDistance: number;
  panel: THREE.Mesh;
  farPanel: THREE.Mesh;
  projectedPixels: number;
};

type LiveryMetric = {
  placement: AdPlacement;
  metrics: PlacementMetrics;
  projectedPixels: number;
};

const panelGeometry = new THREE.PlaneGeometry(1, 1);
const supportGeometry = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map<string, THREE.MeshBasicMaterial>();
const farMaterialCache = new Map<string, THREE.MeshBasicMaterial>();
const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x30393d, roughness: 0.88 });
const placementPoint = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const worldNormal = new THREE.Vector3();
const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();

function isActive(placement: AdPlacement, now = Date.now()): boolean {
  return placement.enabled && now >= Date.parse(placement.startAt) && now <= Date.parse(placement.endAt);
}

function materialFor(creative: AdCreative): THREE.MeshBasicMaterial {
  const key = `${creative.reference}|${creative.headline}|${creative.subline ?? ''}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const context = canvas.getContext('2d')!;
  context.fillStyle = creative.background ?? '#061b29';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const brandColor = '#f0b84e';
  context.fillStyle = brandColor;
  context.fillRect(0, 0, 194, canvas.height);
  context.fillStyle = '#071723';
  context.font = '800 98px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(creative.reference.includes('vaden') ? 'V' : 'AD', 97, 160);
  context.fillStyle = creative.foreground ?? '#fff8eb';
  context.font = '800 68px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillText(creative.headline, 615, 136);
  if (creative.subline) {
    context.fillStyle = '#cce1e8';
    context.font = '600 34px Arial, sans-serif';
    context.fillText(creative.subline, 615, 193);
  }
  context.fillStyle = brandColor;
  context.fillRect(230, 238, 735, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
  materialCache.set(key, material);
  return material;
}

function farMaterialFor(creative: AdCreative): THREE.MeshBasicMaterial {
  const cached = farMaterialCache.get(creative.reference);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = creative.background ?? '#061b29';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f0b84e';
  context.fillRect(0, 0, 76, canvas.height);
  context.fillStyle = '#081722';
  context.font = '800 62px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(creative.reference.includes('vaden') ? 'V' : 'AD', 38, 64);
  context.fillStyle = '#fff8eb';
  context.font = '800 31px Arial, sans-serif';
  context.fillText(creative.reference.includes('vaden') ? 'VADEN' : 'AD SPACE', 169, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.98 });
  farMaterialCache.set(creative.reference, material);
  return material;
}

function maxVisibleDistance(type: AdPlacementType): number {
  if (type === 'BUILDING_SCREEN') return 5_400;
  if (type === 'AIRPORT_SIGN') return 3_400;
  return 4_800;
}

function buildPlacement(placement: AdPlacement, groundHeightAt?: (x: number, z: number) => number): RenderedPlacement {
  const group = new THREE.Group();
  group.name = `ad-placement-${placement.id}`;
  group.position.set(placement.position.x, placement.position.y, placement.position.z);
  group.rotation.set(placement.rotation.x, placement.rotation.y, placement.rotation.z);

  const lod = new THREE.LOD();
  const panel = new THREE.Mesh(panelGeometry, materialFor(placement.creative));
  panel.scale.set(placement.size.x, placement.size.y, 1);
  panel.renderOrder = 3;
  const farPanel = new THREE.Mesh(panelGeometry, farMaterialFor(placement.creative));
  farPanel.scale.set(placement.size.x * 1.04, placement.size.y * 1.04, 1);
  farPanel.renderOrder = 2;
  lod.addLevel(panel, 0);
  lod.addLevel(farPanel, Math.max(600, placement.size.x * 22));
  group.add(lod);

  if (placement.type === 'BILLBOARD' || placement.type === 'AIRPORT_SIGN') {
    const groundY = groundHeightAt?.(placement.position.x, placement.position.z) ?? 0;
    const clearance = Math.max(placement.position.y - placement.size.y * 0.5 - groundY, placement.type === 'AIRPORT_SIGN' ? 2.5 : 5);
    const postWidth = placement.type === 'AIRPORT_SIGN' ? 0.22 : 0.38;
    for (const offset of [-placement.size.x * 0.28, placement.size.x * 0.28]) {
      const post = new THREE.Mesh(supportGeometry, supportMaterial);
      post.scale.set(postWidth, clearance, postWidth);
      post.position.set(offset, -placement.size.y * 0.5 - clearance * 0.5, 0.08);
      group.add(post);
    }
  }

  return {
    placement,
    group,
    normal: new THREE.Vector3(0, 0, 1),
    metrics: { impressions: 0, totalVisibleSeconds: 0, continuousVisibleSeconds: 0, lastImpressionAt: -Infinity },
    maxDistance: maxVisibleDistance(placement.type),
    panel,
    farPanel,
    projectedPixels: 0,
  };
}

export function getAircraftLivery(
  cityId: string,
  placements: ReadonlyArray<AdPlacement>,
  aircraftType: AdPlacement['targetAircraftType'],
): AdPlacement | undefined {
  return placements.find((placement) =>
    placement.cityId === cityId &&
    placement.type === 'AIRCRAFT_LIVERY' &&
    placement.targetAircraftType === aircraftType &&
    isActive(placement),
  );
}

export function attachAircraftLivery(
  plane: THREE.Group,
  placement: AdPlacement | undefined,
  dimensions: { bodyLength: number; bodyRadius: number; wingSpan: number; tailSpan: number },
): void {
  if (!placement || plane.userData.adLiveryId === placement.id) return;
  const livery = new THREE.Group();
  livery.name = `aircraft-livery-${placement.id}`;
  const material = materialFor(placement.creative);
  const fuselageLength = dimensions.bodyLength * 0.86;
  const fuselageHeight = Math.max(0.62, dimensions.bodyRadius * 1.24);
  for (const side of [-1, 1]) {
    const fuselagePanel = new THREE.Mesh(panelGeometry, material);
    fuselagePanel.scale.set(fuselageLength, fuselageHeight, 1);
    fuselagePanel.rotation.y = side * Math.PI / 2;
    fuselagePanel.position.set(side * (dimensions.bodyRadius + 0.035), 0.03, -dimensions.bodyLength * 0.04);
    fuselagePanel.renderOrder = 4;
    livery.add(fuselagePanel);
  }
  const wingMark = new THREE.Mesh(panelGeometry, material);
  wingMark.scale.set(dimensions.wingSpan * 0.58, Math.max(0.72, dimensions.bodyLength * 0.28), 1);
  wingMark.rotation.x = -Math.PI / 2;
  wingMark.position.set(0, Math.max(0.12, dimensions.bodyRadius * 0.32), -dimensions.bodyLength * 0.06);
  wingMark.renderOrder = 4;
  livery.add(wingMark);
  const tailMark = new THREE.Mesh(panelGeometry, material);
  tailMark.scale.set(Math.max(0.95, dimensions.tailSpan * 0.58), Math.max(0.55, dimensions.bodyRadius * 0.9), 1);
  tailMark.rotation.y = Math.PI / 2;
  tailMark.position.set(dimensions.bodyRadius * 0.55, dimensions.bodyRadius * 0.78, dimensions.bodyLength * 0.4);
  tailMark.renderOrder = 4;
  livery.add(tailMark);
  plane.add(livery);
  plane.userData.adLiveryId = placement.id;
}

export class AdPlacementManager {
  private readonly rendered: RenderedPlacement[];
  private elapsed = 0;
  private debugElapsed = 0;
  private readonly debugElement?: HTMLDivElement;
  private readonly liveryMetrics = new Map<string, LiveryMetric>();

  constructor(
    scene: THREE.Scene,
    cityId: string,
    placements: ReadonlyArray<AdPlacement>,
    showDebug: boolean,
    groundHeightAt?: (x: number, z: number) => number,
  ) {
    this.rendered = placements
      .filter((placement) => placement.cityId === cityId && placement.type !== 'AIRCRAFT_LIVERY' && isActive(placement))
      .map((placement) => buildPlacement(placement, groundHeightAt));
    for (const placement of placements) {
      if (placement.cityId === cityId && placement.type === 'AIRCRAFT_LIVERY' && isActive(placement)) {
        this.liveryMetrics.set(placement.id, {
          placement,
          metrics: { impressions: 0, totalVisibleSeconds: 0, continuousVisibleSeconds: 0, lastImpressionAt: -Infinity },
          projectedPixels: 0,
        });
      }
    }
    for (const rendered of this.rendered) scene.add(rendered.group);

    if (showDebug) {
      this.debugElement = document.createElement('div');
      this.debugElement.id = 'ad-debug';
      this.debugElement.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:30;padding:6px 8px;background:#071116d9;border:1px solid #4e91a5;color:#d7edf2;font:11px/1.35 monospace;pointer-events:none;';
      document.body.append(this.debugElement);
      this.updateDebug();
    }
  }

  update(camera: THREE.Camera, delta: number, localLiveryPlane?: THREE.Group): void {
    this.elapsed += delta;
    if (this.elapsed < 0.15) return;
    const interval = this.elapsed;
    this.elapsed = 0;
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);

    for (const rendered of this.rendered) {
      rendered.group.getWorldPosition(placementPoint);
      const distance = camera.position.distanceTo(placementPoint);
      worldNormal.copy(rendered.normal).applyQuaternion(rendered.group.quaternion);
      cameraDirection.copy(camera.position).sub(placementPoint).normalize();
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      const projectedHeight = perspectiveCamera.isPerspectiveCamera
        ? rendered.placement.size.y / (2 * Math.max(distance, 1) * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) * 0.5)) * window.innerHeight
        : Number.POSITIVE_INFINITY;
      const projectedWidth = perspectiveCamera.isPerspectiveCamera
        ? rendered.placement.size.x / (2 * Math.max(distance, 1) * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) * 0.5)) * window.innerHeight
        : Number.POSITIVE_INFINITY;
      const minimumPixels = rendered.placement.type === 'BUILDING_SCREEN' ? 24 : rendered.placement.type === 'AIRPORT_SIGN' ? 22 : 20;
      const visualScale = THREE.MathUtils.clamp(minimumPixels / Math.max(projectedHeight, 1), 1, 2.2);
      rendered.farPanel.scale.set(rendered.placement.size.x * 1.04 * visualScale, rendered.placement.size.y * 1.04 * visualScale, 1);
      const visibleHeight = projectedHeight * visualScale;
      const visibleWidth = projectedWidth * visualScale;
      rendered.projectedPixels = Math.max(visibleHeight, visibleWidth);
      const visible = distance <= rendered.maxDistance &&
        frustum.containsPoint(placementPoint) &&
        worldNormal.dot(cameraDirection) >= 0.1 &&
        visibleHeight >= minimumPixels && visibleWidth >= minimumPixels * 2;
      if (!visible) {
        rendered.metrics.continuousVisibleSeconds = 0;
        continue;
      }
      rendered.metrics.totalVisibleSeconds += interval;
      rendered.metrics.continuousVisibleSeconds += interval;
      const now = performance.now() / 1000;
      if (rendered.metrics.continuousVisibleSeconds >= 1 && now - rendered.metrics.lastImpressionAt >= 30) {
        rendered.metrics.impressions += 1;
        rendered.metrics.lastImpressionAt = now;
        rendered.metrics.continuousVisibleSeconds = 0;
      }
    }
    if (localLiveryPlane) this.updateLiveryMetric(camera, interval, localLiveryPlane);
    this.debugElapsed += interval;
    if (this.debugElement && this.debugElapsed >= 0.5) {
      this.debugElapsed = 0;
      this.updateDebug();
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const rendered of this.rendered) scene.remove(rendered.group);
    this.debugElement?.remove();
  }

  getStats(): { meshes: number; materials: number } {
    return { meshes: this.rendered.length * 2, materials: materialCache.size + farMaterialCache.size };
  }

  private updateDebug(): void {
    if (!this.debugElement) return;
    const metrics = [
      ...this.rendered.map((rendered) => ({ id: rendered.placement.id, ...rendered.metrics, projectedPixels: rendered.projectedPixels })),
      ...[...this.liveryMetrics.values()].map((metric) => ({ id: metric.placement.id, ...metric.metrics, projectedPixels: metric.projectedPixels })),
    ];
      this.debugElement.innerHTML = `AD DEBUG<br>${metrics.map((metric) => `${metric.id}<br>${metric.projectedPixels.toFixed(0)}px · ${metric.totalVisibleSeconds.toFixed(1)}s · ${metric.impressions} imp`).join('<br>')}`;
  }

  private updateLiveryMetric(camera: THREE.Camera, interval: number, plane: THREE.Group): void {
    const liveryId = plane.userData.adLiveryId as string | undefined;
    if (!liveryId) return;
    const metric = this.liveryMetrics.get(liveryId);
    if (!metric) return;
    plane.getWorldPosition(placementPoint);
    const distance = camera.position.distanceTo(placementPoint);
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const apparentSize = perspectiveCamera.isPerspectiveCamera
      ? Math.max(metric.placement.size.x, metric.placement.size.y) / (2 * Math.max(distance, 1) * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) * 0.5)) * window.innerHeight
      : Number.POSITIVE_INFINITY;
    metric.projectedPixels = apparentSize;
    const visible = distance <= 750 && frustum.containsPoint(placementPoint) && apparentSize >= 28 && plane.visible;
    if (!visible) {
      metric.metrics.continuousVisibleSeconds = 0;
      return;
    }
    metric.metrics.totalVisibleSeconds += interval;
    metric.metrics.continuousVisibleSeconds += interval;
    const now = performance.now() / 1000;
    if (metric.metrics.continuousVisibleSeconds >= 1 && now - metric.metrics.lastImpressionAt >= 30) {
      metric.metrics.impressions += 1;
      metric.metrics.lastImpressionAt = now;
      metric.metrics.continuousVisibleSeconds = 0;
    }
  }
}
