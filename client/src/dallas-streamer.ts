import * as THREE from 'three';
import { addOsmCityData, disposeOsmGroups, type CompactChunk, type CompactCityData } from './osm-city';

type Lod = 'near' | 'mid' | 'far';
type ManifestEntry = { id: string; lod: Lod; x: number; z: number; minX: number; maxX: number; minZ: number; maxZ: number; filename: string; bytes: number };
type Manifest = Omit<CompactCityData, 'chunks'> & { chunks: ManifestEntry[] };
type Loaded = { entry: ManifestEntry; groups: THREE.Group[]; bytes: number; lastUsed: number };
type CellEntries = Partial<Record<Lod, ManifestEntry>>;
type Options = Parameters<typeof addOsmCityData>[2];
export type DallasStreamingStats = {
  loaded: Record<Lod, number>;
  loadedBytes: number;
  cacheLimitBytes: number;
  queued: number;
  pending: number;
  loadedChunks: number;
  evictedChunks: number;
  discardedLoads: number;
};
const ranges: Record<Lod, number> = { near: 5_000, mid: 15_000, far: 35_000 };
const order: Lod[] = ['near', 'mid', 'far'];
const enterRanges: Record<Lod, number> = { near: 4_600, mid: 14_200, far: 35_000 };
const exitRanges: Record<Lod, number> = { near: 5_900, mid: 16_200, far: 36_250 };
const desiredMargin = 1_250;
const farRetentionMargin = 2_000;
const preloadSeconds = 3.5;
const maxPreloadDistance = 3_000;
const lodLoadPriority: Record<Lod, number> = { far: 0, mid: 1, near: 2 };

function distanceToBounds(position: THREE.Vector3, entry: ManifestEntry): number {
  const x = THREE.MathUtils.clamp(position.x, entry.minX, entry.maxX);
  const z = THREE.MathUtils.clamp(position.z, entry.minZ, entry.maxZ);
  return Math.hypot(position.x - x, position.z - z);
}

function isAhead(position: THREE.Vector3, direction: THREE.Vector3, entry: ManifestEntry): boolean {
  if (direction.lengthSq() < 0.0001) return false;
  const centerX = (entry.minX + entry.maxX) * 0.5;
  const centerZ = (entry.minZ + entry.maxZ) * 0.5;
  return (centerX - position.x) * direction.x + (centerZ - position.z) * direction.z > 0;
}

function geometryBytes(groups: ReadonlyArray<THREE.Group>): number {
  const geometries = new Set<THREE.BufferGeometry>();
  let bytes = 0;
  for (const group of groups) {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      const geometry = object.geometry;
      if (geometries.has(geometry)) return;
      geometries.add(geometry);
      for (const attribute of Object.values(geometry.attributes) as THREE.BufferAttribute[]) bytes += attribute.array.byteLength;
      if (geometry.index) bytes += geometry.index.array.byteLength;
    });
  }
  return bytes;
}

export class DallasChunkStreamer {
  private manifest?: Manifest;
  private readonly cells = new Map<string, CellEntries>();
  private readonly loaded = new Map<string, Loaded>();
  private readonly desired = new Set<string>();
  private readonly pending = new Set<string>();
  private readonly visibleLod = new Map<string, Lod>();
  private queue: ManifestEntry[] = [];
  private active = 0;
  private alive = true;
  private loadedBytes = 0;
  private lastPosition = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly preloadPosition = new THREE.Vector3();
  private readonly preloadDirection = new THREE.Vector3();
  private lastStreamUpdateAt = 0;
  private readonly maxConcurrency = 4;
  private readonly maxBytes = 128 * 1024 * 1024;
  private loadedChunks = 0;
  private evictedChunks = 0;
  private discardedLoads = 0;

  constructor(private readonly scene: THREE.Scene, private readonly options: Options) {
    void fetch('/data/dallas/manifest.json').then((response) => response.json()).then((manifest: Manifest) => {
      if (!this.alive) return;
      this.manifest = manifest;
      this.cells.clear();
      for (const entry of manifest.chunks) {
        const cell = this.cells.get(entry.id) ?? {};
        cell[entry.lod] = entry;
        this.cells.set(entry.id, cell);
      }
    });
  }

