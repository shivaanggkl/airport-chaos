import * as THREE from 'three';
import { visualLanguage } from './visual-language';

export type NavigationDestination = {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: 'airport' | 'district' | 'landmark';
};

type Waypoint = { x: number; z: number; label?: string } | null;
type BeaconEntry = { destination: NavigationDestination; mesh: THREE.Mesh; label: HTMLDivElement };
type CombatExclusion = { x: number; y: number; radius: number; active: boolean };

const NEAR_HIDE_DISTANCE = 650;
// Dallas spans 50 km: a useful airport/city-center cue must survive a full
// cross-metro leg, while the visible-entry cap keeps the skyline uncluttered.
const FAR_HIDE_DISTANCE = 32_000;
const MAX_VISIBLE_DESTINATIONS = 4;

/**
 * Cheap, city-configured long-range navigation.  The beam is visual-only; it
 * never participates in collision, world streaming, or gameplay authority.
 */
export class NavigationBeaconSystem {
  private readonly group = new THREE.Group();
  private readonly labels = document.createElement('div');
  private readonly beamGeometry = new THREE.CylinderGeometry(7, 12, 900, 8, 1, true);
  private readonly destinationMaterial = new THREE.MeshBasicMaterial({ color: visualLanguage.airport.color, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  private readonly waypointMaterial = new THREE.MeshBasicMaterial({ color: visualLanguage.waypoint.color, transparent: true, opacity: 0.26, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  private readonly entries: BeaconEntry[];
  private readonly waypointMesh: THREE.Mesh;
  private readonly waypointLabel = document.createElement('div');
  private readonly projected = new THREE.Vector3();
  private enabled = true;

  constructor(
    scene: THREE.Scene,
    destinations: readonly NavigationDestination[],
    terrainHeight: (x: number, z: number) => number,
  ) {
    this.group.name = 'sky-navigation-beacons';
    this.entries = destinations.map((destination) => {
      const mesh = new THREE.Mesh(this.beamGeometry, this.destinationMaterial);
      mesh.name = `sky-beacon-${destination.id}`;
      mesh.position.set(destination.x, terrainHeight(destination.x, destination.z) + 600, destination.z);
      mesh.renderOrder = 2;
      this.group.add(mesh);
      const label = this.createLabel();
      return { destination, mesh, label };
    });
    this.waypointMesh = new THREE.Mesh(this.beamGeometry, this.waypointMaterial);
    this.waypointMesh.name = 'sky-beacon-waypoint';
    this.waypointMesh.renderOrder = 3;
    this.waypointMesh.visible = false;
    this.group.add(this.waypointMesh);
    this.waypointLabel.className = 'sky-nav-label waypoint';
    this.labels.append(this.waypointLabel);
    this.labels.className = 'sky-nav-labels';
    document.body.append(this.labels);
    scene.add(this.group);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) return;
    for (const entry of this.entries) { entry.mesh.visible = false; entry.label.hidden = true; }
    this.waypointMesh.visible = false;
    this.waypointLabel.hidden = true;
  }

  isEnabled(): boolean { return this.enabled; }

  update(
    playerPosition: THREE.Vector3,
    camera: THREE.Camera,
    waypoint: Waypoint,
    terrainHeight: (x: number, z: number) => number,
    combatExclusion: CombatExclusion,
  ): void {
    if (!this.enabled) return;
    const candidates = this.entries
      .map((entry) => ({ entry, distance: Math.hypot(entry.destination.x - playerPosition.x, entry.destination.z - playerPosition.z) }))
      .filter((candidate) => candidate.distance >= NEAR_HIDE_DISTANCE && candidate.distance <= FAR_HIDE_DISTANCE)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, MAX_VISIBLE_DESTINATIONS);
    const visible = new Set(candidates.map((candidate) => candidate.entry));
    for (const entry of this.entries) {
      const candidate = candidates.find((item) => item.entry === entry);
      entry.mesh.visible = visible.has(entry);
      if (!candidate) { entry.label.hidden = true; continue; }
      this.positionLabel(entry.label, entry.destination.x, terrainHeight(entry.destination.x, entry.destination.z) + 870, entry.destination.z, `${entry.destination.label} · ${this.formatDistance(candidate.distance)}`, camera, combatExclusion);
    }
    if (!waypoint) {
      this.waypointMesh.visible = false;
      this.waypointLabel.hidden = true;
      return;
    }
    const distance = Math.hypot(waypoint.x - playerPosition.x, waypoint.z - playerPosition.z);
    const visibleWaypoint = distance >= 150 && distance <= FAR_HIDE_DISTANCE * 1.15;
    this.waypointMesh.visible = visibleWaypoint;
    this.waypointLabel.hidden = !visibleWaypoint;
    if (!visibleWaypoint) return;
    this.waypointMesh.position.set(waypoint.x, terrainHeight(waypoint.x, waypoint.z) + 450, waypoint.z);
    this.positionLabel(this.waypointLabel, waypoint.x, terrainHeight(waypoint.x, waypoint.z) + 875, waypoint.z, `${waypoint.label ?? 'WAYPOINT'} · ${this.formatDistance(distance)}`, camera, combatExclusion);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.beamGeometry.dispose();
    this.destinationMaterial.dispose();
    this.waypointMaterial.dispose();
    this.labels.remove();
  }

  private createLabel(): HTMLDivElement {
    const label = document.createElement('div');
    label.className = 'sky-nav-label';
    label.hidden = true;
    this.labels.append(label);
    return label;
  }

  private positionLabel(label: HTMLDivElement, x: number, y: number, z: number, text: string, camera: THREE.Camera, combatExclusion: CombatExclusion): void {
    this.projected.set(x, y, z).project(camera);
    const visible = this.projected.z >= -1 && this.projected.z <= 1 && Math.abs(this.projected.x) <= 1.08 && Math.abs(this.projected.y) <= 1.08;
    const screenX = (this.projected.x + 1) * 0.5 * window.innerWidth;
    const screenY = (1 - this.projected.y) * 0.5 * window.innerHeight;
    const screenCenterDistance = Math.hypot(screenX - window.innerWidth * 0.5, screenY - window.innerHeight * 0.5);
    const combatDistance = Math.hypot(screenX - combatExclusion.x, screenY - combatExclusion.y);
    // Navigation is deliberately peripheral. It never gets to sit inside the
    // combat acquisition area or cover a target at the centre of the view.
    const inCombatArea = combatDistance < combatExclusion.radius + 72;
    const nearCenter = screenCenterDistance < Math.min(window.innerWidth, window.innerHeight) * 0.18;
    label.hidden = !visible || inCombatArea || (combatExclusion.active && nearCenter);
    if (!visible) return;
    label.textContent = text;
    label.style.opacity = nearCenter ? '0.18' : screenCenterDistance < Math.min(window.innerWidth, window.innerHeight) * 0.3 ? '0.42' : '0.72';
    label.style.transform = `translate(-50%, -100%) translate(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px)`;
  }

  private formatDistance(distance: number): string {
    return distance >= 1_000 ? `${(distance / 1_000).toFixed(1)} km` : `${Math.round(distance)} m`;
  }
}
