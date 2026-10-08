import * as THREE from 'three';
import type { CityVisualQuality } from './city-visuals';

type RiverSegment = { polygon?: readonly (readonly [number, number])[]; surfaceY: number };
type ScenicObject = { group: THREE.Group; distance: number };

// Visual scenery only: no collision, rewards, networking, or new render loop.
// The existing low balloons stay in place; the added grid spans roughly
// 5k–45k ft across Dallas without introducing moving or networked entities.
const balloonSites: ReadonlyArray<readonly [number, number, number]> = [
  [-18_000, -4_000, 730], [-15_000, 12_000, 1_650], [-11_000, -16_000, 1_120],
  [-9_000, 7_000, 2_650], [-3_000, -16_000, 1_850], [-1_000, 19_000, 950],
  [3_000, -12_500, 820], [3_500, 9_000, 1_700], [8_500, 18_000, 2_950],
  [11_000, -5_000, 2_450], [14_000, 5_000, 1_200], [18_000, -15_000, 2_900],
  [19_000, 15_000, 1_600], [-20_000, 17_000, 2_500],
  ...[1_650, 7_700, 13_716].flatMap((altitude, band) =>
    [-19_000, -6_000, 7_000, 20_000].flatMap((x) =>
      [-19_000, -6_000, 7_000, 20_000].map((z) =>
        [x + 2_200, z - 2_000, altitude + (band === 0 ? 150 : 0)] as const),
    ),
  ),
];

export class DallasScenery {
  private readonly root = new THREE.Group();
  private readonly balloons: ScenicObject[] = [];
  private readonly boats: ScenicObject[] = [];
  private readonly balloonGeometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly ropeGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-9, -23, -7), new THREE.Vector3(-5, -40, -4),
    new THREE.Vector3(9, -23, -7), new THREE.Vector3(5, -40, -4),
    new THREE.Vector3(-9, -23, 7), new THREE.Vector3(-5, -40, 4),
    new THREE.Vector3(9, -23, 7), new THREE.Vector3(5, -40, 4),
  ]);
  private readonly envelopeMaterials = [0xf8b845, 0x48c5e6, 0xf17c64, 0x9a8dea].map((color) =>
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.08 }));
  private readonly basketMaterial = new THREE.MeshLambertMaterial({ color: 0x8c6843 });
  private readonly ropeMaterial = new THREE.LineBasicMaterial({ color: 0xe8d8b9 });
  private readonly hullMaterial = new THREE.MeshLambertMaterial({ color: 0xf0f4e9 });
  private readonly boatAccentMaterial = new THREE.MeshLambertMaterial({ color: 0x2476aa });
  private updateClock = 0;

  constructor(
    private readonly scene: THREE.Scene,
    river: ReadonlyArray<RiverSegment>,
    heightAt: (x: number, z: number) => number,
    private readonly quality: CityVisualQuality,
  ) {
    this.root.name = 'dallas-scenic-balloons-and-boats';
    balloonSites.forEach(([x, z, altitude], index) => {
      const group = new THREE.Group();
      group.name = `dallas-balloon-${index + 1}`;
      group.position.set(x, heightAt(x, z) + altitude, z);
      if (altitude >= 7_000) group.scale.setScalar(1.6);
      const envelope = new THREE.Mesh(this.balloonGeometry, this.envelopeMaterials[index % this.envelopeMaterials.length]);
      envelope.scale.set(29, 34, 29);
      group.add(envelope);
      const basket = new THREE.Mesh(this.boxGeometry, this.basketMaterial);
      basket.scale.set(12, 9, 10);
      basket.position.y = -44;
      group.add(basket, new THREE.LineSegments(this.ropeGeometry, this.ropeMaterial));
      this.root.add(group);
      this.balloons.push({ group, distance: Infinity });
    });

    // The boats sit on the authored Trinity water ribbon, never in the sky.
    river.forEach((segment, index) => {
      const corners = segment.polygon;
      if (!corners || corners.length !== 4) return;
      const startX = (corners[0][0] + corners[3][0]) * 0.5;
      const startZ = (corners[0][1] + corners[3][1]) * 0.5;
      const endX = (corners[1][0] + corners[2][0]) * 0.5;
      const endZ = (corners[1][1] + corners[2][1]) * 0.5;
      for (const [boatIndex, t] of [0.3, 0.72].entries()) {
        const group = new THREE.Group();
        group.name = `dallas-trinity-boat-${index}-${boatIndex}`;
        group.position.set(THREE.MathUtils.lerp(startX, endX, t), segment.surfaceY + 1.4, THREE.MathUtils.lerp(startZ, endZ, t));
        group.rotation.y = Math.atan2(endX - startX, endZ - startZ) + (boatIndex ? Math.PI : 0);
        const hull = new THREE.Mesh(this.boxGeometry, boatIndex ? this.boatAccentMaterial : this.hullMaterial);
        hull.scale.set(9, 4, 25);
        const cabin = new THREE.Mesh(this.boxGeometry, boatIndex ? this.hullMaterial : this.boatAccentMaterial);
        cabin.scale.set(6.5, 6, 9);
        cabin.position.set(0, 4, -2);
        group.add(hull, cabin);
        this.root.add(group);
        this.boats.push({ group, distance: Infinity });
      }
    });
    this.scene.add(this.root);
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    this.updateClock += delta;
    if (this.updateClock < 0.25) return;
    this.updateClock = 0;
    const updateVisible = (objects: ScenicObject[], range: number, limit: number) => {
      for (const object of objects) object.distance = object.group.position.distanceTo(playerPosition);
      objects.sort((a, b) => a.distance - b.distance);
      objects.forEach((object, index) => { object.group.visible = index < limit && object.distance < range; });
    };
    updateVisible(this.balloons, 12_000, this.quality === 'high' ? 8 : 5);
    updateVisible(this.boats, 6_500, this.quality === 'high' ? 10 : 6);
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.root.clear();
    this.balloonGeometry.dispose();
    this.boxGeometry.dispose();
    this.ropeGeometry.dispose();
    for (const material of this.envelopeMaterials) material.dispose();
    this.basketMaterial.dispose();
    this.ropeMaterial.dispose();
    this.hullMaterial.dispose();
    this.boatAccentMaterial.dispose();
  }
}