  update(position: THREE.Vector3, velocity?: THREE.Vector3): void {
    if (!this.manifest || !this.alive) return;
    const now = performance.now();
    // Re-evaluate while a request queue exists, but avoid re-sorting the full
    // manifest every render frame when the aircraft is stationary.
    if (this.lastPosition.distanceToSquared(position) < 140 * 140 && now - this.lastStreamUpdateAt < 120) return;
    this.lastPosition.copy(position);
    this.lastStreamUpdateAt = now;
    this.preloadDirection.copy(velocity ?? this.preloadDirection).setY(0);
    const speed = this.preloadDirection.length();
    if (speed > 1) this.preloadDirection.multiplyScalar(1 / speed);
    else this.preloadDirection.set(0, 0, 0);
    const preloadDistance = THREE.MathUtils.clamp(speed * preloadSeconds, 0, maxPreloadDistance);
    this.preloadPosition.copy(position).addScaledVector(this.preloadDirection, preloadDistance);
    const required: Array<{ entry: ManifestEntry; distance: number }> = [];
    for (const entries of this.cells.values()) {
      const representative = entries.far ?? entries.mid ?? entries.near;
      if (!representative) continue;
      const targetLod = this.targetLodFor(representative, position);
      const entry = entries[this.nextLoadLod(representative, position)] ?? entries[targetLod];
      if (!entry) continue;
      const distance = distanceToBounds(position, representative);
      const preloaded = preloadDistance > 0 && isAhead(position, this.preloadDirection, representative) &&
        distanceToBounds(this.preloadPosition, representative) <= ranges[targetLod] + desiredMargin;
      if (distance <= ranges[targetLod] + desiredMargin || preloaded) required.push({ entry, distance });
    }
    // A new cell must receive a coarse representation before expensive near
    // detail. This is the first half of the no-empty-transition guarantee.
    required.sort((a, b) =>
      a.distance - b.distance || lodLoadPriority[a.entry.lod] - lodLoadPriority[b.entry.lod]);
    this.desired.clear();
    for (const { entry } of required) this.desired.add(this.keyFor(entry));
    // Keep queued work for a cell whose currently visible LOD still needs a
    // replacement. Pruning that work was able to discard a valid MID/FAR
    // handoff while a fast aircraft crossed the boundary.
    this.queue = this.queue.filter((entry) => {
      const keep = this.desired.has(this.keyFor(entry)) || this.needsVisibleReplacement(entry, position);
      if (!keep) this.pending.delete(this.keyFor(entry));
      return keep;
    });
    for (const { entry } of required) {
      const key = this.keyFor(entry);
      const loaded = this.loaded.get(key);
      if (loaded) { loaded.lastUsed = performance.now(); continue; }
      if (!this.pending.has(key)) { this.pending.add(key); this.queue.push(entry); }
    }
    this.queue.sort((a, b) => {
      const aDistance = distanceToBounds(position, a);
      const bDistance = distanceToBounds(position, b);
      // Current cells always win. Within the same useful band, look-ahead
      // cells win over side/behind cells so a Fighter does not outrun its
      // next replacement, while FAR still precedes MID/NEAR for one cell.
      const aPreloadOnly = aDistance > ranges[a.lod] + desiredMargin;
      const bPreloadOnly = bDistance > ranges[b.lod] + desiredMargin;
      if (aPreloadOnly !== bPreloadOnly) return aPreloadOnly ? 1 : -1;
      const aAhead = isAhead(position, this.preloadDirection, a) ? 0 : 1;
      const bAhead = isAhead(position, this.preloadDirection, b) ? 0 : 1;
      if (aAhead !== bAhead && Math.abs(aDistance - bDistance) < 5_000) return aAhead - bAhead;
      return aDistance - bDistance || lodLoadPriority[a.lod] - lodLoadPriority[b.lod];
    });
    this.pump();
    this.refreshLodVisibility(position);
    this.evict(position);
  }

  private pump(): void {
    while (this.alive && this.active < this.maxConcurrency && this.queue.length) {
      const entry = this.queue.shift()!;
      const key = this.keyFor(entry);
      if ((!this.desired.has(key) && !this.needsVisibleReplacement(entry, this.lastPosition)) || this.loaded.has(key)) {
        this.pending.delete(key);
        continue;
      }
      this.active += 1;
      void fetch(`/data/dallas/${entry.filename}`).then((response) => response.json()).then((chunk: CompactChunk) => {
        // Fetches cannot be cancelled reliably after dispatch, but obsolete
        // responses must be discarded before they allocate Three.js geometry.
        if (!this.alive || !this.manifest || (!this.desired.has(key) && !this.needsVisibleReplacement(entry, this.lastPosition)) || this.loaded.has(key)) {
          this.discardedLoads += 1;
          return;
        }
        const city: CompactCityData = { v: this.manifest.v, source: this.manifest.source, attribution: this.manifest.attribution, license: this.manifest.license, chunkSize: this.manifest.chunkSize, chunks: [chunk] };
        const result = addOsmCityData(this.scene, city, this.options);
        // Groups are attached atomically within this promise continuation.
        // Hide them until applyLodVisibility chooses the replacement so a
        // renderer frame can never see both LODs or a blank handoff.
        for (const group of result.groups) group.visible = false;
        // Manifest bytes only measure compact JSON on disk. Cache pressure is
        // caused by the expanded GPU buffers, which are often several times
        // larger; count those so the 128 MiB LRU is a real resource ceiling.
        const bytes = Math.max(entry.bytes, geometryBytes(result.groups));
        this.loaded.set(key, { entry, groups: result.groups, bytes, lastUsed: performance.now() });
        this.loadedBytes += bytes;
        this.loadedChunks += 1;
        this.applyLodVisibility(entry.id, this.lastPosition);
      }).catch(() => {
        // Failed chunk requests must remain retryable as the player approaches again.
      }).finally(() => { this.pending.delete(key); this.active -= 1; this.pump(); });
    }
  }

