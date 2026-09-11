import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Node does not expose FileReader, but GLTFExporter only needs these two
// asynchronous Blob conversions for a texture-free binary GLB.
globalThis.FileReader ??= class FileReader {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const outputDirectory = path.resolve('public/assets/models/aircraft');
const exporter = new GLTFExporter();
const vector = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const euler = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

function cleanGeometry(source, position = vector(), rotation = euler(), scale = vector(1, 1, 1)) {
  let geometry = source.clone();
  if (geometry.index) geometry = geometry.toNonIndexed();
  for (const key of Object.keys(geometry.attributes)) {
    if (key !== 'position' && key !== 'normal') geometry.deleteAttribute(key);
  }
  const matrix = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
  geometry.applyMatrix4(matrix);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  return geometry;
}

function wingGeometry(halfSpan, rootChord, tipChord, sweep, thickness) {
  const shape = new THREE.Shape();
  const points = [
    [-halfSpan, sweep - tipChord * 0.5], [0, -rootChord * 0.5],
    [halfSpan, sweep - tipChord * 0.5], [halfSpan, sweep + tipChord * 0.5],
    [0, rootChord * 0.5], [-halfSpan, sweep + tipChord * 0.5],
  ];
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, steps: 1, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(Math.PI * 0.5);
  geometry.translate(0, thickness * 0.5, 0);
  return geometry;
}

function asymmetricWingGeometry(halfSpan, rootChord, tipChord, leadingSweep, trailingSweep, thickness) {
  const shape = new THREE.Shape();
  const points = [
    [-halfSpan, leadingSweep], [0, -rootChord * 0.5], [halfSpan, leadingSweep],
    [halfSpan, trailingSweep + tipChord], [0, rootChord * 0.5], [-halfSpan, trailingSweep + tipChord],
  ];
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, steps: 1, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(Math.PI * 0.5);
  geometry.translate(0, thickness * 0.5, 0);
  return geometry;
}

function finGeometry(height, rootChord, tipChord, rake, thickness) {
  const shape = new THREE.Shape();
  // Shape X maps to -Z after rotation; these points describe world Z/Y.
  const worldPoints = [
    [-rootChord * 0.5, 0], [rootChord * 0.5, 0],
    [rootChord * 0.5 - rake, height], [rootChord * 0.5 - rake - tipChord, height],
  ];
  shape.moveTo(-worldPoints[0][0], worldPoints[0][1]);
  for (let index = 1; index < worldPoints.length; index += 1) shape.lineTo(-worldPoints[index][0], worldPoints[index][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, steps: 1, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateY(Math.PI * 0.5);
  geometry.translate(-thickness * 0.5, 0, 0);
  return geometry;
}

const materialSlots = Object.freeze({
  base: 'AC_LIVERY_BASE', primary: 'AC_LIVERY_PRIMARY', accent: 'AC_LIVERY_ACCENT',
  glass: 'AC_GLASS', dark: 'AC_DARK', metal: 'AC_METAL',
});

function createMaterials(palette) {
  const make = (slot, color, roughness, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    material.name = materialSlots[slot];
    return material;
  };
  return {
    base: make('base', palette.base, 0.42, 0.06),
    primary: make('primary', palette.primary, 0.36, 0.08),
    accent: make('accent', palette.accent, 0.4, 0.05),
    glass: make('glass', palette.glass ?? 0x102b3b, 0.16, 0.28),
    dark: make('dark', palette.dark ?? 0x20282c, 0.55, 0.12),
    metal: make('metal', palette.metal ?? 0x8e989b, 0.34, 0.5),
  };
}

class AirframeBuilder {
  constructor(name, palette) {
    this.name = name;
    this.materials = createMaterials(palette);
    this.parts = new Map(Object.keys(this.materials).map((key) => [key, []]));
    this.dynamic = [];
  }
  add(slot, geometry, position = vector(), rotation = euler(), scale = vector(1, 1, 1)) {
    this.parts.get(slot).push(cleanGeometry(geometry, position, rotation, scale));
  }
  box(slot, size, position, rotation = euler()) {
    this.add(slot, new THREE.BoxGeometry(1, 1, 1), position, rotation, size);
  }
  capsule(slot, radius, straightLength, position, scale = vector(1, 1, 1)) {
    this.add(slot, new THREE.CapsuleGeometry(radius, straightLength, 3, 12), position, euler(Math.PI * 0.5, 0, 0), scale);
  }
  sphere(slot, scale, position, rotation = euler()) {
    this.add(slot, new THREE.SphereGeometry(1, 12, 7), position, rotation, scale);
  }
  cylinder(slot, radiusFront, radiusRear, length, position, rotation = euler(Math.PI * 0.5, 0, 0)) {
    // After X rotation, CylinderGeometry's -Y end is the forward (-Z) end.
    this.add(slot, new THREE.CylinderGeometry(radiusRear, radiusFront, length, 12, 1, false), position, rotation);
  }
  cone(slot, radius, length, position, forward = true) {
    this.add(slot, new THREE.ConeGeometry(radius, length, 12), position, euler(forward ? -Math.PI * 0.5 : Math.PI * 0.5, 0, 0));
  }
  wing(slot, halfSpan, rootChord, tipChord, sweep, thickness, position, rotation = euler()) {
    this.add(slot, wingGeometry(halfSpan, rootChord, tipChord, sweep, thickness), position, rotation);
  }
  propeller(name, position, radius, bladeWidth = 0.12) {
    const group = new THREE.Group();
    group.name = name;
    group.position.copy(position);
    const pieces = [
      cleanGeometry(new THREE.CylinderGeometry(radius * 0.16, radius * 0.22, radius * 0.42, 10), vector(), euler(Math.PI * 0.5, 0, 0)),
      cleanGeometry(new THREE.BoxGeometry(1, 1, 1), vector(0, radius * 0.48, 0), euler(0, 0, 0.1), vector(bladeWidth, radius * 0.84, bladeWidth * 0.42)),
      cleanGeometry(new THREE.BoxGeometry(1, 1, 1), vector(0, -radius * 0.48, 0), euler(0, 0, 0.1), vector(bladeWidth, radius * 0.84, bladeWidth * 0.42)),
      cleanGeometry(new THREE.BoxGeometry(1, 1, 1), vector(radius * 0.48, 0, 0), euler(0, 0, 0.1), vector(radius * 0.84, bladeWidth, bladeWidth * 0.42)),
      cleanGeometry(new THREE.BoxGeometry(1, 1, 1), vector(-radius * 0.48, 0, 0), euler(0, 0, 0.1), vector(radius * 0.84, bladeWidth, bladeWidth * 0.42)),
    ];
    const mesh = new THREE.Mesh(mergeGeometries(pieces, false), this.materials.dark);
    mesh.name = `${name}_Blades`;
    group.add(mesh);
    this.dynamic.push(group);
  }
  wheel(position, radius, width = 0.14) {
    this.add('dark', new THREE.CylinderGeometry(radius, radius, width, 10), position, euler(0, 0, Math.PI * 0.5));
  }
  finish() {
    const root = new THREE.Group();
    root.name = this.name;
    root.userData.airportChaosOriginal = true;
    root.userData.forwardAxis = '-Z';
    root.userData.liverySlots = Object.values(materialSlots);
    for (const [slot, geometries] of this.parts) {
      if (geometries.length === 0) continue;
      const geometry = mergeGeometries(geometries, false);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.materials[slot]);
      mesh.name = materialSlots[slot];
      root.add(mesh);
    }
    for (const object of this.dynamic) root.add(object);
    return root;
  }
}

function landingGear(builder, mainX, mainZ, noseZ, bottomY, wheelRadius) {
  for (const [x, z] of [[-mainX, mainZ], [mainX, mainZ], [0, noseZ]]) {
    builder.cylinder('metal', 0.045, 0.045, 0.65, vector(x, bottomY + 0.32, z), euler(0, 0, 0));
    builder.wheel(vector(x, bottomY, z), wheelRadius, wheelRadius * 0.48);
  }
}

function buildScout() {
  const b = new AirframeBuilder('Skyrift_Scout', { base: 0xf1f5f4, primary: 0x1769b8, accent: 0x73b9e8, glass: 0x15354a });
  b.capsule('base', 0.56, 3.9, vector(0, 0.1, 0.1), vector(1, 0.96, 1));
  b.cone('primary', 0.54, 1.35, vector(0, 0.08, -2.55), true);
  b.cylinder('base', 0.48, 0.22, 1.15, vector(0, 0.12, 2.45));
  b.sphere('glass', vector(0.48, 0.34, 0.76), vector(0, 0.48, -1.02), euler(-0.08, 0, 0));
  b.wing('base', 4.2, 1.34, 0.72, 0.12, 0.13, vector(0, 0.76, -0.05));
  b.wing('primary', 4.15, 0.24, 0.2, 0.12, 0.025, vector(0, 0.84, -0.5));
  b.wing('base', 1.65, 0.84, 0.42, 0.12, 0.1, vector(0, 0.28, 2.35));
  b.add('primary', finGeometry(1.42, 1.12, 0.34, 0.34, 0.11), vector(0, 0.28, 2.2));
  b.box('primary', vector(0.08, 0.22, 3.2), vector(-0.57, 0.02, 0.02));
  b.box('accent', vector(0.08, 0.13, 2.9), vector(0.57, -0.14, 0.12));
  for (const side of [-1, 1]) {
    b.cylinder('metal', 0.035, 0.035, 1.25, vector(side * 1.75, 0.15, 0.18), euler(0, 0, side * 0.72));
  }
  landingGear(b, 1.02, 0.42, -1.68, -0.56, 0.22);
  b.propeller('Propeller_Main', vector(0, 0.08, -3.28), 0.92, 0.11);
  return b.finish();
}

function buildCargo() {
  const b = new AirframeBuilder('Gravitas_Cargo', { base: 0xbda77a, primary: 0x7e6843, accent: 0xd3bd8b, glass: 0x213238, dark: 0x292d29 });
  b.capsule('base', 0.88, 6.15, vector(0, 0.08, 0.18), vector(1.04, 1, 1));
  b.cone('primary', 0.82, 1.32, vector(0, 0.0, -3.72), true);
  b.cylinder('base', 0.77, 0.38, 1.2, vector(0, 0.12, 3.72));
  b.sphere('glass', vector(0.72, 0.36, 0.72), vector(0, 0.42, -3.02), euler(-0.14, 0, 0));
  b.wing('primary', 5.75, 1.78, 0.88, 0.36, 0.22, vector(0, 0.73, -0.2));
  b.wing('accent', 5.7, 0.22, 0.16, 0.49, 0.035, vector(0, 0.86, -0.92));
  b.wing('primary', 2.25, 1.16, 0.56, 0.22, 0.14, vector(0, 0.53, 3.52));
  // Twin fins make Gravitas immediately distinct from familiar single-tail transports.
  for (const side of [-1, 1]) {
    b.add('primary', finGeometry(1.15, 1.25, 0.42, 0.36, 0.12), vector(side * 1.1, 0.35, 3.42), euler(0, 0, side * -0.08));
  }
  for (const [index, x] of [-3.85, -2.05, 2.05, 3.85].entries()) {
    const z = Math.abs(x) > 3 ? 0.16 : -0.28;
    b.cylinder('primary', 0.37, 0.3, 1.38, vector(x, 0.45, z));
    b.sphere('dark', vector(0.31, 0.31, 0.14), vector(x, 0.45, z - 0.72));
    b.propeller(`Propeller_${index + 1}`, vector(x, 0.45, z - 0.84), Math.abs(x) > 3 ? 0.74 : 0.82, 0.095);
  }
  b.box('primary', vector(0.08, 0.3, 5.4), vector(-0.91, -0.06, 0.18));
  b.box('accent', vector(0.08, 0.14, 5.9), vector(0.91, 0.18, 0.0));
  // Rugged side gear fairings keep the gear readable without a complicated mechanism.
  for (const side of [-1, 1]) b.capsule('primary', 0.2, 1.5, vector(side * 0.87, -0.67, 1.05), vector(1, 0.78, 1));
  landingGear(b, 0.92, 1.35, -2.7, -0.68, 0.28);
  return b.finish();
}

function buildWayfarer() {
  const b = new AirframeBuilder('Wayfarer_Jet', { base: 0xeff1e5, primary: 0x285d3d, accent: 0x78a46b, glass: 0x122e36, dark: 0x27302c });
  b.capsule('base', 0.62, 6.7, vector(0, 0.08, -0.08), vector(1, 0.95, 1));
  b.cone('base', 0.59, 1.22, vector(0, 0.07, -4.02), true);
  b.cylinder('primary', 0.54, 0.2, 1.08, vector(0, 0.1, 3.98));
  b.sphere('glass', vector(0.54, 0.25, 0.68), vector(0, 0.43, -3.52), euler(-0.15, 0, 0));
  b.add('primary', asymmetricWingGeometry(3.6, 1.42, 0.48, 0.82, 0.58, 0.12), vector(0, 0.02, 0.05));
  b.wing('accent', 3.55, 0.18, 0.12, 0.72, 0.025, vector(0, 0.1, -0.53));
  // Clipped upturned tips provide a recognizable Wayfarer silhouette.
  for (const side of [-1, 1]) {
    b.box('primary', vector(0.13, 0.62, 0.42), vector(side * 3.53, 0.35, 0.82), euler(0.18 * side, 0, side * -0.22));
    b.cylinder('primary', 0.38, 0.31, 1.48, vector(side * 2.05, -0.5, 0.2));
    b.add('dark', new THREE.TorusGeometry(0.31, 0.055, 5, 12), vector(side * 2.05, -0.5, -0.55));
  }
  // A shallow V-tail avoids borrowing a conventional narrow-body tail.
  for (const side of [-1, 1]) {
    b.add('primary', finGeometry(1.2, 1.18, 0.34, 0.36, 0.11), vector(side * 0.42, 0.25, 3.55), euler(0, 0, side * -0.34));
  }
  b.box('primary', vector(0.07, 0.26, 6.5), vector(-0.63, -0.16, -0.1));
  b.box('accent', vector(0.07, 0.11, 6.0), vector(0.63, 0.2, -0.25));
  for (const side of [-1, 1]) {
    for (let index = 0; index < 7; index += 1) {
      b.sphere('glass', vector(0.035, 0.085, 0.13), vector(side * 0.625, 0.25, -2.0 + index * 0.62));
    }
  }
  landingGear(b, 1.2, 0.85, -2.55, -0.65, 0.2);
  return b.finish();
}

function buildRedspear() {
  const b = new AirframeBuilder('Redspear_Fighter', { base: 0xc82332, primary: 0x6d101b, accent: 0xf1d8c5, glass: 0x101e29, dark: 0x22262b, metal: 0x657077 });
  b.capsule('base', 0.48, 5.35, vector(0, 0.03, 0.1), vector(1.08, 0.86, 1));
  b.cone('primary', 0.46, 2.05, vector(0, -0.03, -3.28), true);
  b.cylinder('dark', 0.46, 0.58, 1.05, vector(0, -0.07, 3.68));
  b.add('metal', new THREE.TorusGeometry(0.46, 0.08, 6, 14), vector(0, -0.07, 4.22));
  b.sphere('glass', vector(0.52, 0.38, 1.18), vector(0, 0.48, -1.3), euler(-0.08, 0, 0));
  // Cranked arrow wings and forward strakes form an original spear-like planform.
  b.add('base', asymmetricWingGeometry(3.4, 2.12, 0.3, 1.05, 0.78, 0.1), vector(0, -0.02, 0.0));
  b.add('primary', asymmetricWingGeometry(1.55, 2.7, 0.28, -0.42, 0.62, 0.08), vector(0, 0.04, -1.15));
  b.wing('accent', 3.15, 0.19, 0.1, 1.0, 0.025, vector(0, 0.08, -0.32));
  // Split cheek intakes, not a single chin intake.
  for (const side of [-1, 1]) {
    b.cylinder('dark', 0.25, 0.31, 1.28, vector(side * 0.55, -0.25, -0.12));
    b.add('primary', finGeometry(1.28, 1.18, 0.3, 0.35, 0.1), vector(side * 0.56, 0.12, 2.75), euler(0, 0, side * -0.2));
    b.box('accent', vector(0.12, 0.16, 2.8), vector(side * 0.5, 0.08, -0.25), euler(0, side * 0.09, 0));
  }
  b.wing('primary', 1.8, 0.92, 0.32, 0.28, 0.09, vector(0, 0.02, 2.82));
  landingGear(b, 0.9, 0.72, -2.35, -0.78, 0.17);
  return b.finish();
}

const aircraft = [
  ['trainer.glb', buildScout()],
  ['cargo.glb', buildCargo()],
  ['private-jet.glb', buildWayfarer()],
  ['fighter.glb', buildRedspear()],
];

async function exportBinary(root) {
  root.updateMatrixWorld(true);
  return new Promise((resolve, reject) => exporter.parse(root, resolve, reject, {
    binary: true,
    onlyVisible: false,
    trs: true,
    includeCustomExtensions: false,
  }));
}

await fs.mkdir(outputDirectory, { recursive: true });
for (const [filename, root] of aircraft) {
  const binary = await exportBinary(root);
  await fs.writeFile(path.join(outputDirectory, filename), Buffer.from(binary));
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  console.log(`${filename}: ${Buffer.byteLength(binary)} bytes, ${root.children.length} nodes, bounds ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
}
