import * as THREE from 'three';
import { airportChaosLogoUrl, loadAirportChaosLogo } from './brand';
import { companyContact } from './company-contact';

export type AdPlacementType = 'PREMIUM_BUILDING_WRAP' | 'GROUND_SPONSOR' | 'AIRPORT_GROUND_SPONSOR' | 'ROOFTOP_BILLBOARD' | 'AIRPORT_SPONSOR' | 'HIGHWAY_BILLBOARD' | 'SKYBOARD' | 'SKY_GATE' | 'SPONSOR_BLIMP' | 'RING_SPONSOR' | 'EVENT_SPONSOR' | 'AIRCRAFT_LIVERY';
export type AdCreative = {
  reference: string;
  headline: string;
  subline?: string;
  background?: string;
  foreground?: string;
  accent?: string;
  mark?: string;
  footer?: string;
};
export type SponsorCampaignId = 'airport-chaos' | 'vaden-software' | 'available-premium' | 'available-standard';
export type RingSponsorship = { type: 'RING_SPONSOR'; campaignId: SponsorCampaignId };
export type EventSponsorship = { type: 'EVENT_SPONSOR'; campaignId: SponsorCampaignId };
// One campaign catalog supplies every live placement, ring, event, and DEV livery.
// Placement coordinates never own sponsor copy or a second display name.
export const sponsorCatalog: Readonly<Record<SponsorCampaignId, {
  sponsorId: string; displayName: string; logoAsset?: string; website?: string;
  campaignType: 'house' | 'available'; creative: AdCreative;
}>> = {
  'airport-chaos': { sponsorId: 'airport-chaos', displayName: 'Airport Chaos', logoAsset: airportChaosLogoUrl, website: companyContact.website, campaignType: 'house',
    creative: { reference: 'house:airport-chaos', headline: 'AIRPORT CHAOS', subline: 'FLY • FIGHT • EXPLORE', footer: companyContact.companyName.toUpperCase(), background: '#102b3e', foreground: '#f5fcff', accent: '#71c7e6' } },
  'vaden-software': { sponsorId: 'vaden-software', displayName: companyContact.companyName, website: companyContact.website, campaignType: 'house',
    creative: { reference: 'house:vaden-software', headline: companyContact.companyName.toUpperCase(), subline: companyContact.websiteLabel, background: '#102b3e', foreground: '#f5fcff', accent: '#71c7e6', mark: 'V' } },
  'available-premium': { sponsorId: 'available', displayName: 'Your Brand Here', website: companyContact.website, campaignType: 'available',
    creative: { reference: 'available:premium', headline: 'YOUR BRAND HERE', subline: 'Sponsor this location', background: '#11283c', foreground: '#fff9e9', accent: '#f3c45d' } },
  'available-standard': { sponsorId: 'available', displayName: 'Advertise Here', website: companyContact.website, campaignType: 'available',
    creative: { reference: 'available:standard', headline: 'ADVERTISE HERE', subline: 'Advertise in Airport Chaos', background: '#183638', foreground: '#f7fff6', accent: '#9fe1c7' } },
};
export function sponsorCreative(campaignId: SponsorCampaignId): AdCreative { return sponsorCatalog[campaignId].creative; }
const eventSponsors: Readonly<Record<string, EventSponsorship>> = {
  supplyDrop: { type: 'EVENT_SPONSOR', campaignId: 'vaden-software' },
  skyRush: { type: 'EVENT_SPONSOR', campaignId: 'airport-chaos' },
  goldenSkyRun: { type: 'EVENT_SPONSOR', campaignId: 'available-premium' },
  emergencyEscort: { type: 'EVENT_SPONSOR', campaignId: 'vaden-software' },
  cargoConvoy: { type: 'EVENT_SPONSOR', campaignId: 'available-standard' },
  riskZone: { type: 'EVENT_SPONSOR', campaignId: 'airport-chaos' },
  cityEmergency: { type: 'EVENT_SPONSOR', campaignId: 'available-premium' },
  aceIntercept: { type: 'EVENT_SPONSOR', campaignId: 'airport-chaos' },
  vipEscort: { type: 'EVENT_SPONSOR', campaignId: 'vaden-software' },
};
export function eventSponsorFor(eventType: string): EventSponsorship | undefined {
  return eventSponsors[eventType];
}
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
  campaignId: SponsorCampaignId;
  creativeId?: string;
  // Exact roof height for rooftop frames; facades and airport signs are flush
  // against authored wall coordinates and must never grow ground posts.
  supportBaseY?: number;
  streamedMount?: boolean;
  freestanding?: boolean;
  targetAircraftType?: 'trainer' | 'privateJet' | 'cargo' | 'fighter';
  blimpOrbit?: { radiusX: number; radiusZ: number; periodSeconds: number; phase?: number };
};
export type AdPlacementSpec = Omit<AdPlacement, 'creative' | 'sponsorName' | 'startAt' | 'endAt' | 'enabled'>;
export function resolveAdPlacement(spec: AdPlacementSpec): AdPlacement {
  const campaign = sponsorCatalog[spec.campaignId];
  return { ...spec, creative: campaign.creative, sponsorName: campaign.displayName,
    startAt: '2025-01-01T00:00:00.000Z', endAt: '2035-12-31T23:59:59.000Z', enabled: true };
}

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
  ownedGeometry?: THREE.BufferGeometry;
  metrics: PlacementMetrics;
  maxDistance: number;
  creativeWidth: number;
  creativeHeight: number;
  projectedPixels: number;
};