  private applyLodVisibility(id: string, position: THREE.Vector3): void {
    const representative = order.map((lod) => this.loaded.get(`${lod}:${id}`)).find(Boolean)?.entry;
    if (!representative) return;
    const distance = distanceToBounds(position, representative);
    const previous = this.visibleLod.get(id);
    if (distance > exitRanges.far + farRetentionMargin) {
      this.visibleLod.delete(id);
      for (const lod of order) {
        const loaded = this.loaded.get(`${lod}:${id}`);
        if (loaded) for (const group of loaded.groups) group.visible = false;
      }
      return;
    }
    const desired = this.targetLodFor(representative, position);

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
    const candidates = [...this.loaded.values()].sort((a, b) => {
      const aVisible = this.visibleLod.get(a.entry.id) === a.entry.lod ? 1 : 0;
      const bVisible = this.visibleLod.get(b.entry.id) === b.entry.lod ? 1 : 0;
      return aVisible - bVisible || a.lastUsed - b.lastUsed;
    });
    for (const loaded of candidates) {
      const distance = distanceToBounds(position, loaded.entry);
      const distant = distance > ranges[loaded.entry.lod] + 4_000;
      const replacementReady = order.some((lod) => lod !== loaded.entry.lod && this.loaded.has(`${lod}:${loaded.entry.id}`));
      const visible = this.visibleLod.get(loaded.entry.id) === loaded.entry.lod;
      const retained = distance <= exitRanges.far + farRetentionMargin;
      // Never use cache pressure as permission to delete the only rendered
      // cell. It may briefly exceed the nominal cache cap; a non-visible or
      // already-replaced chunk is evicted on a later pass instead.
      if (visible || (retained && !replacementReady)) continue;
      if (!distant && this.loadedBytes <= this.maxBytes) continue;
      this.loaded.delete(this.keyFor(loaded.entry));
      this.loadedBytes -= loaded.bytes;
      disposeOsmGroups(loaded.groups);
      this.evictedChunks += 1;
      this.applyLodVisibility(loaded.entry.id, position);
    }
  }

  private hasVisibleFallback(id: string, position: THREE.Vector3): boolean {
    const visible = this.visibleLod.get(id);
    if (!visible || !this.loaded.has(`${visible}:${id}`)) return false;
    const representative = this.loaded.get(`${visible}:${id}`)?.entry;
    return Boolean(representative && distanceToBounds(position, representative) <= exitRanges.far + farRetentionMargin);
  }

  private targetLodFor(entry: ManifestEntry, position: THREE.Vector3): Lod {
    const distance = distanceToBounds(position, entry);
    const previous = this.visibleLod.get(entry.id);
    if (previous === 'near' && distance <= exitRanges.near) return 'near';
    if (previous === 'mid' && distance > exitRanges.near && distance <= exitRanges.mid) return 'mid';
    if (previous === 'far' && distance > exitRanges.mid) return 'far';
    if (distance <= enterRanges.near) return 'near';
    if (distance <= enterRanges.mid) return 'mid';
    return 'far';
  }

  private needsVisibleReplacement(entry: ManifestEntry, position: THREE.Vector3): boolean {
    const visible = this.visibleLod.get(entry.id);
    return visible !== undefined && visible !== entry.lod && entry.lod === this.nextLoadLod(entry, position) &&
      this.hasVisibleFallback(entry.id, position);
  }

  private nextLoadLod(entry: ManifestEntry, position: THREE.Vector3): Lod {
    const target = this.targetLodFor(entry, position);
    const visible = this.visibleLod.get(entry.id);
    if (!visible || visible === target) return !visible ? 'far' : target;
    const quality: Lod[] = ['far', 'mid', 'near'];
    const visibleIndex = quality.indexOf(visible);
    const targetIndex = quality.indexOf(target);
    // Cross each LOD boundary in sequence. A FAR cell therefore becomes MID
    // before NEAR, and a fast outward jump keeps the old detail until MID is
    // attached, then steps down to FAR on the next update.
    return quality[visibleIndex + Math.sign(targetIndex - visibleIndex)];
  }

  dispose(): void {
    this.alive = false;
    for (const loaded of this.loaded.values()) disposeOsmGroups(loaded.groups);
    this.loaded.clear(); this.cells.clear(); this.queue = []; this.desired.clear(); this.pending.clear(); this.visibleLod.clear(); this.loadedBytes = 0;
  }

  getStats(): DallasStreamingStats {
    const loaded: Record<Lod, number> = { near: 0, mid: 0, far: 0 };
    for (const value of this.loaded.values()) loaded[value.entry.lod] += 1;
    return {
      loaded,
      loadedBytes: this.loadedBytes,
      cacheLimitBytes: this.maxBytes,
      queued: this.queue.length,
      pending: this.pending.size,
      loadedChunks: this.loadedChunks,
      evictedChunks: this.evictedChunks,
      discardedLoads: this.discardedLoads,
    };
  }

  private keyFor(entry: ManifestEntry): string { return `${entry.lod}:${entry.id}`; }
}
