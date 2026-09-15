import * as THREE from 'three';

// Decorative geometry is deliberately separate from streamed city cells and
// gameplay entities. Future cities supply coordinates; mobile can use `low`.
export type CityVisualQuality = 'high' | 'low';
export type CityTimeOfDay = 'day' | 'dusk';
export type VisualAirport = {
  x: number; z: number; heading: number; runwayWidth: number; runwayLength: number;
  apronLateral: number; runwayLaterals?: readonly number[];
};
export type VisualTrafficRoute = { start: readonly [number, number]; end: readonly [number, number] };
export type CityVisualConfig = {
  airports: readonly VisualAirport[];
  trafficRoutes: readonly VisualTrafficRoute[];
  rooftopSites: readonly { x: number; z: number; height: number; width: number; depth: number }[];
  arena?: { x: number; z: number; radiusX: number; radiusZ: number };
  orientationSites?: readonly { x: number; z: number; kind: 'waterTower' | 'crane' | 'antenna' }[];
};

const box = new THREE.BoxGeometry(1, 1, 1);
const lightBox = new THREE.BoxGeometry(1, 1, 1);
const arenaParkingGeometry = new THREE.CircleGeometry(1, 24);
const arenaShellGeometry = new THREE.CylinderGeometry(1, 1.06, 67, 24, 1, true);
const arenaRoofGeometry = new THREE.CylinderGeometry(1, 1, 8, 24);
const arenaRoofRingGeometry = new THREE.RingGeometry(0.61, 0.91, 32);
const arenaCrownGeometry = new THREE.TorusGeometry(1, 0.019, 4, 32);
const helipadGeometry = new THREE.RingGeometry(7.5, 8.4, 24);
const dummy = new THREE.Object3D();
const nearWhite = new THREE.MeshBasicMaterial({ color: 0xfff3d1, toneMapped: false });
const rearRed = new THREE.MeshBasicMaterial({ color: 0xe74e39, toneMapped: false });
const edgeWhite = new THREE.MeshBasicMaterial({ color: 0xffe3a4, toneMapped: false });
const terminalWindowDay = new THREE.MeshBasicMaterial({ color: 0x438fa2, toneMapped: false });
const terminalWindowDusk = new THREE.MeshBasicMaterial({ color: 0xffd49e, toneMapped: false });
const towerWindowDay = new THREE.MeshBasicMaterial({ color: 0x8eb9c3, toneMapped: false });
const towerWindowDusk = new THREE.MeshBasicMaterial({ color: 0xffd1a0, toneMapped: false });
const aircraftWhite = new THREE.MeshStandardMaterial({ color: 0xd1e5e5, roughness: 0.62, metalness: 0.12 });
const vehicleBlue = new THREE.MeshStandardMaterial({ color: 0x5d8d9e, roughness: 0.7 });
const roofDark = new THREE.MeshStandardMaterial({ color: 0x314950, roughness: 0.78 });
const roofGreen = new THREE.MeshStandardMaterial({ color: 0x477b52, roughness: 0.96 });
const solarBlue = new THREE.MeshStandardMaterial({ color: 0x173e58, roughness: 0.28, metalness: 0.18 });
const arenaShell = new THREE.MeshStandardMaterial({ color: 0x9cabb0, roughness: 0.58, metalness: 0.18 });
const arenaParking = new THREE.MeshBasicMaterial({ color: 0x435057 });
const arenaRoof = new THREE.MeshStandardMaterial({ color: 0x344f5d, roughness: 0.51, metalness: 0.2 });
const arenaAccent = new THREE.MeshBasicMaterial({ color: 0x83c9db, toneMapped: false });
const arenaRoofRim = new THREE.MeshBasicMaterial({ color: 0xa4b7b9, toneMapped: false, side: THREE.DoubleSide });
const towerColumn = new THREE.CylinderGeometry(1, 1.3, 1, 8);
const towerBowl = new THREE.CylinderGeometry(1, 0.82, 1, 12);

type TrafficLight = { x1: number; z1: number; dx: number; dz: number; y1: number; y2: number; phase: number; direction: number };
type ServiceVehicle = { airport: VisualAirport; lateral: number; longitudinal: number; phase: number };

function place(airport: VisualAirport, lateral: number, longitudinal: number): { x: number; z: number } {
  const c = Math.cos(airport.heading);
  const s = Math.sin(airport.heading);
  return { x: airport.x + lateral * c + longitudinal * s, z: airport.z - lateral * s + longitudinal * c };
}

