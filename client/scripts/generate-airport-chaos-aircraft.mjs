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

function scoutBodySection(sections, z) {
  const index = Math.max(0, sections.findIndex(section => section.z >= z) - 1);
  const a = sections[index], b = sections[Math.min(index + 1, sections.length - 1)];
  const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
  return { width: THREE.MathUtils.lerp(a.width, b.width, t),
    height: THREE.MathUtils.lerp(a.height, b.height, t),
    centerY: THREE.MathUtils.lerp(a.centerY, b.centerY, t) };
}

function scoutFuselage(sections) {
  const vertices = [], indices = [], parameters = [];
  const heights = [0, 0.16, 0.32, 0.47, 0.62, 0.70, 0.78, 0.84, 0.90, 0.95, 0.97, 1];
  const stations = [...new Set([...sections.map(section => section.z),
    ...scoutCabinStations.map(section => section.z),
    ...Array.from({ length: 47 }, (_, i) => -2.04 + i * (3.59 / 46))])].sort((a, b) => a - b);
  const lowerSteps = 24, perimeter = lowerSteps + heights.length * 2 - 2;
  for (const z of stations) {
    const section = scoutBodySection(sections, z);
    const joinY = z < -2.04 || z > 1.55 ? section.centerY : 0.15;
    const sine = THREE.MathUtils.clamp((joinY - section.centerY) / section.height, -0.99, 0.99);
    const joinAngle = Math.asin(Math.sign(sine) * Math.abs(sine) ** (1 / 0.82));
    // Lower fuselage and upper cabin share the very same edge vertices.
    for (let j = 0; j <= lowerSteps; j++) {
      const angle = THREE.MathUtils.lerp(Math.PI - joinAngle, 2 * Math.PI + joinAngle, j / lowerSteps);
      vertices.push(section.width * Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** 0.82,
        section.centerY + section.height * Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** 0.82, z);
      parameters.push([z, j === 0 || j === lowerSteps ? 0 : -1]);
    }
    for (const height of heights.slice(1)) { vertices.push(...scoutCabinSidePoint(1, z, height, 0, sections)); parameters.push([z, height]); }
    for (const height of heights.slice(1, -1).reverse()) { vertices.push(...scoutCabinSidePoint(-1, z, height, 0, sections)); parameters.push([z, height]); }
  }
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < perimeter; j++) {
    const a = i * perimeter + j, b = i * perimeter + (j + 1) % perimeter;
    const c = a + perimeter, d = b + perimeter;
    indices.push(a, b, c, b, d, c);
  }
  return scoutBodyMaterials(indexedGeometry(vertices, indices), parameters);
}

const scoutCabinStations = [
  { z: -2.04, roofY: 0.48 }, { z: -1.76, roofY: 0.70 },
  { z: -1.45, roofY: 0.94 }, { z: -1.10, roofY: 0.99 },
  { z: -0.25, roofY: 1.00 }, { z: 0.35, roofY: 0.95 },
  { z: 0.70, roofY: 0.77 }, { z: 1.10, roofY: 0.55 },
  { z: 1.55, roofY: 0.39 },
];
const scoutCabinProfile = [
  [0, 1], [0.16, 0.985], [0.32, 0.97], [0.62, 0.94],
  [0.78, 0.90], [0.90, 0.76], [0.97, 0.49], [1, 0],
];

function scoutCabinSidePoint(side, z, height, offset = 0, sections) {
  const body = scoutBodySection(sections, z);
  const roofIndex = Math.max(0, scoutCabinStations.findIndex(station => station.z >= z) - 1);
  const a = scoutCabinStations[roofIndex], b = scoutCabinStations[Math.min(roofIndex + 1, scoutCabinStations.length - 1)];
  const blend = z < -2.04 || z > 1.55 ? 0 : 1;
  const roofY = blend ? THREE.MathUtils.lerp(a.roofY, b.roofY, (z - a.z) / (b.z - a.z)) : body.centerY + body.height;
  const joinY = blend ? 0.15 : body.centerY;
  const y = THREE.MathUtils.lerp(joinY, roofY, height);
  const sine = THREE.MathUtils.clamp(Math.abs((joinY - body.centerY) / body.height) ** (1 / 0.82), 0, 1);
  const width = body.width * Math.sqrt(1 - sine * sine) ** 0.82;
  const index = Math.max(0, scoutCabinProfile.findIndex(point => point[0] >= height) - 1);
  const [h0, w0] = scoutCabinProfile[index], [h1, w1] = scoutCabinProfile[Math.min(index + 1, scoutCabinProfile.length - 1)];
  const cabinX = width * THREE.MathUtils.lerp(w0, w1, (height - h0) / (h1 - h0));
  const bodySine = THREE.MathUtils.clamp(Math.abs((y - body.centerY) / body.height) ** (1 / 0.82), 0, 1);
  const bodyX = body.width * Math.sqrt(1 - bodySine * bodySine) ** 0.82;
  // Fade the cabin's cross-section back into the ordinary nose/tail ellipse.
  const cabinBlend = Math.min(THREE.MathUtils.clamp((z + 2.04) / 0.3, 0, 1),
    THREE.MathUtils.clamp((1.55 - z) / 0.45, 0, 1));
  return [side * (THREE.MathUtils.lerp(bodyX, cabinX, cabinBlend) + offset), y, z];
}