type RingSponsorRuntime = {
  group: THREE.Group;
  radius: number;
  materials: THREE.MeshBasicMaterial[];
  metrics: PlacementMetrics;
  projectedPixels: number;
  suppressed: boolean;
};

type LiveryMetric = {
  placement: AdPlacement;
  metrics: PlacementMetrics;
  projectedPixels: number;
};

const panelGeometry = new THREE.PlaneGeometry(1, 1);
const ringDiscGeometry = new THREE.CircleGeometry(1, 48);
const supportGeometry = new THREE.BoxGeometry(1, 1, 1);
const blimpBodyGeometry = new THREE.SphereGeometry(1, 20, 12);
const materialCache = new Map<string, THREE.MeshBasicMaterial>();
const skyFaceMaterialCache = new Map<string, THREE.MeshBasicMaterial>();
const ringSponsors = new Set<RingSponsorRuntime>();
const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x30393d, roughness: 0.88 });
const skyFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x263942, metalness: 0.68, roughness: 0.39 });
const skyCornerMaterial = new THREE.MeshBasicMaterial({ color: 0x9ee3ee, toneMapped: false });
const blimpBodyMaterial = new THREE.MeshStandardMaterial({ color: 0xdbe5e1, metalness: 0.12, roughness: 0.68 });
const blimpTrimMaterial = new THREE.MeshStandardMaterial({ color: 0x406176, metalness: 0.28, roughness: 0.58 });
const placementPoint = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const worldNormal = new THREE.Vector3();
const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const projectedPoint = new THREE.Vector3();
const ringScale = new THREE.Vector3();
const ringQuaternion = new THREE.Quaternion();
const aircraftPoint = new THREE.Vector3();

function skyFaceMaterialFor(creative: AdCreative, level: 'near' | 'mid' | 'far', aspect: number): THREE.MeshBasicMaterial {
  const key = `${creative.reference}|${level}|${Math.max(0.2, Math.round(aspect * 10) / 10)}`;
  let material = skyFaceMaterialCache.get(key);
  if (!material) {
    material = materialFor(creative, level, aspect).clone();
    material.side = THREE.FrontSide;
    skyFaceMaterialCache.set(key, material);
  }
  return material;
}