function setInstance(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, heading = 0): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, heading, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function addInstanced(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false; // tiny instance counts; one city-wide bounding sphere is misleading
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

export class CityVisualLayer {
  readonly group = new THREE.Group();
  private readonly traffic: TrafficLight[] = [];
  private readonly service: ServiceVehicle[] = [];
  private readonly frontLights?: THREE.InstancedMesh;
  private readonly rearLights?: THREE.InstancedMesh;
  private readonly serviceBodies?: THREE.InstancedMesh;
  private elapsed = 0;
  private updateTimer = 0;

  setDusk(dusk: boolean): void {
    const terminalWindows = this.group.getObjectByName('airport-terminal-window-glow') as THREE.InstancedMesh | undefined;
    const towerWindows = this.group.getObjectByName('signature-tower-window-bands') as THREE.InstancedMesh | undefined;
    if (terminalWindows) terminalWindows.material = dusk ? terminalWindowDusk : terminalWindowDay;
    if (towerWindows) towerWindows.material = dusk ? towerWindowDusk : towerWindowDay;
  }

  constructor(
    scene: THREE.Scene,
    private readonly config: CityVisualConfig,
    private readonly heightAt: (x: number, z: number) => number,
    quality: CityVisualQuality,
    dusk: boolean,
  ) {
    this.group.name = 'city-visual-layer';
    scene.add(this.group);
    this.addAirportLife(quality, dusk);
    this.addRoofs(quality, dusk);
    if (config.arena) this.addArena(config.arena);
    if (quality === 'high') this.addOrientationLandmarks(config.orientationSites ?? []);
    if (quality === 'high') {
      for (const route of config.trafficRoutes) {
        const dx = route.end[0] - route.start[0];
        const dz = route.end[1] - route.start[1];
        const count = Math.max(2, Math.round(Math.hypot(dx, dz) / 240));
        for (let index = 0; index < count; index += 1) {
          this.traffic.push({ x1: route.start[0], z1: route.start[1], dx, dz,
            y1: heightAt(route.start[0], route.start[1]), y2: heightAt(route.end[0], route.end[1]),
            phase: index / count, direction: index % 2 ? -1 : 1 });
        }
      }
      this.frontLights = addInstanced(this.group, lightBox, nearWhite, this.traffic.length, 'highway-front-lights');
      this.rearLights = addInstanced(this.group, lightBox, rearRed, this.traffic.length, 'highway-rear-lights');
      this.serviceBodies = addInstanced(this.group, box, vehicleBlue, this.service.length, 'airport-service-vehicles');
      this.update(1 / 12);
    }
  }

  private addAirportLife(quality: CityVisualQuality, dusk: boolean): void {
    const lights: Array<{ x: number; y: number; z: number }> = [];
    const parked: Array<{ x: number; y: number; z: number; heading: number }> = [];
    const terminalWindows: Array<{ x: number; y: number; z: number; width: number; heading: number }> = [];
    for (const airport of this.config.airports) {
      const laterals = airport.runwayLaterals ?? [0];
      for (const lateral of laterals) {
        const step = quality === 'low' ? 300 : 180;
        for (let longitudinal = -airport.runwayLength * 0.46; longitudinal <= airport.runwayLength * 0.46; longitudinal += step) {
          for (const side of [-1, 1]) {
            const point = place(airport, lateral + side * (airport.runwayWidth / 2 + 1.1), longitudinal);
            lights.push({ ...point, y: this.heightAt(point.x, point.z) + 0.42 });
          }
        }
      }
      if (quality === 'high') {
        for (const end of [-1, 1]) {
          for (const side of [-1, 0, 1]) {
            const point = place(airport, side * 18, end * (airport.runwayLength * 0.5 + 75));
            lights.push({ ...point, y: this.heightAt(point.x, point.z) + 1.2 });
          }
        }
      }
      const parkedCount = quality === 'low' ? 1 : airport.runwayLaterals ? 5 : 2;
      for (let i = 0; i < parkedCount; i += 1) {
        const longitudinal = (i - (parkedCount - 1) / 2) * (airport.runwayLaterals ? 280 : 78);
        const point = place(airport, airport.apronLateral, longitudinal);
        parked.push({ ...point, y: this.heightAt(point.x, point.z) + 2.8, heading: airport.heading + Math.PI / 2 });
      }
      const terminalLateral = airport.runwayLaterals ? 669 : airport.runwayWidth * 4.08;
      const panelCount = airport.runwayLaterals ? 7 : 3;
      for (let panel = 0; panel < panelCount; panel += 1) {
        const longitudinal = (panel - (panelCount - 1) / 2) * (airport.runwayLaterals ? 195 : airport.runwayWidth * 1.35);
        const point = place(airport, terminalLateral, longitudinal);
        terminalWindows.push({ ...point, y: this.heightAt(point.x, point.z) + (airport.runwayLaterals ? 23 : 7), width: airport.runwayLaterals ? 135 : airport.runwayWidth * 0.92, heading: airport.heading });
      }
      if (quality === 'high') {
        for (let i = 0; i < 2; i += 1) this.service.push({ airport, lateral: airport.apronLateral + 32, longitudinal: (i - 0.5) * 95, phase: i * 0.5 });
      }
    }
    const lightMesh = addInstanced(this.group, lightBox, edgeWhite, lights.length, 'runway-and-approach-lights');
    lights.forEach((point, index) => setInstance(lightMesh, index, point.x, point.y, point.z, dusk ? 1.25 : 0.7, 0.28, dusk ? 1.25 : 0.7));
    lightMesh.instanceMatrix.needsUpdate = true;
    const windowMaterial = dusk ? terminalWindowDusk : terminalWindowDay;
    const windowMesh = addInstanced(this.group, box, windowMaterial, terminalWindows.length, 'airport-terminal-window-glow');
    terminalWindows.forEach((point, index) => setInstance(windowMesh, index, point.x, point.y, point.z, 0.16, 4.2, point.width, point.heading));
    windowMesh.instanceMatrix.needsUpdate = true;

    const fuselages = addInstanced(this.group, box, aircraftWhite, parked.length, 'parked-aircraft-fuselages');
    const wings = addInstanced(this.group, box, aircraftWhite, parked.length, 'parked-aircraft-wings');
    const tails = addInstanced(this.group, box, aircraftWhite, parked.length, 'parked-aircraft-tails');
    parked.forEach((point, index) => {
      setInstance(fuselages, index, point.x, point.y, point.z, 3, 3, 25, point.heading);
      setInstance(wings, index, point.x, point.y + 0.8, point.z, 28, 0.9, 4.8, point.heading);
      const tailX = point.x - Math.sin(point.heading) * 9;
      const tailZ = point.z - Math.cos(point.heading) * 9;
      setInstance(tails, index, tailX, point.y + 3.2, tailZ, 2.2, 6.2, 2.2, point.heading);
    });
    for (const mesh of [fuselages, wings, tails]) mesh.instanceMatrix.needsUpdate = true;
  }

  private addRoofs(quality: CityVisualQuality, dusk: boolean): void {
    const sites = quality === 'low' ? this.config.rooftopSites.slice(0, 3) : this.config.rooftopSites;
    const hvac = addInstanced(this.group, box, roofDark, sites.length, 'rooftop-hvac');
    const gardens = addInstanced(this.group, box, roofGreen, sites.length, 'rooftop-gardens-and-solar');
    const solar = addInstanced(this.group, box, solarBlue, Math.ceil(sites.length / 2), 'rooftop-solar-arrays');
    const windowMaterial = dusk ? towerWindowDusk : towerWindowDay;
    const windows = addInstanced(this.group, box, windowMaterial, sites.length * 4, 'signature-tower-window-bands');
    const antennas = addInstanced(this.group, box, roofDark, sites.length, 'rooftop-antennas');
    sites.forEach((site, index) => {
      const y = this.heightAt(site.x, site.z) + site.height;
      setInstance(hvac, index, site.x - site.width * 0.18, y + 2.1, site.z, Math.min(14, site.width * 0.24), 4, Math.min(11, site.depth * 0.3));
      setInstance(gardens, index, site.x + site.width * 0.18, y + 0.2, site.z, Math.min(20, site.width * 0.32), 0.36, Math.min(14, site.depth * 0.34));
      if (index % 2 === 0) setInstance(solar, index / 2, site.x + site.width * 0.18, y + 0.46, site.z, Math.min(17, site.width * 0.28), 0.18, Math.min(12, site.depth * 0.3));
      setInstance(antennas, index, site.x - site.width * 0.28, y + 8, site.z - site.depth * 0.18, 0.6, 16, 0.6);
      for (let band = 0; band < 4; band += 1) {
        setInstance(windows, index * 4 + band, site.x, y - site.height * (0.14 + band * 0.18), site.z + site.depth * 0.5 + 0.42,
          site.width * 0.61, 1.45, 0.25);
      }
    });
    hvac.instanceMatrix.needsUpdate = true;
    gardens.instanceMatrix.needsUpdate = true;
    solar.instanceMatrix.needsUpdate = true;
    windows.instanceMatrix.needsUpdate = true;
    antennas.instanceMatrix.needsUpdate = true;
    if (sites.length) {
      const site = sites[sites.length - 1];
      const pad = new THREE.Mesh(helipadGeometry, arenaAccent);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(site.x, this.heightAt(site.x, site.z) + site.height + 0.45, site.z);
      this.group.add(pad);
    }
  }

  private addArena(arena: NonNullable<CityVisualConfig['arena']>): void {
    const y = this.heightAt(arena.x, arena.z);
    const parking = new THREE.Mesh(arenaParkingGeometry, arenaParking);
    parking.rotation.x = -Math.PI / 2;
    parking.scale.set(arena.radiusX * 1.65, arena.radiusZ * 1.65, 1);
    parking.position.set(arena.x, y + 0.18, arena.z);
    const shell = new THREE.Mesh(arenaShellGeometry, arenaShell);
    shell.scale.set(arena.radiusX, 1, arena.radiusZ);
    shell.position.set(arena.x, y + 34, arena.z);
    const roof = new THREE.Mesh(arenaRoofGeometry, arenaRoof);
    roof.scale.set(arena.radiusX * 0.96, 1, arena.radiusZ * 0.96);
    roof.position.set(arena.x, y + 69, arena.z);
    const roofRing = new THREE.Mesh(arenaRoofRingGeometry, arenaRoofRim);
    roofRing.rotation.x = -Math.PI / 2;
    roofRing.scale.set(arena.radiusX, arena.radiusZ, 1);
    roofRing.position.set(arena.x, y + 73.2, arena.z);
    const crown = new THREE.Mesh(arenaCrownGeometry, arenaAccent);
    crown.scale.set(arena.radiusX, arena.radiusZ, 1);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(arena.x, y + 73, arena.z);
    this.group.add(parking, shell, roof, roofRing, crown);
  }

  private addOrientationLandmarks(sites: NonNullable<CityVisualConfig['orientationSites']>): void {
    for (const site of sites) {
      const y = this.heightAt(site.x, site.z);
      if (site.kind === 'waterTower') {
        const stem = new THREE.Mesh(towerColumn, arenaShell);
        stem.scale.set(5, 52, 5);
        stem.position.set(site.x, y + 26, site.z);
        const tank = new THREE.Mesh(towerBowl, roofDark);
        tank.scale.set(20, 17, 20);
        tank.position.set(site.x, y + 60, site.z);
        this.group.add(stem, tank);
      } else if (site.kind === 'crane') {
        const mast = new THREE.Mesh(box, roofDark);
        mast.scale.set(3, 76, 3);
        mast.position.set(site.x, y + 38, site.z);
        const boom = new THREE.Mesh(box, arenaAccent);
        boom.scale.set(94, 2.2, 2.2);
        boom.position.set(site.x + 22, y + 73, site.z);
        this.group.add(mast, boom);
      } else {
        const mast = new THREE.Mesh(towerColumn, roofDark);
        mast.scale.set(3, 84, 3);
        mast.position.set(site.x, y + 42, site.z);
        const cap = new THREE.Mesh(box, arenaAccent);
        cap.scale.set(3, 6, 3);
        cap.position.set(site.x, y + 85, site.z);
        this.group.add(mast, cap);
      }
    }
  }

  update(delta: number): void {
    if (!this.frontLights || !this.rearLights || !this.serviceBodies) return;
    this.elapsed += delta;
    this.updateTimer += delta;
    if (this.updateTimer < 1 / 12) return;
    this.updateTimer %= 1 / 12;
    for (let i = 0; i < this.traffic.length; i += 1) {
      const route = this.traffic[i];
      const t = (route.phase + this.elapsed * 0.018 * route.direction + 1000) % 1;
      const x = route.x1 + route.dx * t;
      const z = route.z1 + route.dz * t;
      const y = THREE.MathUtils.lerp(route.y1, route.y2, t) + 1.7;
      const length = Math.hypot(route.dx, route.dz) || 1;
      const ox = route.dx / length * route.direction * 2.2;
      const oz = route.dz / length * route.direction * 2.2;
      setInstance(this.frontLights, i, x + ox, y, z + oz, 2, 0.65, 1.2);
      setInstance(this.rearLights, i, x - ox, y, z - oz, 1.8, 0.62, 1.1);
    }
    this.frontLights.instanceMatrix.needsUpdate = true;
    this.rearLights.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.service.length; i += 1) {
      const vehicle = this.service[i];
      const along = vehicle.longitudinal + Math.sin(this.elapsed * 0.28 + vehicle.phase * Math.PI * 2) * 48;
      const c = Math.cos(vehicle.airport.heading);
      const s = Math.sin(vehicle.airport.heading);
      const x = vehicle.airport.x + vehicle.lateral * c + along * s;
      const z = vehicle.airport.z - vehicle.lateral * s + along * c;
      setInstance(this.serviceBodies, i, x, this.heightAt(x, z) + 1.6, z, 5, 2.8, 9, vehicle.airport.heading);
    }
    this.serviceBodies.instanceMatrix.needsUpdate = true;
  }

  dispose(): void { this.group.removeFromParent(); }
}
