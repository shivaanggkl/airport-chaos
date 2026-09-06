import * as THREE from 'three';
import { addOsmCityData, disposeOsmGroups, type CompactChunk, type CompactCityData } from './osm-city';

type Lod = 'near' | 'mid' | 'far';
type ManifestEntry = { id: string; lod: Lod; x: number; z: number; minX: number; maxX: number; minZ: number; maxZ: number; filename: string; bytes: number };
type Manifest = Omit<CompactCityData, 'chunks'> & { chunks: ManifestEntry[] };
type Loaded = { entry: ManifestEntry; groups: THREE.Group[]; lastUsed: number };
type Options = Parameters<typeof addOsmCityData>[2];
const ranges: Record<Lod, number> = { near: 5_000, mid: 15_000, far: 35_000 };
const order: Lod[] = ['near', 'mid', 'far'];
const enterRanges: Record<Lod, number> = { near: 4_600, mid: 14_200, far: 35_000 };
const exitRanges: Record<Lod, number> = { near: 5_900, mid: 16_200, far: 36_250 };

export class DallasChunkStreamer {
  private manifest?: Manifest;
  private readonly loaded = new Map<string, Loaded>();
  private readonly requested = new Set<string>();
  private readonly visibleLod = new Map<string, Lod>();
  private queue: ManifestEntry[] = [];
  private active = 0;
  private alive = true;
  private loadedBytes = 0;
  private lastPosition = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly maxConcurrency = 5;
  private readonly maxBytes = 128 * 1024 * 1024;

  constructor(private readonly scene: THREE.Scene, private readonly options: Options) {
    void fetch('/data/dallas/manifest.json').then((response) => response.json()).then((manifest: Manifest) => { if (this.alive) this.manifest = manifest; });
  }

  update(position: THREE.Vector3): void {
    if (!this.manifest || !this.alive) return;
    if (this.lastPosition.distanceToSquared(position) < 250 * 250 && this.queue.length) return;
    this.lastPosition.copy(position);
    const required: Array<{ entry: ManifestEntry; distance: number }> = [];
    for (const entry of this.manifest.chunks) {
      const dx = position.x - (entry.minX + entry.maxX) / 2;
      const dz = position.z - (entry.minZ + entry.maxZ) / 2;
      const distance = Math.hypot(dx, dz);
      if (distance <= ranges[entry.lod] + 1_250) required.push({ entry, distance });
    }
    required.sort((a, b) => a.distance - b.distance || order.indexOf(a.entry.lod) - order.indexOf(b.entry.lod));
    for (const { entry } of required) {
      const key = `${entry.lod}:${entry.id}`;
      const loaded = this.loaded.get(key);
      if (loaded) { loaded.lastUsed = performance.now(); continue; }
      if (!this.requested.has(key)) { this.requested.add(key); this.queue.push(entry); }
    }
    this.queue.sort((a, b) => Math.hypot(position.x - (a.minX + a.maxX) / 2, position.z - (a.minZ + a.maxZ) / 2) - Math.hypot(position.x - (b.minX + b.maxX) / 2, position.z - (b.minZ + b.maxZ) / 2));
    this.pump();
    this.refreshLodVisibility(position);
    this.evict(position);
  }

  private pump(): void {
    while (this.alive && this.active < this.maxConcurrency && this.queue.length) {
      const entry = this.queue.shift()!;
      this.active += 1;
      void fetch(`/data/dallas/${entry.filename}`).then((response) => response.json()).then((chunk: CompactChunk) => {
        if (!this.alive || !this.manifest) return;
        const city: CompactCityData = { v: this.manifest.v, source: this.manifest.source, attribution: this.manifest.attribution, license: this.manifest.license, chunkSize: this.manifest.chunkSize, chunks: [chunk] };
        const result = addOsmCityData(this.scene, city, this.options);
        const key = `${entry.lod}:${entry.id}`;
        this.loaded.set(key, { entry, groups: result.groups, lastUsed: performance.now() });
        this.loadedBytes += entry.bytes;
        this.applyLodVisibility(entry.id, this.lastPosition);
      }).catch(() => {
        // Failed chunk requests must remain retryable as the player approaches again.
        this.requested.delete(`${entry.lod}:${entry.id}`);
      }).finally(() => { this.active -= 1; this.pump(); });
    }
  }

  private applyLodVisibility(id: string, position: THREE.Vector3): void {
    const representative = order.map((lod) => this.loaded.get(`${lod}:${id}`)).find(Boolean)?.entry;
    if (!representative) return;
    const centerX = (representative.minX + representative.maxX) / 2;
    const centerZ = (representative.minZ + representative.maxZ) / 2;
    const distance = Math.hypot(position.x - centerX, position.z - centerZ);
    const previous = this.visibleLod.get(id);
    let desired: Lod;
    if (previous === 'near' && distance <= exitRanges.near) desired = 'near';
    else if (previous === 'mid' && distance > exitRanges.near && distance <= exitRanges.mid) desired = 'mid';
    else if (previous === 'far' && distance > exitRanges.mid) desired = 'far';
    else if (distance <= enterRanges.near) desired = 'near';
    else if (distance <= enterRanges.mid) desired = 'mid';
    else desired = 'far';

    const fallbacks: Record<Lod, Lod[]> = {
      near: ['near', 'mid', 'far'],
      mid: ['mid', 'near', 'far'],
      far: ['far', 'mid', 'near'],
    };
    const visible = fallbacks[desired].find((lod) => this.loaded.has(`${lod}:${id}`))
      ?? (previous && this.loaded.has(`${previous}:${id}`) ? previous : undefined);
    if (!visible) return;
    this.visibleLod.set(id, visible);
    for (const lod of order) {
      const loaded = this.loaded.get(`${lod}:${id}`);
      if (loaded) for (const group of loaded.groups) group.visible = lod === visible;
    }
  }

  private refreshLodVisibility(position: THREE.Vector3): void {
    const ids = new Set<string>();
    for (const loaded of this.loaded.values()) ids.add(loaded.entry.id);
    for (const id of ids) this.applyLodVisibility(id, position);
  }

  private evict(position: THREE.Vector3): void {
    const candidates = [...this.loaded.values()].sort((a, b) => a.lastUsed - b.lastUsed);
    for (const loaded of candidates) {
      const dx = position.x - (loaded.entry.minX + loaded.entry.maxX) / 2;
      const dz = position.z - (loaded.entry.minZ + loaded.entry.maxZ) / 2;
      const distant = Math.hypot(dx, dz) > ranges[loaded.entry.lod] + 4_000;
      if (!distant && this.loadedBytes <= this.maxBytes) continue;
      const replacementReady = order.some((lod) => lod !== loaded.entry.lod && this.loaded.has(`${lod}:${loaded.entry.id}`));
      if (!replacementReady && this.loadedBytes <= this.maxBytes) continue;
      this.loaded.delete(`${loaded.entry.lod}:${loaded.entry.id}`);
      this.requested.delete(`${loaded.entry.lod}:${loaded.entry.id}`);
      this.loadedBytes -= loaded.entry.bytes;
      disposeOsmGroups(loaded.groups);
      this.applyLodVisibility(loaded.entry.id, position);
    }
  }

  dispose(): void {
    this.alive = false;
    for (const loaded of this.loaded.values()) disposeOsmGroups(loaded.groups);
    this.loaded.clear(); this.queue = []; this.requested.clear(); this.visibleLod.clear(); this.loadedBytes = 0;
  }
}