// Split the existing skin by glazing and livery outlines. Every material
// shares boundary vertices and interpolated normals: no raised overlays.
function scoutBodyMaterials(skin, parameters) {
  const windows = [
    // The windshield wraps down to the sill and back beneath the wing.
    // Its outer edge follows the door glass across a narrow, constant A-pillar.
    [[-1.80, 0.49], [-1.16, 0.82], [-0.82, 0.9988], [-1.98, 0.9988], [-1.98, 0.96]],
    [[-1.74, 0.49], [-1.70, 0.46], [-0.29, 0.33], [-0.25, 0.37],
      [-0.25, 0.78], [-0.29, 0.82], [-1.10, 0.82]],
    [[-0.14, 0.36], [-0.10, 0.33], [1.04, 0.76], [1.08, 0.80],
      [-0.10, 0.80], [-0.14, 0.77]],
  ];
  // One flush paint mask joins the rounded cowling to the two tapering stripes.
  // Triangulating the concave outlines keeps all paint on the original skin.
  const paintOutlines = [
    [[-2.92, -.20], [-2.65, -.28], [-2.45, -.25], [-2.28, -.18],
      [-2.12, -.08], [-1.92, -.035], [-1.84, .10], [-1.89, .15],
      [-1.92, .27], [-1.92, .38], [-1.97, .49], [-2.04, .55], [-2.92, .55]],
    [[-2.12, -.035], [-1.70, -.035], [-.55, -.02], [.75, .045],
      [1.65, .15], [2.68, .27], [2.76, .285], [2.60, .29],
      [1.65, .25], [.75, .17], [-.55, .10], [-1.70, .10], [-2.12, .10]],
    [[-2.24, -.14], [-1.65, -.155], [-.55, -.12], [.75, -.045],
      [1.65, .075], [2.52, .185], [1.65, .12], [.75, .005],
      [-.55, -.075], [-1.65, -.11], [-2.24, -.12]],
  ];
  const paint = paintOutlines.flatMap(outline => {
    const points = outline.map(([x, y]) => new THREE.Vector2(x, y));
    return THREE.ShapeUtils.triangulateShape(points, []).map(indices => {
      const triangle = indices.map(index => outline[index]);
      const [a,b,c] = triangle;
      return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) < 0 ? triangle.reverse() : triangle;
    });
  });
  const output = { base: { positions: [], normals: [] }, glass: { positions: [], normals: [] }, primary: { positions: [], normals: [] } };
  const position = skin.getAttribute('position'), normal = skin.getAttribute('normal');
  const interpolate = (a, b, t) => ({ uv: a.uv.map((v, i) => THREE.MathUtils.lerp(v, b.uv[i], t)),
    p: a.p.map((v, i) => THREE.MathUtils.lerp(v, b.p[i], t)),
    n: a.n.map((v, i) => THREE.MathUtils.lerp(v, b.n[i], t)) });
  const clip = (polygon, a, b, inside) => {
    const result = [];
    const distance = vertex => (b[0] - a[0]) * (vertex.uv[1] - a[1]) - (b[1] - a[1]) * (vertex.uv[0] - a[0]);
    for (let i = 0; i < polygon.length; i++) {
      const previous = polygon[(i + polygon.length - 1) % polygon.length], current = polygon[i];
      const d0 = distance(previous), d1 = distance(current);
      const keep0 = inside ? d0 >= 0 : d0 <= 0, keep1 = inside ? d1 >= 0 : d1 <= 0;
      if (keep0 !== keep1) result.push(interpolate(previous, current, d0 / (d0 - d1)));
      if (keep1) result.push(current);
    }
    return result;
  };
  const emit = (slot, polygon) => {
    for (let i = 1; i < polygon.length - 1; i++) {
      const triangle = [polygon[0], polygon[i], polygon[i + 1]];
      const a = new THREE.Vector3(...triangle[1].p).sub(new THREE.Vector3(...triangle[0].p));
      const b = new THREE.Vector3(...triangle[2].p).sub(new THREE.Vector3(...triangle[0].p));
      if (a.cross(b).lengthSq() < 1e-18) continue;
      for (const vertex of triangle) {
        output[slot].positions.push(...vertex.p); output[slot].normals.push(...vertex.n);
      }
    }
  };
  const partition = (polygons, outlines, slot) => {
    let remaining = polygons;
    for (const outline of outlines) {
      const bounds = [Math.min(...outline.map(p => p[0])), Math.max(...outline.map(p => p[0])),
        Math.min(...outline.map(p => p[1])), Math.max(...outline.map(p => p[1]))];
      const outside = [];
      for (const polygon of remaining) {
        // Avoid splitting triangles that cannot touch this outline.
        if (polygon.every(v => v.uv[0] < bounds[0]) || polygon.every(v => v.uv[0] > bounds[1]) ||
          polygon.every(v => v.uv[1] < bounds[2]) || polygon.every(v => v.uv[1] > bounds[3])) {
          outside.push(polygon); continue;
        }
        let inner = polygon;
        for (let edge = 0; edge < outline.length && inner.length >= 3; edge++) {
          const a = outline[edge], b = outline[(edge + 1) % outline.length];
          const piece = clip(inner, a, b, false);
          if (piece.length >= 3) outside.push(piece);
          inner = clip(inner, a, b, true);
        }
        if (inner.length >= 3) emit(slot, inner);
      }
      remaining = outside;
    }
    return remaining;
  };
  for (let i = 0; i < skin.index.count; i += 3) {
    const triangle = [0, 1, 2].map(corner => {
      const index = skin.index.getX(i + corner);
      return { uv: parameters[index], p: [position.getX(index), position.getY(index), position.getZ(index)],
        n: [normal.getX(index), normal.getY(index), normal.getZ(index)] };
    });
    const remaining = triangle.every(vertex => vertex.uv[1] >= 0) ? partition([triangle], windows, 'glass') : [triangle];
    const paintSurface = remaining.map(polygon => polygon.map(vertex => ({ ...vertex, uv: [vertex.p[2], vertex.p[1]] })));
    for (const polygon of partition(paintSurface, paint, 'primary')) emit('base', polygon);
  }
  skin.dispose();
  return Object.fromEntries(Object.entries(output).map(([slot, data]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.normalizeNormals();
    return [slot, geometry];
  }));
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
  const fuselage = scoutFuselage(sections);
  b.add('base', fuselage.base);
  b.add('glass', fuselage.glass);
  b.add('primary', fuselage.primary);
  // Seal the aft ring so rear views cannot see through the fuselage.
  b.add('base', new THREE.CircleGeometry(1, 16), vector(0, 0.27, 3.162),
    euler(), vector(0.018, 0.018, 1));
  // The front face, dark propeller recess and pointed spinner form one cowl.
  b.cylinder('primary', 0.33, 0.33, 0.06, vector(0, 0.04, -2.91));
  b.cylinder('dark', 0.215, 0.215, 0.012, vector(0, 0.04, -2.95));
  b.add('dark', new THREE.TorusGeometry(0.23, 0.025, 5, 16), vector(0, 0.04, -2.965));
  b.cone('primary', 0.19, 0.39, vector(0, 0.04, -3.14));
  b.materials.glass = new THREE.MeshStandardMaterial({ color: 0x10283e, roughness: 0.26,
    metalness: 0.08, side: THREE.DoubleSide });
  b.materials.glass.name = materialSlots.glass;

  // Keep the forward chin intake; the cowling sides are uninterrupted skin.
  b.add('dark', scoutPanel([
    [-0.17, -0.17, -2.948], [-0.12, -0.26, -2.948],
    [0.12, -0.26, -2.948], [0.17, -0.17, -2.948],
  ], -1));

  for (const side of [-1, 1]) {
    b.box('metal', vector(0.018, 0.026, 0.11), vector(side * 0.65, 0.13, -0.31));
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
