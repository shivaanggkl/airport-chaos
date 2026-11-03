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

// Bluejay's source geometry is authored here and baked into trainer.glb. The
// model keeps the same -Z forward axis and livery material names as the other
// airframes, while sharing each material across all of its static details.
function indexedGeometry(vertices, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function scoutFuselage(sections) {
  const vertices = [];
  const indices = [];
  const radial = 32;
  for (const section of sections) {
    for (let j = 0; j < radial; j += 1) {
      const angle = j * Math.PI * 2 / radial;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      // A gently squared ellipse makes the cabin readable without hard edges.
      vertices.push(
        section.width * Math.sign(c) * Math.abs(c) ** 0.82,
        section.centerY + section.height * Math.sign(s) * Math.abs(s) ** 0.82,
        section.z,
      );
    }
  }
  for (let i = 0; i < sections.length - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * radial + j;
      const b = i * radial + (j + 1) % radial;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + (j + 1) % radial;
      indices.push(a, b, c, b, d, c);
    }
  }
  return indexedGeometry(vertices, indices);
}

function scoutNoseCowling(sections) {
  const vertices = [];
  const indices = [];
  const steps = 32;
  for (const section of sections) {
    for (let j = 0; j <= steps; j += 1) {
      const angle = THREE.MathUtils.lerp(section.startAngle, Math.PI - section.startAngle, j / steps);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      vertices.push(
        (section.width + 0.018) * Math.sign(c) * Math.abs(c) ** 0.82,
        section.centerY + (section.height + 0.018) * Math.sign(s) * Math.abs(s) ** 0.82,
        section.z,
      );
    }
  }
  for (let i = 0; i < sections.length - 1; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const a = i * (steps + 1) + j;
      const c = a + steps + 1;
      indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  return indexedGeometry(vertices, indices);
}

function scoutSurfacePatch(side, sideSurfaceX, stations, offset) {
  const vertices = [];
  const indices = [];
  for (const [z, lower, upper] of stations) {
    for (let j = 0; j < 5; j += 1) {
      const y = THREE.MathUtils.lerp(lower, upper, j / 4);
      vertices.push(side * sideSurfaceX(z, y, offset), y, z);
    }
  }
  for (let i = 0; i < stations.length - 1; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const a = i * 5 + j;
      const c = a + 5;
      if (side > 0) indices.push(a, a + 1, c, a + 1, c + 1, c);
      else indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  return indexedGeometry(vertices, indices);
}

const scoutCabinStations = [
  { z: -1.45, width: 0.55, roofY: 0.94 },
  { z: -1.10, width: 0.59, roofY: 0.99 },
  { z: -0.25, width: 0.60, roofY: 1.00 },
  { z: 0.35, width: 0.57, roofY: 0.96 },
  { z: 0.55, width: 0.52, roofY: 0.83 },
  { z: 0.76, width: 0.45, roofY: 0.55 },
];
const scoutCabinProfile = [
  [0, 1], [0.32, 1.05], [0.62, 1.03], [0.78, 0.96],
  [0.90, 0.80], [0.97, 0.55], [1, 0],
];

function scoutCabinSidePoint(side, z, height, offset = 0) {
  const index = Math.max(0, scoutCabinStations.findIndex(station => station.z >= z) - 1);
  const a = scoutCabinStations[index];
  const b = scoutCabinStations[Math.min(index + 1, scoutCabinStations.length - 1)];
  const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
  const width = THREE.MathUtils.lerp(a.width, b.width, t);
  const roofY = THREE.MathUtils.lerp(a.roofY, b.roofY, t);
  const profileIndex = Math.max(0, scoutCabinProfile.findIndex(point => point[0] >= height) - 1);
  const [lowHeight, lowWidth] = scoutCabinProfile[profileIndex];
  const [highHeight, highWidth] = scoutCabinProfile[Math.min(profileIndex + 1, scoutCabinProfile.length - 1)];
  const fraction = highHeight === lowHeight ? 0 : (height - lowHeight) / (highHeight - lowHeight);
  return [side * (width * THREE.MathUtils.lerp(lowWidth, highWidth, fraction) + offset),
    THREE.MathUtils.lerp(0.15, roofY, height), z];
}

function scoutCabinShell() {
  const vertices = [];
  const indices = [];
  const heights = [0, 0.16, 0.32, 0.47, 0.62, 0.70, 0.78, 0.84, 0.90, 0.95, 0.97, 1];
  const perimeter = heights.length * 2 - 1;
  for (const station of scoutCabinStations) {
    for (const height of heights) vertices.push(...scoutCabinSidePoint(-1, station.z, height));
    for (const height of heights.slice(0, -1).reverse())
      vertices.push(...scoutCabinSidePoint(1, station.z, height));
  }
  for (let i = 0; i < scoutCabinStations.length - 1; i += 1) {
    for (let j = 0; j < perimeter - 1; j += 1) {
      const a = i * perimeter + j;
      const c = a + perimeter;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const rearCenter = vertices.length / 3;
  vertices.push(0, 0.15, scoutCabinStations.at(-1).z);
  const last = (scoutCabinStations.length - 1) * perimeter;
  for (let j = 0; j < perimeter - 1; j += 1) indices.push(rearCenter, last + j, last + j + 1);
  return indexedGeometry(vertices, indices);
}

function scoutWindshieldPoint(horizontal, height, offset = 0) {
  const side = Math.abs(horizontal);
  const roofY = 0.94 - 0.08 * side * side;
  const roofHeight = (roofY - 0.15) / (0.94 - 0.15);
  const roofX = side === 0 ? 0 : scoutCabinSidePoint(Math.sign(horizontal), -1.45, roofHeight)[0];
  return [THREE.MathUtils.lerp(horizontal * 0.54, roofX, height),
    THREE.MathUtils.lerp(0.46 - 0.04 * side, roofY, height),
    THREE.MathUtils.lerp(-2.04 + 0.03 * side, -1.45, height) - offset];
}

function scoutSurfaceGrid(surface, uSteps, vSteps, reverse) {
  const vertices = [];
  const indices = [];
  for (let row = 0; row <= vSteps; row += 1) {
    for (let column = 0; column <= uSteps; column += 1)
      vertices.push(...surface(column / uSteps, row / vSteps));
  }
  for (let row = 0; row < vSteps; row += 1) {
    for (let column = 0; column < uSteps; column += 1) {
      const a = row * (uSteps + 1) + column;
      const c = a + uSteps + 1;
      if (reverse) indices.push(a, c, a + 1, a + 1, c, c + 1);
      else indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  return indexedGeometry(vertices, indices);
}

function scoutRoundedWindow(surface, uStart, uEnd, vStart, vEnd, cornerU, cornerV, reverse) {
  const vertices = [];
  const indices = [];
  const rows = [0, 0.5, 1, -1, -0.5, 0];
  for (let row = 0; row < rows.length; row += 1) {
    const lower = row < 3;
    const v = lower ? vStart + cornerV * rows[row] : vEnd + cornerV * rows[row];
    const inset = row === 0 || row === 5 ? cornerU : row === 1 || row === 4 ? cornerU * 0.35 : 0;
    for (let column = 0; column <= 8; column += 1) {
      const u = THREE.MathUtils.lerp(uStart + inset, uEnd - inset, column / 8);
      vertices.push(...surface(u, v));
    }
  }
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const a = row * 9 + column;
      const c = a + 9;
      if (reverse) indices.push(a, c, a + 1, a + 1, c, c + 1);
      else indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  return indexedGeometry(vertices, indices);
}

const scoutAirfoilProfile = [
  [0, 0], [0.055, 0.55], [0.20, 0.92], [0.42, 1],
  [0.68, 0.72], [0.88, 0.30], [1, 0],
  [0.82, -0.25], [0.48, -0.40], [0.14, -0.30],
];

function scoutAirfoil(side, span, start, end, rootLead, tipLead, rootChord, tipChord, rootY, tipY, capTip = false) {
  const vertices = [];
  const indices = [];
  const profile = scoutAirfoilProfile;
  const stations = 5;
  for (let i = 0; i < stations; i += 1) {
    const t = start + (end - start) * i / (stations - 1);
    const chord = THREE.MathUtils.lerp(rootChord, tipChord, t);
    const lead = THREE.MathUtils.lerp(rootLead, tipLead, t);
    const y = THREE.MathUtils.lerp(rootY, tipY, t);
    const thickness = THREE.MathUtils.lerp(0.16, 0.075, t) * (span > 2 ? 1 : 0.55);
    for (const [chordFraction, height] of profile) {
      vertices.push(side * span * t, y + height * thickness, lead + chordFraction * chord);
    }
  }
  const perimeter = profile.length;
  for (let i = 0; i < stations - 1; i += 1) {
    for (let j = 0; j < perimeter; j += 1) {
      const a = i * perimeter + j;
      const b = i * perimeter + (j + 1) % perimeter;
      const c = (i + 1) * perimeter + j;
      const d = (i + 1) * perimeter + (j + 1) % perimeter;
      if (side > 0) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  if (capTip) {
    const chord = THREE.MathUtils.lerp(rootChord, tipChord, end);
    const lead = THREE.MathUtils.lerp(rootLead, tipLead, end);
    const y = THREE.MathUtils.lerp(rootY, tipY, end);
    const center = vertices.length / 3;
    vertices.push(side * span * end, y, lead + chord * 0.5);
    const tip = (stations - 1) * perimeter;
    for (let j = 0; j < perimeter; j += 1) {
      const next = (j + 1) % perimeter;
      if (side > 0) indices.push(center, tip + j, tip + next);
      else indices.push(center, tip + next, tip + j);
    }
  }
  return indexedGeometry(vertices, indices);
}

function scoutTailplaneCenter() {
  const vertices = [];
  const indices = [];
  const span = 1.66;
  const stations = 11;
  const profile = scoutAirfoilProfile;
  for (let i = 0; i < stations; i += 1) {
    const station = -0.83 + 1.66 * i / (stations - 1);
    const t = Math.abs(station);
    const chord = THREE.MathUtils.lerp(0.83, 0.47, t);
    const lead = THREE.MathUtils.lerp(2.23, 2.42, t);
    const y = THREE.MathUtils.lerp(0.30, 0.34, t);
    const thickness = THREE.MathUtils.lerp(0.16, 0.075, t) * 0.55;
    for (const [chordFraction, height] of profile) {
      vertices.push(span * station, y + height * thickness, lead + chordFraction * chord);
    }
  }
  const perimeter = profile.length;
  for (let i = 0; i < stations - 1; i += 1) {
    for (let j = 0; j < perimeter; j += 1) {
      const a = i * perimeter + j;
      const b = i * perimeter + (j + 1) % perimeter;
      const c = (i + 1) * perimeter + j;
      const d = (i + 1) * perimeter + (j + 1) % perimeter;
      indices.push(a, b, c, b, d, c);
    }
  }
  return indexedGeometry(vertices, indices);
}

function scoutWingStripe(side) {
  const vertices = [];
  const indices = [];
  const upper = (chord) => chord < 0.055 ? chord / 0.055 * 0.55
    : 0.55 + (chord - 0.055) / 0.145 * 0.37;
  for (const t of [0.14, 0.33, 0.54, 0.72, 0.84]) {
    const chord = THREE.MathUtils.lerp(1.42, 0.73, t);
    const lead = THREE.MathUtils.lerp(-0.78, -0.48, t);
    const y = THREE.MathUtils.lerp(1.03, 1.18, t);
    const thickness = THREE.MathUtils.lerp(0.16, 0.075, t);
    for (const fraction of [0.075, 0.16]) {
      vertices.push(side * 4.2 * t, y + upper(fraction) * thickness + 0.007, lead + fraction * chord);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const a = i * 2;
    if (side > 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return indexedGeometry(vertices, indices);
}

function scoutPanel(points, outward = 1) {
  const vertices = points.flatMap(([x, y, z]) => [x, y, z]);
  const indices = outward > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  return indexedGeometry(vertices, indices);
}

function scoutBeam(builder, slot, start, end, radius) {
  const direction = end.clone().sub(start);
  const center = start.clone().add(end).multiplyScalar(0.5);
  const orientation = new THREE.Quaternion().setFromUnitVectors(vector(0, 1, 0), direction.clone().normalize());
  builder.add(slot, new THREE.CylinderGeometry(radius * 0.8, radius, direction.length(), 10),
    center, new THREE.Euler().setFromQuaternion(orientation));
}

function scoutFin() {
  const outline = [
    [1.80, 0.18], [3.05, 0.26], [3.13, 0.47],
    [3.00, 1.35], [2.72, 1.40], [2.48, 1.30],
  ];
  const vertices = [];
  const indices = [];
  for (const x of [-0.075, 0.075]) for (const [z, y] of outline) vertices.push(x, y, z);
  for (let i = 1; i < outline.length - 1; i += 1) {
    indices.push(0, i, i + 1, outline.length, outline.length + i + 1, outline.length + i);
  }
  for (let i = 0; i < outline.length; i += 1) {
    const next = (i + 1) % outline.length;
    indices.push(i, outline.length + i, next, next, outline.length + i, outline.length + next);
  }
  return indexedGeometry(vertices, indices);
}

function scoutPropeller(builder) {
  const pivot = new THREE.Group();
  pivot.name = 'Propeller_Main';
  pivot.position.set(0, 0.04, -3.03);
  const vertices = [];
  const indices = [];
  const stations = [[0.10, 0.065, 0], [0.27, 0.125, -0.025], [0.57, 0.09, 0.012], [0.84, 0.025, 0.06]];
  for (const side of [-1, 1]) {
    const offset = vertices.length / 3;
    for (const [distance, width, twist] of stations) {
      const y = side * distance;
      vertices.push(-width, y, twist - 0.018, width, y, twist - 0.018,
        -width, y, twist + 0.018, width, y, twist + 0.018);
    }
    for (let i = 0; i < stations.length - 1; i += 1) {
      const a = offset + i * 4;
      const b = a + 4;
      indices.push(a, a + 1, b, a + 1, b + 1, b,
        a + 2, b + 2, a + 3, a + 3, b + 2, b + 3,
        a, b, a + 2, a + 2, b, b + 2,
        a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
    }
  }
  const blades = new THREE.Mesh(indexedGeometry(vertices, indices), builder.materials.dark);
  blades.name = 'Propeller_Main_Blades';
  pivot.add(blades);
  const blurMaterial = new THREE.MeshBasicMaterial({ color: 0xb8d7e6, transparent: true, opacity: 0.055,
    depthWrite: false, side: THREE.DoubleSide });
  blurMaterial.name = 'AC_PROP_BLUR';
  const blur = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.82, 32), blurMaterial);
  blur.name = 'Propeller_Main_Blur';
  blur.position.z = 0.05;
  blur.visible = false;
  pivot.add(blur);
  builder.dynamic.push(pivot);
}

function buildScout() {
  const b = new AirframeBuilder('Skyrift_Scout', { base: 0xf4f5f1, primary: 0x1769b8,
    accent: 0x79c9e8, glass: 0x102a42, dark: 0x202a31, metal: 0x87959c });
  const sections = [
    { z: -2.90, width: 0.34, height: 0.32, centerY: 0.04 },
    { z: -2.72, width: 0.43, height: 0.38, centerY: 0.04 },
    { z: -2.34, width: 0.52, height: 0.44, centerY: 0.04 },
    { z: -1.76, width: 0.56, height: 0.46, centerY: 0.02 },
    { z: -1.43, width: 0.61, height: 0.47, centerY: 0.03 },
    { z: -0.96, width: 0.64, height: 0.49, centerY: 0.03 },
    { z: 0.16, width: 0.63, height: 0.48, centerY: 0.02 },
    { z: 0.78, width: 0.54, height: 0.44, centerY: 0.02 },
    { z: 1.55, width: 0.42, height: 0.35, centerY: 0.04 },
    { z: 2.50, width: 0.25, height: 0.21, centerY: 0.08 },
    { z: 3.16, width: 0.015, height: 0.015, centerY: 0.27 },
  ];
  b.add('base', scoutFuselage(sections));
  b.add('primary', scoutNoseCowling([
    { ...sections[0], startAngle: -0.28 },
    { ...sections[1], startAngle: -0.22 },
    { ...sections[2], startAngle: -0.16 },
    { z: -2.14, width: 0.54, height: 0.45, centerY: 0.03, startAngle: -0.02 },
    { z: -1.99, width: 0.56, height: 0.46, centerY: 0.03, startAngle: 0.22 },
  ]));
  // Seal the aft ring so rear views cannot see through the fuselage.
  b.add('base', new THREE.CircleGeometry(1, 16), vector(0, 0.27, 3.162),
    euler(), vector(0.018, 0.018, 1));
  // The front face, dark propeller recess and pointed spinner form one cowl.
  b.cylinder('primary', 0.33, 0.33, 0.06, vector(0, 0.04, -2.91));
  b.cylinder('dark', 0.215, 0.215, 0.012, vector(0, 0.04, -2.95));
  b.add('dark', new THREE.TorusGeometry(0.23, 0.025, 5, 16), vector(0, 0.04, -2.965));
  b.cone('primary', 0.19, 0.39, vector(0, 0.04, -3.14));
  b.materials.glass = new THREE.MeshStandardMaterial({ color: 0x10283e, roughness: 0.16,
    metalness: 0.24, side: THREE.DoubleSide });
  b.materials.glass.name = materialSlots.glass;

  const sideSurfaceX = (z, y, offset = 0.035) => {
    const index = Math.max(0, sections.findIndex(section => section.z >= z) - 1);
    const a = sections[index];
    const c = sections[Math.min(index + 1, sections.length - 1)];
    const t = c.z === a.z ? 0 : (z - a.z) / (c.z - a.z);
    const width = THREE.MathUtils.lerp(a.width, c.width, t);
    const height = THREE.MathUtils.lerp(a.height, c.height, t);
    const centerY = THREE.MathUtils.lerp(a.centerY, c.centerY, t);
    const sine = Math.min(1, Math.abs((y - centerY) / height) ** (1 / 0.82));
    return width * Math.sqrt(1 - sine * sine) ** 0.82 + offset;
  };
  const frontCabinSidePoint = (side, z, height, offset = 0) => {
    const progress = THREE.MathUtils.clamp((z + 2.01) / 0.56, 0, 1);
    const upper = scoutWindshieldPoint(side, progress);
    const y = THREE.MathUtils.lerp(0.15, upper[1], height);
    const lowerX = side * sideSurfaceX(z, 0.15, 0.018);
    const flatX = THREE.MathUtils.lerp(lowerX, upper[0], height);
    const cabinHeight = (y - 0.15) / (0.94 - 0.15);
    const cabinX = scoutCabinSidePoint(side, -1.45, cabinHeight)[0];
    // Keep the outer edge exactly on the windshield; the side wall bulges
    // smoothly into the wider cabin below it.
    return [flatX + progress * (cabinX - flatX) * (1 - height ** 32) + side * offset, y, z];
  };
  const sideWindowPoint = (side, z, height) => {
    if (z >= -1.45) return scoutCabinSidePoint(side, z, height, 0.04);
    const targetY = THREE.MathUtils.lerp(0.15, 0.94, height);
    const progress = (z + 2.01) / 0.56;
    const edgeY = scoutWindshieldPoint(side, progress)[1];
    return frontCabinSidePoint(side, z, (targetY - 0.15) / (edgeY - 0.15), 0.04);
  };

  for (const side of [-1, 1]) {
    // The intake is set into the visible side of the blue nose immediately
    // behind the propeller, with a second opening under the white chin.
    b.add('primary', scoutSurfacePatch(side, sideSurfaceX, [
      [-2.88, 0.09, 0.19], [-2.82, 0.01, 0.27],
      [-2.62, 0.01, 0.28], [-2.55, 0.09, 0.21],
    ], 0.04));
    b.add('dark', scoutSurfacePatch(side, sideSurfaceX, [
      [-2.84, 0.10, 0.18], [-2.79, 0.05, 0.23],
      [-2.65, 0.05, 0.24], [-2.59, 0.10, 0.19],
    ], 0.055));
    b.add('dark', scoutSurfacePatch(side, sideSurfaceX, [
      [-2.74, -0.25, -0.18], [-2.70, -0.29, -0.17],
      [-2.55, -0.30, -0.18], [-2.52, -0.25, -0.20],
    ], 0.045));
  }
  b.add('dark', scoutPanel([
    [-0.17, -0.17, -2.948], [-0.12, -0.26, -2.948],
    [0.12, -0.26, -2.948], [0.17, -0.17, -2.948],
  ], -1));

  // A continuous arched cabin replaces the flat roof and separate window rods.
  // Narrow exposed areas of this shell form the A/B pillars and window seals.
  b.add('base', scoutCabinShell());
  b.add('base', scoutSurfaceGrid((u, v) => scoutWindshieldPoint(u * 2 - 1, v), 16, 8, true));
  // Close the lower windshield against the round cowling. The cowling narrows
  // near its sides, leaving a visible opening without this curved white sill.
  b.add('base', scoutSurfaceGrid((u, v) => {
    const edge = scoutWindshieldPoint(u * 2 - 1, 0);
    const cosine = Math.min(1, Math.abs(edge[0]) / 0.578) ** (1 / 0.82);
    const cowlY = 0.03 + 0.478 * Math.sqrt(1 - cosine * cosine) ** 0.82;
    const lowerY = Math.min(edge[1] - 0.015, cowlY + 0.012);
    return [edge[0], THREE.MathUtils.lerp(lowerY, edge[1], v),
      THREE.MathUtils.lerp(-2.00, edge[2], v)];
  }, 16, 5, true));
  for (const [start, end] of [[-0.95, -0.018], [0.018, 0.95]]) {
    b.add('glass', scoutRoundedWindow((u, v) => scoutWindshieldPoint(u, v, 0.018),
      start, end, 0.055, 0.90, 0.05, 0.045, true));
  }
  for (const side of [-1, 1]) {
    b.add('base', scoutSurfaceGrid((u, v) => frontCabinSidePoint(side, -2.01 + u * 0.56, v),
      8, 8, side > 0));
    b.add('glass', scoutRoundedWindow((u, v) => {
      const frontZ = THREE.MathUtils.lerp(-1.86, -1.39, (v - 0.35) / (0.80 - 0.35));
      return sideWindowPoint(side, THREE.MathUtils.lerp(frontZ, -0.30, u), v);
    }, 0, 1, 0.35, 0.80, 0.045, 0.05, side > 0));
    b.add('glass', scoutRoundedWindow((z, v) => sideWindowPoint(side, z, v),
      -0.19, 0.46, 0.35, 0.76, 0.055, 0.05, side > 0));
    b.box('metal', vector(0.018, 0.026, 0.11), vector(side * 0.65, 0.13, -0.31));
    const stripes = [
      [-2.32, -0.02, -0.13], [-1.75, -0.04, -0.16],
      [-0.55, -0.04, -0.15], [0.75, 0.03, -0.08],
      [1.65, 0.13, 0.07], [2.68, 0.16, 0.13],
    ];
    const stripeStations = [];
    for (let i = 0; i < stripes.length - 1; i += 1) {
      const [z0, upper0, lower0] = stripes[i];
      const [z1, upper1, lower1] = stripes[i + 1];
      const steps = Math.ceil((z1 - z0) / 0.18);
      for (let step = i === 0 ? 0 : 1; step <= steps; step += 1) {
        const t = step / steps;
        stripeStations.push([THREE.MathUtils.lerp(z0, z1, t),
          THREE.MathUtils.lerp(lower0, lower1, t), THREE.MathUtils.lerp(upper0, upper1, t)]);
      }
    }
    b.add('primary', scoutSurfacePatch(side, sideSurfaceX, stripeStations, 0.045));
    const lowerStripeStations = [];
    for (let step = 0; step <= 26; step += 1) {
      const t = step / 26;
      lowerStripeStations.push([THREE.MathUtils.lerp(-2.32, 1.72, t),
        THREE.MathUtils.lerp(-0.22, 0.005, t), THREE.MathUtils.lerp(-0.195, 0.03, t)]);
    }
    b.add('primary', scoutSurfacePatch(side, sideSurfaceX, lowerStripeStations, 0.047));
  }

  for (const side of [-1, 1]) {
    b.add('base', scoutAirfoil(side, 4.20, 0, 0.86, -0.78, -0.48, 1.42, 0.73, 1.03, 1.18));
    b.add('primary', scoutAirfoil(side, 4.20, 0.86, 1, -0.78, -0.48, 1.42, 0.73, 1.03, 1.18));
    b.add('primary', scoutWingStripe(side));
    scoutBeam(b, 'base', vector(side * 0.54, -0.13, -0.06), vector(side * 2.63, 1.06, -0.05), 0.085);
    b.sphere('base', vector(0.12, 0.10, 0.14), vector(side * 0.54, -0.13, -0.06));
    b.sphere('base', vector(0.13, 0.08, 0.14), vector(side * 2.63, 1.06, -0.05));
    b.add('primary', scoutAirfoil(side, 1.66, 0.83, 1, 2.23, 2.42, 0.83, 0.47, 0.30, 0.34, true));
    b.add('accent', scoutPanel([
      [side * 0.078, 0.46, 2.50], [side * 0.080, 1.04, 2.67],
      [side * 0.080, 1.25, 2.83], [side * 0.078, 0.60, 2.69],
    ], side));
  }
  b.add('base', scoutTailplaneCenter());
  b.add('primary', scoutFin());

  // Fixed tricycle gear: tires remain the lowest geometry; fairings cover
  // their upper halves and the spring struts connect into the actual body.
  for (const [x, z, y] of [[-0.96, 0.61, -0.81], [0.96, 0.61, -0.81], [0, -2.28, -0.81]]) {
    scoutBeam(b, 'metal', vector(x * 0.38, -0.25, z), vector(x, y + 0.03, z), 0.06);
    b.wheel(vector(x, y, z), 0.22, 0.13);
    b.capsule('base', 0.17, 0.33, vector(x, y + 0.10, z + 0.04), vector(1, 0.76, 1));
    b.sphere('primary', vector(0.14, 0.055, 0.20), vector(x, y + 0.18, z - 0.07));
  }
  scoutPropeller(b);
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

// Firehawk is authored by build-firehawk-blender.py; this exporter leaves its GLB untouched.

const aircraft = [
  ['trainer.glb', buildScout()],
  ['cargo.glb', buildCargo()],
  ['private-jet.glb', buildWayfarer()],
];

if (process.argv[2] === 'fighter.glb') {
  throw new Error('Firehawk is authored separately. Run npm run generate:firehawk from client/.');
}

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
  if (process.argv[2] && filename !== process.argv[2]) continue;
  const binary = await exportBinary(root);
  await fs.writeFile(path.join(outputDirectory, filename), Buffer.from(binary));
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  console.log(`${filename}: ${Buffer.byteLength(binary)} bytes, ${root.children.length} nodes, bounds ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
}