function visibleInHierarchy(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function isActive(placement: AdPlacement, now = Date.now()): boolean {
  return placement.enabled && now >= Date.parse(placement.startAt) && now <= Date.parse(placement.endAt);
}

function materialFor(creative: AdCreative, level: 'near' | 'mid' | 'far' = 'near', aspect = 3.2): THREE.MeshBasicMaterial {
  const portrait = aspect < 1.35;
  const aspectKey = Math.max(0.2, Math.round(aspect * 10) / 10);
  const key = `${creative.reference}|${level}|${aspectKey}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const maxWidth = level === 'far' ? 256 : level === 'mid' ? 512 : 1024;
  canvas.height = Math.min(level === 'far' ? 128 : level === 'mid' ? 256 : 512, Math.round(maxWidth / aspectKey));
  canvas.width = Math.round(canvas.height * aspectKey);
  const context = canvas.getContext('2d')!;
  context.fillStyle = creative.background ?? '#061b29';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const unit = canvas.height;
  const accent = creative.accent ?? '#f0b84e';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (creative.reference === sponsorCatalog['airport-chaos'].creative.reference) {
    context.strokeStyle = accent;
    context.lineWidth = Math.max(2, unit * 0.015);
    context.strokeRect(unit * 0.045, unit * 0.07, canvas.width - unit * 0.09, unit * 0.86);
    context.fillStyle = creative.foreground ?? '#ffffff';
    context.font = `900 ${Math.round(unit * (aspectKey < 2 ? 0.27 : 0.35))}px Arial, sans-serif`;
    context.fillText(creative.headline, canvas.width * 0.5, level === 'far' ? unit * 0.54 : unit * 0.42, canvas.width * 0.87);
    if (level !== 'far') {
      context.fillStyle = accent;
      context.font = `700 ${Math.round(unit * 0.105)}px Arial, sans-serif`;
      context.fillText(creative.subline ?? '', canvas.width * 0.5, unit * 0.68, canvas.width * 0.82);
      if (level === 'near') {
        context.font = `700 ${Math.round(unit * 0.058)}px Arial, sans-serif`;
        context.fillText(creative.footer ?? '', canvas.width * 0.5, unit * 0.84, canvas.width * 0.72);
      }
    }
  } else if (creative.reference.startsWith('self:')) {
    // Every LOD carries the complete callout. At distance, omit small copy
    // rather than reducing the primary message to an unexplained initial.
    const compact = aspectKey < 2.4;
    const words = creative.reference === sponsorCatalog['available-premium'].creative.reference
      ? ['YOUR', 'BRAND', 'HERE'] : ['ADVERTISE', 'HERE'];
    context.strokeStyle = accent;
    context.lineWidth = Math.max(2, unit * 0.018);
    context.strokeRect(unit * 0.055, unit * 0.055, canvas.width - unit * 0.11, unit * 0.89);
    context.fillStyle = creative.foreground ?? '#ffffff';
    if (compact) {
      const fontSize = unit * (words.length === 3 ? 0.245 : 0.29);
      context.font = `900 ${Math.round(fontSize)}px Arial, sans-serif`;
      const firstY = words.length === 3 ? unit * 0.28 : unit * 0.37;
      words.forEach((word, index) => context.fillText(word, canvas.width * 0.5, firstY + index * unit * 0.22, canvas.width * 0.82));
    } else {
      context.font = `900 ${Math.round(unit * 0.39)}px Arial, sans-serif`;
      context.fillText(creative.headline, canvas.width * 0.5, unit * (level === 'far' ? 0.52 : 0.43), canvas.width * 0.88);
    }
    if (level !== 'far' && creative.subline) {
      context.fillStyle = accent;
      context.font = `700 ${Math.round(unit * (compact ? 0.072 : 0.115))}px Arial, sans-serif`;
      context.fillText(creative.subline, canvas.width * 0.5, unit * (compact ? 0.89 : 0.74), canvas.width * 0.82);
    }
  } else if (aspect >= 0.95 && aspect <= 1.05) {
    // Ring discs use the same cached creative, composed for a circular crop.
    context.fillStyle = accent;
    context.beginPath();
    context.arc(canvas.width * 0.5, unit * 0.45, unit * 0.32, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = creative.background ?? '#061b29';
    context.font = `900 ${Math.round(unit * (level === 'far' ? 0.55 : 0.43))}px Arial, sans-serif`;
    context.fillText(creative.mark ?? creative.headline[0] ?? 'A', canvas.width * 0.5, unit * 0.44);
    if (level !== 'far') {
      context.fillStyle = creative.foreground ?? '#fff8eb';
      context.font = `800 ${Math.round(unit * 0.105)}px Arial, sans-serif`;
      context.fillText(creative.headline, canvas.width * 0.5, unit * 0.76, canvas.width * 0.82);
      if (level === 'near' && creative.subline) {
        context.fillStyle = accent;
        context.font = `700 ${Math.round(unit * 0.044)}px Arial, sans-serif`;
        context.fillText(creative.subline, canvas.width * 0.5, unit * 0.87, canvas.width * 0.72);
      }
    }
  } else if (portrait) {
    context.fillStyle = accent;
    context.fillRect(0, 0, canvas.width, unit * 0.48);
    context.fillStyle = creative.background ?? '#061b29';
    context.font = `900 ${Math.round(unit * 0.33)}px Arial, sans-serif`;
    context.fillText(creative.mark ?? creative.headline[0] ?? 'A', canvas.width * 0.5, unit * 0.25);
    if (level !== 'far') {
      context.fillStyle = creative.foreground ?? '#fff8eb';
      context.font = `800 ${Math.round(unit * 0.105)}px Arial, sans-serif`;
      context.fillText(creative.headline, canvas.width * 0.5, unit * 0.64, canvas.width * 0.91);
      if (creative.subline) {
        context.fillStyle = accent;
        context.font = `700 ${Math.round(unit * 0.047)}px Arial, sans-serif`;
        context.fillText(creative.subline, canvas.width * 0.5, unit * 0.78, canvas.width * 0.88);
      }
    }
    context.fillStyle = accent;
    context.fillRect(canvas.width * 0.08, unit * 0.9, canvas.width * 0.84, unit * 0.012);
  } else {
    context.fillStyle = accent;
    context.fillRect(0, 0, unit * 0.95, unit);
    context.fillStyle = creative.background ?? '#061b29';
    context.font = `900 ${Math.round(unit * 0.56)}px Arial, sans-serif`;
    context.fillText(creative.mark ?? creative.headline[0] ?? 'A', unit * 0.475, unit * 0.51, unit * 0.75);
    if (level !== 'far') {
      const textCenter = (unit * 0.95 + canvas.width) * 0.5;
      context.fillStyle = creative.foreground ?? '#fff8eb';
      context.font = `800 ${Math.round(unit * (level === 'near' ? 0.265 : 0.245))}px Arial, sans-serif`;
      context.fillText(creative.headline, textCenter, unit * 0.4, canvas.width - unit * 1.2);
      if (creative.subline) {
        context.fillStyle = accent;
        context.font = `700 ${Math.round(unit * 0.12)}px Arial, sans-serif`;
        context.fillText(creative.subline, textCenter, unit * 0.68, canvas.width - unit * 1.3);
      }
      if (level === 'near') {
        context.fillStyle = accent;
        context.fillRect(unit * 1.2, unit * 0.79, canvas.width - unit * 1.45, unit * 0.012);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
  materialCache.set(key, material);
  if (creative.reference === sponsorCatalog['airport-chaos'].creative.reference) {
    void loadAirportChaosLogo().then((image) => {
      if (!image) return;
      const width = canvas.width;
      const height = canvas.height;
      context.fillStyle = creative.background ?? '#102b3e';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = creative.accent ?? '#71c7e6';
      context.lineWidth = Math.max(2, height * 0.012);
      context.strokeRect(height * 0.035, height * 0.035, width - height * 0.07, height * 0.93);
      const logoAreaWidth = aspectKey > 2.2 ? width * 0.48 : width * 0.88;
      const logoMaxHeight = height * 0.89;
      const logoScale = Math.min(logoAreaWidth / image.naturalWidth, logoMaxHeight / image.naturalHeight);
      const logoWidth = image.naturalWidth * logoScale;
      const logoHeight = image.naturalHeight * logoScale;
      const logoCenterX = aspectKey > 2.2 ? width * 0.27 : width * 0.5;
      context.drawImage(image, logoCenterX - logoWidth * 0.5, (height - logoHeight) * 0.5, logoWidth, logoHeight);
      if (aspectKey > 2.2) {
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = creative.foreground ?? '#f5fcff';
        context.font = `800 ${Math.round(height * (level === 'far' ? 0.18 : 0.16))}px Arial, sans-serif`;
        context.fillText(creative.subline ?? '', width * 0.74, height * 0.45, width * 0.43);
        if (level !== 'far') {
          context.fillStyle = creative.accent ?? '#71c7e6';
          context.font = `700 ${Math.round(height * 0.085)}px Arial, sans-serif`;
          context.fillText(creative.footer ?? '', width * 0.74, height * 0.68, width * 0.39);
        }
      }
      texture.needsUpdate = true;
    });
  }
  return material;
}

export function createRingSponsor(sponsor: RingSponsorship, radius: number): THREE.Group {
  const creative = sponsorCreative(sponsor.campaignId);
  const group = new THREE.Group();
  group.name = `ring-sponsor-${creative.reference}`;
  const lod = new THREE.LOD();
  const materials: THREE.MeshBasicMaterial[] = [];
  for (const [level, distance] of [['near', 0], ['mid', radius * 10], ['far', radius * 28]] as const) {
    // Opacity is per ring; all three materials still share their cached maps.
    const material = materialFor(creative, level, 1).clone();
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.FrontSide;
    material.opacity = 0.96;
    materials.push(material);
    const disc = new THREE.Mesh(ringDiscGeometry, material);
    disc.name = `ring-sponsor-${level}-${creative.reference}`;
    disc.scale.setScalar(radius * 0.94);
    disc.position.z = -radius * 0.006;
    disc.userData.sharedAsset = true;
    // A double-sided textured plane mirrors its lettering from the back.
    // Use the same cached material on a reversed face so either fly-through
    // direction reads the sponsor correctly without another texture.
    const reverseFace = new THREE.Mesh(ringDiscGeometry, material);
    reverseFace.rotation.y = Math.PI;
    reverseFace.position.z = -0.002;
    reverseFace.userData.sharedAsset = true;
    disc.add(reverseFace);
    lod.addLevel(disc, distance);
  }
  group.add(lod);
  ringSponsors.add({
    group, radius, materials,
    metrics: { impressions: 0, totalVisibleSeconds: 0, continuousVisibleSeconds: 0, lastImpressionAt: -Infinity },
    projectedPixels: 0, suppressed: false,
  });
  return group;
}

function maxVisibleDistance(type: AdPlacementType): number {
  if (type === 'SKYBOARD') return 10_000;
  if (type === 'SKY_GATE') return 7_000;
  if (type === 'SPONSOR_BLIMP') return 11_000;
  if (type === 'PREMIUM_BUILDING_WRAP') return 5_400;
  if (type === 'GROUND_SPONSOR' || type === 'AIRPORT_GROUND_SPONSOR') return 5_400;
  if (type === 'AIRPORT_SPONSOR') return 4_300;
  return 4_800;
}

function isGroundPlacement(type: AdPlacementType): boolean {
  return type === 'GROUND_SPONSOR' || type === 'AIRPORT_GROUND_SPONSOR';
}

function isSkyPlacement(type: AdPlacementType): boolean {
  return type === 'SKYBOARD' || type === 'SKY_GATE' || type === 'SPONSOR_BLIMP';
}

function visibleAtQuality(placement: AdPlacement, quality: 'high' | 'low'): boolean {
  if (quality === 'high') return true;
  if (placement.type !== 'HIGHWAY_BILLBOARD' && placement.type !== 'ROOFTOP_BILLBOARD' && placement.type !== 'GROUND_SPONSOR') return true;
  let hash = 0;
  for (let index = 0; index < placement.id.length; index += 1) hash = (hash * 31 + placement.id.charCodeAt(index)) | 0;
  return (hash & 1) === 0;
}

function skyCreativeSize(placement: AdPlacement): { width: number; height: number } {
  if (placement.type === 'SKY_GATE') return { width: placement.size.x * 0.94, height: placement.size.y * 0.22 };
  if (placement.type === 'SPONSOR_BLIMP') return { width: placement.size.x * 0.64, height: placement.size.y * 0.48 };
  return { width: placement.size.x, height: placement.size.y };
}

function addSkyCreative(placement: AdPlacement, width: number, height: number, sideOffset = 0): THREE.LOD {
  const lod = new THREE.LOD();
  const thresholds = placement.type === 'SKY_GATE' ? [0, 1_200, 3_600]
    : placement.type === 'SPONSOR_BLIMP' ? [0, 2_000, 5_000] : [0, 1_800, 4_800];
  for (const [index, level] of (['near', 'mid', 'far'] as const).entries()) {
    const material = skyFaceMaterialFor(placement.creative, level, width / height);
    const faces = new THREE.Group();
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(panelGeometry, material);
      face.name = `ad-${level}-${placement.id}-${side === 1 ? 'front' : 'back'}`;
      face.scale.set(width, height, 1);
      face.position.z = side * (sideOffset + 0.13);
      if (side === -1) face.rotation.y = Math.PI;
      faces.add(face);
    }
    lod.addLevel(faces, thresholds[index]);
  }
  return lod;
}

function addFrameBar(group: THREE.Group, width: number, height: number, depth: number, x: number, y: number): void {
  const bar = new THREE.Mesh(supportGeometry, skyFrameMaterial);
  bar.scale.set(width, height, depth);
  bar.position.set(x, y, 0);
  group.add(bar);
}

function addSkyboard(group: THREE.Group, placement: AdPlacement): void {
  const { x: width, y: height } = placement.size;
  group.add(addSkyCreative(placement, width, height));
  const rim = 1.65;
  addFrameBar(group, width + rim * 2, rim, 0.6, 0, height * 0.5 + rim * 0.5);
  addFrameBar(group, width + rim * 2, rim, 0.6, 0, -height * 0.5 - rim * 0.5);
  addFrameBar(group, rim, height, 0.6, -width * 0.5 - rim * 0.5, 0);
  addFrameBar(group, rim, height, 0.6, width * 0.5 + rim * 0.5, 0);
  const corners = new THREE.InstancedMesh(supportGeometry, skyCornerMaterial, 8);
  const marker = new THREE.Object3D();
  let index = 0;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const side of [-1, 1]) {
    marker.position.set(x * (width * 0.5 + rim * 0.5), y * (height * 0.5 + rim * 0.5), side * 0.45);
    marker.scale.set(2.6, 2.6, 0.45);
    marker.updateMatrix();
    corners.setMatrixAt(index++, marker.matrix);
  }
  corners.instanceMatrix.needsUpdate = true;
  corners.computeBoundingSphere();
  group.add(corners);
}

function addSkyGate(group: THREE.Group, placement: AdPlacement): void {
  const { x: width, y: height } = placement.size;
  const { width: bannerWidth, height: bannerHeight } = skyCreativeSize(placement);
  const banner = addSkyCreative(placement, bannerWidth, bannerHeight);
  banner.position.y = height * 0.37;
  group.add(banner);
  const pylonHeight = height * 0.76;
  for (const side of [-1, 1]) addFrameBar(group, 3.2, pylonHeight, 3.2, side * width * 0.5, -height * 0.12);
  addFrameBar(group, bannerWidth + 3.2, 2.4, 1.2, 0, height * 0.48);
}

function addSponsorBlimp(group: THREE.Group, placement: AdPlacement): void {
  const { x: length, y: diameter, z: beam } = placement.size;
  const body = new THREE.Mesh(blimpBodyGeometry, blimpBodyMaterial);
  body.scale.set(length * 0.5, diameter * 0.5, beam * 0.5);
  group.add(body);
  const gondola = new THREE.Mesh(supportGeometry, blimpTrimMaterial);
  gondola.scale.set(length * 0.16, diameter * 0.16, beam * 0.24);
  gondola.position.y = -diameter * 0.55;
  group.add(gondola);
  const tail = new THREE.Mesh(supportGeometry, blimpTrimMaterial);
  tail.scale.set(length * 0.13, diameter * 0.42, 2.5);
  tail.position.set(-length * 0.43, diameter * 0.11, 0);
  group.add(tail);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(supportGeometry, blimpTrimMaterial);
    fin.scale.set(length * 0.12, 2.5, beam * 0.26);
    fin.position.set(-length * 0.42, 0, side * beam * 0.29);
    group.add(fin);
  }
  const { width, height } = skyCreativeSize(placement);
  group.add(addSkyCreative(placement, width, height, beam * 0.45));
}

function applyBlimpOrbit(group: THREE.Group, placement: AdPlacement, worldSeconds: number): void {
  const orbit = placement.blimpOrbit;
  if (!orbit) return;
  const phase = (worldSeconds / orbit.periodSeconds + (orbit.phase ?? 0)) * Math.PI * 2;
  group.position.set(
    placement.position.x + Math.cos(phase) * orbit.radiusX,
    placement.position.y + Math.sin(phase * 2) * 14,
    placement.position.z + Math.sin(phase) * orbit.radiusZ,
  );
  // The long body axis follows the route tangent; it never chases camera.
  group.rotation.y = Math.atan2(-Math.cos(phase) * orbit.radiusZ, -Math.sin(phase) * orbit.radiusX);
}

function groundGeometryFor(placement: AdPlacement, heightAt?: (x: number, z: number) => number): THREE.PlaneGeometry {
  // A tiny fixed grid follows the existing terrain/park surface without a
  // shader or a separate mesh for each LOD. Airport grounds are already flat.
  const geometry = new THREE.PlaneGeometry(placement.size.x, placement.size.y, 4, 4);
  if (heightAt) {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const rotation = new THREE.Euler(placement.rotation.x, placement.rotation.y, placement.rotation.z);
    const footprint = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      footprint.set(x, positions.getY(index), 0).applyEuler(rotation);
      positions.setZ(index, heightAt(placement.position.x + footprint.x, placement.position.z + footprint.z) - placement.position.y + 0.26);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

function buildPlacement(placement: AdPlacement, groundHeightAt?: (x: number, z: number) => number): RenderedPlacement {
  const group = new THREE.Group();
  const creativeSize = skyCreativeSize(placement);
  group.name = `ad-placement-${placement.id}`;
  group.position.set(placement.position.x, placement.position.y, placement.position.z);
  group.rotation.set(placement.rotation.x, placement.rotation.y, placement.rotation.z);

  const ground = isGroundPlacement(placement.type);
  const ownedGeometry = ground ? groundGeometryFor(placement, groundHeightAt) : undefined;
  if (placement.type === 'SKYBOARD') addSkyboard(group, placement);
  else if (placement.type === 'SKY_GATE') addSkyGate(group, placement);
  else if (placement.type === 'SPONSOR_BLIMP') {
    addSponsorBlimp(group, placement);
    applyBlimpOrbit(group, placement, Date.now() / 1000);
  }
  else {
    const lod = new THREE.LOD();
    for (const [level, distance] of [
      ['near', 0],
      ['mid', Math.max(450, placement.size.x * 12)],
      ['far', Math.max(1_300, placement.size.x * 30)],
    ] as const) {
      const panel = new THREE.Mesh(ownedGeometry ?? panelGeometry, materialFor(placement.creative, level, placement.size.x / placement.size.y));
      if (!ground) panel.scale.set(placement.size.x, placement.size.y, 1);
      if (!ground) panel.position.z = 0.12;
      panel.name = `ad-${level}-${placement.id}`;
      lod.addLevel(panel, distance);
    }
    group.add(lod);
  }

  // Facades and terminal signs sit on their authored wall plane. Freestanding
  // signs alone receive posts, terminating exactly at terrain or the roof.
  if (!isSkyPlacement(placement.type) && (placement.type === 'HIGHWAY_BILLBOARD' || placement.type === 'ROOFTOP_BILLBOARD' || placement.freestanding)) {
    const baseY = placement.supportBaseY ?? groundHeightAt?.(placement.position.x, placement.position.z) ?? 0;
    const clearance = Math.max(0.5, placement.position.y - placement.size.y * 0.5 - baseY);
    const postWidth = placement.type === 'ROOFTOP_BILLBOARD' ? 0.28 : 0.42;
    for (const offset of [-placement.size.x * 0.28, placement.size.x * 0.28]) {
      const post = new THREE.Mesh(supportGeometry, supportMaterial);
      post.scale.set(postWidth, clearance, postWidth);
      post.position.set(offset, -placement.size.y * 0.5 - clearance * 0.5, 0);
      group.add(post);
    }
  }
  if (!isSkyPlacement(placement.type) && (placement.type === 'ROOFTOP_BILLBOARD' || placement.type === 'HIGHWAY_BILLBOARD' || placement.freestanding)) {
    const backing = new THREE.Mesh(supportGeometry, supportMaterial);
    backing.scale.set(placement.size.x + 0.8, placement.size.y + 0.8, 0.18);
    group.add(backing);
  }

  return {
    placement,
    group,
    normal: new THREE.Vector3(0, 0, 1),
    ownedGeometry,
    metrics: { impressions: 0, totalVisibleSeconds: 0, continuousVisibleSeconds: 0, lastImpressionAt: -Infinity },
    maxDistance: maxVisibleDistance(placement.type),
    creativeWidth: creativeSize.width,
    creativeHeight: creativeSize.height,
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
  const material = materialFor(placement.creative, 'far');
  const fuselageLength = Math.min(1.6, dimensions.bodyLength * 0.23);
  const fuselageHeight = fuselageLength / 3.2;
  for (const side of [-1, 1]) {
    const fuselagePanel = new THREE.Mesh(panelGeometry, material);
    fuselagePanel.scale.set(fuselageLength, fuselageHeight, 1);
    fuselagePanel.rotation.y = side * Math.PI / 2;
    fuselagePanel.position.set(side * (dimensions.bodyRadius + 0.045), dimensions.bodyRadius * 0.15, dimensions.bodyLength * 0.06);
    fuselagePanel.userData.sharedAsset = true;
    livery.add(fuselagePanel);
  }
  const wingMark = new THREE.Mesh(panelGeometry, material);
  const wingMarkWidth = Math.min(2.1, dimensions.wingSpan * 0.28);
  wingMark.scale.set(wingMarkWidth, wingMarkWidth / 3.2, 1);
  wingMark.rotation.x = -Math.PI / 2;
  wingMark.position.set(dimensions.wingSpan * 0.22, Math.max(0.16, dimensions.bodyRadius * 0.4), -dimensions.bodyLength * 0.04);
  wingMark.userData.sharedAsset = true;
  livery.add(wingMark);
  const tailMark = new THREE.Mesh(panelGeometry, material);
  tailMark.scale.set(Math.min(0.9, dimensions.tailSpan * 0.26), Math.min(0.28, dimensions.tailSpan * 0.08), 1);
  tailMark.rotation.y = Math.PI / 2;
  tailMark.position.set(dimensions.bodyRadius * 0.08, dimensions.bodyRadius * 1.95, dimensions.bodyLength * 0.37);
  tailMark.userData.sharedAsset = true;
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
    private readonly hasBuildingDetailAt?: (x: number, z: number) => boolean,
    quality: 'high' | 'low' = 'high',
  ) {
    this.rendered = placements
      .filter((placement) => placement.cityId === cityId && placement.type !== 'AIRCRAFT_LIVERY' && placement.type !== 'RING_SPONSOR' && placement.type !== 'EVENT_SPONSOR' && isActive(placement) && visibleAtQuality(placement, quality))
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
      this.debugElement.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:30;max-width:270px;padding:6px 8px;background:#071116d9;border:1px solid #4e91a5;color:#d7edf2;font:11px/1.35 monospace;pointer-events:none;';
      document.body.append(this.debugElement);
      this.updateDebug();
    }
  }

  update(camera: THREE.Camera, delta: number, localLiveryPlane?: THREE.Group, combatActive = false, combatX = 0, combatY = 0, combatRadius = 0): void {
    if (localLiveryPlane) localLiveryPlane.getWorldPosition(aircraftPoint);
    for (const ring of ringSponsors) {
      ring.group.getWorldPosition(placementPoint);
      ring.group.getWorldScale(ringScale);
      const radius = ring.radius * Math.max(ringScale.x, ringScale.y);
      const distance = localLiveryPlane ? aircraftPoint.distanceTo(placementPoint) : Infinity;
      const fadeEnd = Math.max(radius * 5, 500);
      const entryFade = THREE.MathUtils.clamp((distance - radius * 0.5) / (fadeEnd - radius * 0.5), 0, 1);
      let targetOpacity = 0.12 + 0.84 * entryFade;
      ring.suppressed = false;
      if (combatActive && visibleInHierarchy(ring.group)) {
        projectedPoint.copy(placementPoint).project(camera);
        const screenX = (projectedPoint.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-projectedPoint.y * 0.5 + 0.5) * window.innerHeight;
        const perspective = camera as THREE.PerspectiveCamera;
        const screenRadius = perspective.isPerspectiveCamera
          ? radius / (2 * Math.max(camera.position.distanceTo(placementPoint), 1) * Math.tan(THREE.MathUtils.degToRad(perspective.fov) * 0.5)) * window.innerHeight
          : 0;
        ring.suppressed = projectedPoint.z >= -1 && projectedPoint.z <= 1 && Math.hypot(screenX - combatX, screenY - combatY) < combatRadius + screenRadius;
        if (ring.suppressed) targetOpacity = Math.min(targetOpacity, 0.08);
      }
      const opacity = THREE.MathUtils.damp(ring.materials[0].opacity, targetOpacity, 12, delta);
      for (const material of ring.materials) material.opacity = opacity;
    }
    this.elapsed += delta;
    if (this.elapsed < 0.15) return;
    const interval = this.elapsed;
    this.elapsed = 0;
    const worldSeconds = Date.now() / 1000;
    for (const rendered of this.rendered) {
      if (rendered.placement.type === 'SPONSOR_BLIMP') applyBlimpOrbit(rendered.group, rendered.placement, worldSeconds);
    }
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);

    for (const rendered of this.rendered) {
      if (rendered.placement.type === 'SKY_GATE') {
        placementPoint.set(0, rendered.placement.size.y * 0.37, 0);
        rendered.group.localToWorld(placementPoint);
      } else rendered.group.getWorldPosition(placementPoint);
      const distance = camera.position.distanceTo(placementPoint);
      worldNormal.copy(rendered.normal).applyQuaternion(rendered.group.quaternion);
      cameraDirection.copy(camera.position).sub(placementPoint).normalize();
      const width = rendered.creativeWidth;
      const height = rendered.creativeHeight;
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      const projectedHeight = perspectiveCamera.isPerspectiveCamera
        ? height / (2 * Math.max(distance, 1) * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) * 0.5)) * window.innerHeight
        : Number.POSITIVE_INFINITY;
      const projectedWidth = perspectiveCamera.isPerspectiveCamera
        ? width / (2 * Math.max(distance, 1) * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) * 0.5)) * window.innerHeight
        : Number.POSITIVE_INFINITY;
      const minimumPixels = rendered.placement.type === 'PREMIUM_BUILDING_WRAP' ? 24
        : rendered.placement.type === 'AIRPORT_SPONSOR' ? 22
          : isSkyPlacement(rendered.placement.type) ? 26 : 20;
      rendered.projectedPixels = Math.max(projectedHeight, projectedWidth);
      let combatOccluded = false;
      if (combatActive && distance < (isSkyPlacement(rendered.placement.type) ? rendered.maxDistance : 2_500)) {
        projectedPoint.copy(placementPoint).project(camera);
        const screenX = (projectedPoint.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-projectedPoint.y * 0.5 + 0.5) * window.innerHeight;
        combatOccluded = projectedPoint.z >= -1 && projectedPoint.z <= 1 &&
          Math.hypot(screenX - combatX, screenY - combatY) < combatRadius + Math.max(projectedHeight, projectedWidth) * 0.5;
      }
      const needsBuilding = rendered.placement.streamedMount === true;
      const mounted = !needsBuilding || !this.hasBuildingDetailAt || this.hasBuildingDetailAt(rendered.placement.position.x, rendered.placement.position.z);
      const facing = isSkyPlacement(rendered.placement.type) ? Math.abs(worldNormal.dot(cameraDirection)) : worldNormal.dot(cameraDirection);
      // Keep the airship silhouette visible from its nose/tail even when its
      // side creative is too edge-on to qualify for an impression.
      rendered.group.visible = mounted && distance <= rendered.maxDistance &&
        (rendered.placement.type === 'SPONSOR_BLIMP' || facing >= 0.05) && !combatOccluded;
      const visible = rendered.group.visible &&
        frustum.containsPoint(placementPoint) &&
        facing >= 0.1 &&
        projectedHeight >= minimumPixels && projectedWidth >= minimumPixels * 2;
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
    for (const ring of ringSponsors) {
      ring.group.getWorldPosition(placementPoint);
      ring.group.getWorldScale(ringScale);
      ring.group.getWorldQuaternion(ringQuaternion);
      const distance = camera.position.distanceTo(placementPoint);
      const perspective = camera as THREE.PerspectiveCamera;
      ring.projectedPixels = perspective.isPerspectiveCamera
        ? ring.radius * Math.max(ringScale.x, ringScale.y) / (Math.max(distance, 1) * Math.tan(THREE.MathUtils.degToRad(perspective.fov) * 0.5)) * window.innerHeight
        : 0;
      worldNormal.set(0, 0, 1).applyQuaternion(ringQuaternion);
      cameraDirection.copy(camera.position).sub(placementPoint).normalize();
      const visible = visibleInHierarchy(ring.group) && !ring.suppressed && distance <= 5_400 &&
        frustum.containsPoint(placementPoint) && Math.abs(worldNormal.dot(cameraDirection)) >= 0.1 && ring.projectedPixels >= 30;
      if (!visible) {
        ring.metrics.continuousVisibleSeconds = 0;
        continue;
      }
      ring.metrics.totalVisibleSeconds += interval;
      ring.metrics.continuousVisibleSeconds += interval;
      const now = performance.now() / 1000;
      if (ring.metrics.continuousVisibleSeconds >= 1 && now - ring.metrics.lastImpressionAt >= 30) {
        ring.metrics.impressions += 1;
        ring.metrics.lastImpressionAt = now;
        ring.metrics.continuousVisibleSeconds = 0;
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
    for (const rendered of this.rendered) {
      scene.remove(rendered.group);
      rendered.ownedGeometry?.dispose();
    }
    for (const ring of ringSponsors) for (const material of ring.materials) material.dispose();
    ringSponsors.clear();
    this.debugElement?.remove();
  }

  getStats(): { meshes: number; materials: number } {
    let meshes = 0;
    for (const rendered of this.rendered) rendered.group.traverse((object) => { if (object instanceof THREE.Mesh) meshes += 1; });
    return { meshes: meshes + ringSponsors.size * 6, materials: materialCache.size + skyFaceMaterialCache.size + 4 + ringSponsors.size * 3 };
  }

  private updateDebug(): void {
    if (!this.debugElement) return;
    const metrics = [
      ...this.rendered.map((rendered) => ({ id: rendered.placement.id, name: rendered.placement.sponsorName, type: rendered.placement.type, ...rendered.metrics, projectedPixels: rendered.projectedPixels })),
      ...[...ringSponsors].map((ring) => ({ id: ring.group.name, name: ring.group.name, type: 'RING_SPONSOR', ...ring.metrics, projectedPixels: ring.projectedPixels })),
      ...[...this.liveryMetrics.values()].map((metric) => ({ id: metric.placement.id, name: metric.placement.sponsorName, type: 'LIVERY', ...metric.metrics, projectedPixels: metric.projectedPixels })),
    ];
    metrics.sort((a, b) => b.projectedPixels - a.projectedPixels);
    const skyHighlights = (['SKYBOARD', 'SKY_GATE', 'SPONSOR_BLIMP', 'RING_SPONSOR'] as const)
      .map((type) => metrics.find((metric) => metric.type === type))
      .filter((metric) => metric !== undefined);
    this.debugElement.textContent = `AD DEBUG · ${this.rendered.length} world / ${ringSponsors.size} rings / ${this.liveryMetrics.size} livery\n${metrics.slice(0, 7).map((metric) => `${metric.id} · ${metric.type} · ${metric.projectedPixels.toFixed(0)}px · ${metric.impressions} imp`).join('\n')}\nSKY INVENTORY\n${skyHighlights.map((metric) => `${metric.id} · ${metric.type} · ${metric.projectedPixels.toFixed(0)}px · ${metric.impressions} imp`).join('\n')}`;
    this.debugElement.style.whiteSpace = 'pre-line';
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
