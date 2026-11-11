import * as THREE from 'three';
import { addOsmCityData, prepareOsmCityData, type OsmCityOptions, registerMappedMonsterMesh, type CompactChunk, type CompactCityData } from './osm-city';
import { createDallasTerrain, createDallasExclusion, type DallasTerrainEnvironment } from './dallas-terrain';
import { inDallasCore } from '../../shared/dallas-skyline.mjs';

export type ChunkOptions = Parameters<typeof addOsmCityData>[2];
type PackedAttribute = { array: THREE.TypedArray; itemSize: number; normalized: boolean };
type PackedMesh = { name: string; points: boolean; material: string; attributes: Record<string, PackedAttribute>; index?: PackedAttribute; sphere?: { center: number[]; radius: number } };
export type PreparedChunk = { groups: { name: string; meshes: PackedMesh[] }[]; features: { roads: number; buildings: number; water: number; landuse: number; aeroways: number }; parseMs: number; prepareMs: number };
export type PreparationConfig = { environment: DallasTerrainEnvironment; materials: { key: string; mapped: boolean }[]; monsterDamageTargets?: boolean; majorHighwayWidth?: number };
export type PreparationJob = { id: number; payload: string; header: Omit<CompactCityData, 'chunks'> };
export type PreparationReply = { id: number; result?: PreparedChunk; error?: string };

export function chunkMaterials(options: ChunkOptions): Map<string, THREE.Material> {
  const result = new Map<string, THREE.Material>();
  for (const [key, value] of Object.entries(options)) {
    if (value instanceof THREE.Material) result.set(key, value);
    else if (Array.isArray(value)) value.forEach((material, index) => {
      if (material instanceof THREE.Material) result.set(`${key}:${index}`, material);
    });
  }
  return result;
}

type MaterialSlot = { key: string; map: boolean };
export function preparationOptions(config: PreparationConfig): OsmCityOptions<MaterialSlot> {
  const materials: Record<string, MaterialSlot | MaterialSlot[]> = {};
  for (const { key, mapped } of config.materials) {
    const [name, index] = key.split(':');
    const material = { key, map: mapped };
    if (index === undefined) materials[name] = material;
    else ((materials[name] ??= []) as MaterialSlot[])[Number(index)] = material;
  }
  return { ...materials, collectCollisionData: false, isBuildingExcluded: inDallasCore,
    monsterDamageTargets: config.monsterDamageTargets, majorHighwayWidth: config.majorHighwayWidth,
    heightAt: createDallasTerrain(config.environment.airports), isExcluded: createDallasExclusion(config.environment) } as OsmCityOptions<MaterialSlot>;
}

export function prepareDallasChunk(job: PreparationJob, options: ReturnType<typeof preparationOptions>): PreparedChunk {
  const started = performance.now();
  const chunk = JSON.parse(job.payload) as CompactChunk;
  const parsed = performance.now();
  const { groups } = prepareOsmCityData({ ...job.header, chunks: [chunk] }, options);
  const pack = (attribute: THREE.BufferAttribute): PackedAttribute => ({ array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized });
  return {
    groups: groups.map(({ detail }) => ({ name: detail.name, meshes: detail.meshes.map(mesh => {
      const sphere = mesh.geometry.boundingSphere;
      return { name: mesh.name, points: !!mesh.points, material: mesh.material.key,
        attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, pack(attribute as THREE.BufferAttribute)])),
        index: mesh.geometry.index ? pack(mesh.geometry.index) : undefined,
        sphere: sphere ? { center: sphere.center.toArray(), radius: sphere.radius } : undefined };
    }) })),
    features: { roads: chunk.r.length / 6, buildings: chunk.b.length, water: chunk.w.length, landuse: chunk.p.length, aeroways: (chunk.a?.length ?? 0) / 6 },
    parseMs: parsed - started, prepareMs: performance.now() - parsed,
  };
}

export function preparedTransfers(result: PreparedChunk): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const group of result.groups) for (const mesh of group.meshes) {
    for (const attribute of Object.values(mesh.attributes)) buffers.add(attribute.array.buffer as ArrayBuffer);
    if (mesh.index) buffers.add(mesh.index.array.buffer as ArrayBuffer);
  }
  return [...buffers];
}

/** Yields after each mesh. Groups stay detached/hidden until the complete LOD is ready. */
export function* assembleDallasChunk(result: PreparedChunk, materials: Map<string, THREE.Material>, groups: THREE.Group[]): Generator<void> {
  for (const packed of result.groups) {
    const group = new THREE.Group(); group.name = packed.name; group.visible = false; groups.push(group);
    for (const mesh of packed.meshes) {
      const material = materials.get(mesh.material);
      if (!material) throw new Error('Missing Dallas chunk material');
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(mesh.attributes)) geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized));
      if (mesh.index) geometry.setIndex(new THREE.BufferAttribute(mesh.index.array, mesh.index.itemSize, mesh.index.normalized));
      if (mesh.sphere) geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3().fromArray(mesh.sphere.center), mesh.sphere.radius);
      const object = mesh.points ? new THREE.Points(geometry, material) : new THREE.Mesh(geometry, material);
      object.name = mesh.name;
      if (object instanceof THREE.Mesh && object.name === 'osm-monster-damage-target') registerMappedMonsterMesh(object);
      group.add(object);
      yield;
    }
  }
}
