import * as THREE from 'three';
import { addOsmCityData, disposeOsmGroups, type CompactChunk, type CompactCityData } from './osm-city';

type Lod = 'near' | 'mid' | 'far';
type ManifestEntry = { id: string; lod: Lod; x: number; z: number; minX: number; maxX: number; minZ: number; maxZ: number; filename: string; bytes: number };
type Manifest = Omit<CompactCityData, 'chunks'> & { chunks: ManifestEntry[] };
type FeatureCounts = { roads: number; buildings: number; water: number; landuse: number; aeroways: number };
type Loaded = { entry: ManifestEntry; groups: THREE.Group[]; bytes: number; lastUsed: number; features: FeatureCounts };
type CellEntries = Partial<Record<Lod, ManifestEntry>>;
type ActiveRequest = { entry: ManifestEntry; controller: AbortController; startedAt: number };
type BuildJob = { entry: ManifestEntry; payload: string; fetchedAt: number; fetchMs: number };
type Options = Parameters<typeof addOsmCityData>[2];
export type DallasStreamingStats = {
  loaded: Record<Lod, number>;
  visible: Record<Lod, number>;
  desired: Record<Lod, number>;
  requested: Record<Lod, number>;
  loadedBytes: number;
  cacheLimitBytes: number;
  queued: number;
  pending: number;
  activeFetches: number;
  queuedBuilds: number;
  abortedFetches: number;
  protectedCells: { visible: number; ahead: number; immediateFallback: number };
  loadedChunks: number;
  evictedChunks: number;
  discardedLoads: number;
  failedFetches: number;
  missingImmediateCells: number;
  averageFetchMs: number;
  maxFetchMs: number;
  averageParseMs: number;
  maxParseMs: number;
  averageBuildMs: number;
  maxBuildMs: number;
  maxBuildFilename: string;
  speed: number;
  preloadDistance: number;
};
export type DallasChunkVisualDebug = {
  id: string;
  lod: Lod;
  desiredLod: Lod;
  lifecycle: 'attached' | 'building' | 'fetching' | 'queued' | 'absent';
  source: FeatureCounts | undefined;
  attached: boolean;
  groupVisible: boolean;
  meshVisible: number;
  meshes: number;
  buildingMeshes: number;
  roadMeshes: number;
  vertices: number;
  indices: number;
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } | undefined;
  cameraDistance: number | undefined;
  frustumIntersects: boolean | undefined;
  groupLayers: number;
  cameraLayers: number;
  material: { opacity: number; transparent: boolean; depthTest: boolean; depthWrite: boolean } | undefined;
};
const ranges: Record<Lod, number> = { near: 5_000, mid: 15_000, far: 35_000 };
const order: Lod[] = ['near', 'mid', 'far'];
const enterRanges: Record<Lod, number> = { near: 4_600, mid: 14_200, far: 35_000 };
const exitRanges: Record<Lod, number> = { near: 5_900, mid: 16_200, far: 36_250 };
const desiredMargin = 1_250;
const farRetentionMargin = 2_000;
const preloadSeconds = 6;
const maxPreloadDistance = 6_000;
// A cell may only advance one stage at a time (FAR → MID → NEAR), but a
// completed coarse cell close to the aircraft must advance before we spend
// the initial load budget on coarse cells at the edge of the 35 km window.
// The previous order did the opposite: it drained hundreds of FAR requests
// first, leaving DFW/Downtown visibly sparse for a long time after boot.
const lodLoadPriority: Record<Lod, number> = { near: 0, mid: 1, far: 2 };

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

function featureCounts(chunk: CompactChunk): FeatureCounts {
  return {
    roads: chunk.r.length / 6,
    buildings: chunk.b.length,
    water: chunk.w.length,
    landuse: chunk.p.length,
    aeroways: (chunk.a?.length ?? 0) / 6,
  };
}

export class DallasChunkStreamer {
  private manifest?: Manifest;
  private readonly cells = new Map<string, CellEntries>();
  private readonly loaded = new Map<string, Loaded>();
  private readonly desired = new Set<string>();
  private readonly pending = new Set<string>();
  private readonly visibleLod = new Map<string, Lod>();
  private queue: ManifestEntry[] = [];
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private buildQueue: BuildJob[] = [];
  private alive = true;
  private loadedBytes = 0;
  private lastPosition = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly preloadPosition = new THREE.Vector3();
  private readonly preloadDirection = new THREE.Vector3();
  private lastStreamUpdateAt = 0;
  private readonly maxConcurrency = 4;
  private readonly maxBytes = 128 * 1024 * 1024;
  private pumpScheduled = false;
  private loadedChunks = 0;
  private evictedChunks = 0;
  private discardedLoads = 0;
  private failedFetches = 0;
  private lastMissingWarningAt = -Infinity;
  private abortedFetches = 0;
  private needsRebalance = false;
  private buildScheduled = false;
  private fetchTotalMs = 0;
  private fetchCount = 0;
  private maxFetchMs = 0;
  private parseTotalMs = 0;
  private parseCount = 0;
  private maxParseMs = 0;
  private buildTotalMs = 0;
  private buildCount = 0;
  private maxBuildMs = 0;
  private maxBuildFilename = 'n/a';
  private currentSpeed = 0;
  private currentPreloadDistance = 0;

  constructor(private readonly scene: THREE.Scene, private readonly options: Options) {
    void fetch('/data/dallas/manifest.json').then((response) => {
      if (!response.ok) throw new Error(`Dallas manifest returned ${response.status}`);
      return response.json() as Promise<Manifest>;
    }).then((manifest) => {
      if (!this.alive) return;
      this.manifest = manifest;
      this.cells.clear();
      for (const entry of manifest.chunks) {
        const cell = this.cells.get(entry.id) ?? {};
        cell[entry.lod] = entry;
        this.cells.set(entry.id, cell);
      }
    }).catch(() => { this.failedFetches += 1; });
  }

  update(position: THREE.Vector3, velocity?: THREE.Vector3): void {
    if (!this.manifest || !this.alive) return;
    const now = performance.now();
    // Re-evaluate while a request queue exists, but avoid re-sorting the full
    // manifest every render frame when the aircraft is stationary.
    if (this.lastPosition.distanceToSquared(position) < 140 * 140 && now - this.lastStreamUpdateAt < 120) return;
    this.lastPosition.copy(position);
    this.lastStreamUpdateAt = now;
    // Async build completion rebalances without a new velocity sample. Retain
    // its magnitude: preloadDirection is already normalized, not a velocity.
    if (velocity) {
      this.preloadDirection.copy(velocity).setY(0);
      this.currentSpeed = this.preloadDirection.length();
      if (this.currentSpeed > 1) this.preloadDirection.multiplyScalar(1 / this.currentSpeed);
      else this.preloadDirection.set(0, 0, 0);
    }
    const speed = this.currentSpeed;
    const preloadDistance = THREE.MathUtils.clamp(speed * preloadSeconds, 0, maxPreloadDistance);
    this.currentPreloadDistance = preloadDistance;
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
    this.sortQueue(this.queue, position);
    this.cancelLowerPriorityFetches(position);
    this.pump();
    this.refreshLodVisibility(position);
    this.evict(position);
  }

  private pump(): void {
    while (this.alive && this.activeRequests.size < this.maxConcurrency && this.queue.length) {
      const entry = this.queue.shift()!;
      const key = this.keyFor(entry);
      if ((!this.desired.has(key) && !this.needsVisibleReplacement(entry, this.lastPosition)) || this.loaded.has(key)) {
        this.pending.delete(key);
        continue;
      }
      const controller = new AbortController();
      const startedAt = performance.now();
      this.activeRequests.set(key, { entry, controller, startedAt });
      const url = `/data/dallas/${entry.filename}`;
      void fetch(url, { signal: controller.signal }).then((response) => {
        if (import.meta.env.DEV && response.status === 404 &&
            distanceToBounds(this.lastPosition, entry) <= ranges.near &&
            performance.now() - this.lastMissingWarningAt >= 5000) {
          this.lastMissingWarningAt = performance.now();
          console.error('DALLAS_CHUNK_MISSING', { city: 'dallas', cellId: entry.id, lod: entry.lod, url });
        }
        if (!response.ok) throw new Error(`Dallas chunk ${entry.filename} returned ${response.status}`);
        return response.text();
      }).then((payload) => {
        const fetchMs = performance.now() - startedAt;
        this.fetchTotalMs += fetchMs;
        this.fetchCount += 1;
        this.maxFetchMs = Math.max(this.maxFetchMs, fetchMs);
        // Obsolete responses are discarded before parse/build allocation.
        if (!this.alive || !this.manifest || (!this.desired.has(key) && !this.needsVisibleReplacement(entry, this.lastPosition)) || this.loaded.has(key)) {
          this.discardedLoads += 1;
          return;
        }
        this.buildQueue.push({ entry, payload, fetchedAt: performance.now(), fetchMs });
        this.sortBuildQueue();
        this.scheduleBuild();
      }).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) this.failedFetches += 1;
        // Failed chunk requests must remain retryable as the player approaches again.
      }).finally(() => {
        this.activeRequests.delete(key);
        // A job remains pending while its parse/build work waits. This prevents
        // duplicate fetches for the same cell and preserves exact queue state.
        if (!this.buildQueue.some((job) => this.keyFor(job.entry) === key)) this.pending.delete(key);
        // A local/static response can resolve synchronously enough that calling
        // pump() here recursively drains hundreds of FAR chunks in microtasks.
        // That starves rendering, so no attached FAR can advance to local
        // MID/NEAR detail. Yield between batches instead of recursively
        // draining the entire manifest in one task.
        this.schedulePump();
      });
    }
  }

  private processBuildQueue(): void {
    this.buildScheduled = false;
    if (!this.alive || !this.manifest || !this.buildQueue.length) return;
    this.sortBuildQueue();
    // One bounded parse/build per task keeps a 600–900 KB dense NEAR cell
    // from monopolising the main thread while an urgent local replacement is
    // waiting behind it.
    const job = this.buildQueue.shift()!;
    const key = this.keyFor(job.entry);
    if ((!this.desired.has(key) && !this.needsVisibleReplacement(job.entry, this.lastPosition)) || this.loaded.has(key)) {
      this.pending.delete(key);
      this.discardedLoads += 1;
      this.scheduleBuild();
      return;
    }
    let chunk: CompactChunk;
    const parseStartedAt = performance.now();
    try {
      chunk = JSON.parse(job.payload) as CompactChunk;
    } catch {
      this.pending.delete(key);
      this.failedFetches += 1;
      this.scheduleBuild();
      return;
    }
    const parseMs = performance.now() - parseStartedAt;
    this.parseTotalMs += parseMs;
    this.parseCount += 1;
    this.maxParseMs = Math.max(this.maxParseMs, parseMs);
    const buildStartedAt = performance.now();
    const city: CompactCityData = { v: this.manifest.v, source: this.manifest.source, attribution: this.manifest.attribution, license: this.manifest.license, chunkSize: this.manifest.chunkSize, chunks: [chunk] };
    const result = addOsmCityData(this.scene, city, this.options);
    const buildMs = performance.now() - buildStartedAt;
    this.buildTotalMs += buildMs;
    this.buildCount += 1;
    if (buildMs >= this.maxBuildMs) {
      this.maxBuildMs = buildMs;
      this.maxBuildFilename = job.entry.filename;
    }
    // Attach first, then allow the visibility handoff to replace the prior
    // FAR/MID representation atomically; no required cell goes blank.
    for (const group of result.groups) group.visible = false;
    const bytes = Math.max(job.entry.bytes, geometryBytes(result.groups));
    this.loaded.set(key, { entry: job.entry, groups: result.groups, bytes, lastUsed: performance.now(), features: featureCounts(chunk) });
    this.loadedBytes += bytes;
    this.loadedChunks += 1;
    this.pending.delete(key);
    this.applyLodVisibility(job.entry.id, this.lastPosition);
    this.needsRebalance = true;
    this.scheduleBuild();
    this.schedulePump();
  }

  private scheduleBuild(): void {
    if (!this.alive || this.buildScheduled || !this.buildQueue.length) return;
    this.buildScheduled = true;
    window.setTimeout(() => this.processBuildQueue(), 0);
  }

  private priorityScore(entry: ManifestEntry, position: THREE.Vector3): number {
    const distance = distanceToBounds(position, entry);
    const distanceBand = distance <= ranges.near + desiredMargin ? 0
      : distance <= ranges.mid + desiredMargin ? 1
        : distance <= ranges.far + desiredMargin ? 2 : 3;
    const aheadPenalty = isAhead(position, this.preloadDirection, entry) ? 0 : 1;
    // LOD is deliberately the first sort key: an available NEAR replacement
    // always beats a MID/FAR request, even when a fast aircraft has moved far
    // enough that the older request is marginally closer.
    return lodLoadPriority[entry.lod] * 100_000_000 + distanceBand * 10_000_000 + aheadPenalty * 1_000_000 + distance;
  }

  private sortQueue(entries: ManifestEntry[], position: THREE.Vector3): void {
    entries.sort((a, b) => this.priorityScore(a, position) - this.priorityScore(b, position));
  }

  private sortBuildQueue(): void {
    this.buildQueue.sort((a, b) => this.priorityScore(a.entry, this.lastPosition) - this.priorityScore(b.entry, this.lastPosition));
  }

  private cancelLowerPriorityFetches(position: THREE.Vector3): void {
    if (!this.queue.length || !this.activeRequests.size) return;
    const bestQueued = this.queue[0];
    const bestScore = this.priorityScore(bestQueued, position);
    for (const request of [...this.activeRequests.values()].sort((a, b) => this.priorityScore(b.entry, position) - this.priorityScore(a.entry, position))) {
      const requestDistance = distanceToBounds(position, request.entry);
      const requestScore = this.priorityScore(request.entry, position);
      // Preserve a just-in-time coarse bootstrap for the immediate area; it is
      // the only possible visible fallback. Older/outside work yields a slot
      // when a local NEAR/MID replacement arrives.
      const bootstrapCritical = request.entry.lod === 'far' && requestDistance <= ranges.near + desiredMargin && !this.hasVisibleFallback(request.entry.id, position);
      if (bootstrapCritical || request.entry.lod === 'near' || request.controller.signal.aborted || requestScore <= bestScore) continue;
      this.abortedFetches += 1;
      request.controller.abort();
    }
  }

  private schedulePump(): void {
    if (!this.alive || this.pumpScheduled) return;
    this.pumpScheduled = true;
    window.setTimeout(() => {
      this.pumpScheduled = false;
      if (this.needsRebalance && Number.isFinite(this.lastPosition.x)) {
        this.needsRebalance = false;
        this.lastStreamUpdateAt = 0;
        this.update(this.lastPosition);
      } else {
        this.pump();
      }
    }, 16);
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
      const velocityAheadProtected = (
        isAhead(position, this.preloadDirection, loaded.entry) &&
        distanceToBounds(this.preloadPosition, loaded.entry) <= ranges[loaded.entry.lod] + desiredMargin
      );
      const immediateFallbackProtected = loaded.entry.lod === 'far' &&
        distance <= ranges.near + desiredMargin && !replacementReady;
      // Never use cache pressure as permission to delete the only rendered
      // cell. It may briefly exceed the nominal cache cap; a non-visible or
      // already-replaced chunk is evicted on a later pass instead.
      if (visible || velocityAheadProtected || immediateFallbackProtected || (retained && !replacementReady)) continue;
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
    for (const request of this.activeRequests.values()) request.controller.abort();
    for (const loaded of this.loaded.values()) disposeOsmGroups(loaded.groups);
    this.loaded.clear(); this.cells.clear(); this.queue = []; this.buildQueue = []; this.activeRequests.clear(); this.desired.clear(); this.pending.clear(); this.visibleLod.clear(); this.loadedBytes = 0;
  }

  getStats(): DallasStreamingStats {
    const loaded: Record<Lod, number> = { near: 0, mid: 0, far: 0 };
    for (const value of this.loaded.values()) loaded[value.entry.lod] += 1;
    const visible: Record<Lod, number> = { near: 0, mid: 0, far: 0 };
    for (const [id, lod] of this.visibleLod) {
      if (this.loaded.has(`${lod}:${id}`)) visible[lod] += 1;
    }
    const desired: Record<Lod, number> = { near: 0, mid: 0, far: 0 };
    const requested: Record<Lod, number> = { near: 0, mid: 0, far: 0 };
    for (const key of this.desired) desired[key.slice(0, key.indexOf(':')) as Lod] += 1;
    for (const entry of this.queue) requested[entry.lod] += 1;
    for (const request of this.activeRequests.values()) requested[request.entry.lod] += 1;
    for (const job of this.buildQueue) requested[job.entry.lod] += 1;
    let missingImmediateCells = 0;
    const protectedCells = { visible: 0, ahead: 0, immediateFallback: 0 };
    for (const [id, entries] of this.cells) {
      const representative = entries.far ?? entries.mid ?? entries.near;
      if (representative && distanceToBounds(this.lastPosition, representative) <= ranges.near && !this.hasVisibleFallback(id, this.lastPosition)) missingImmediateCells += 1;
    }
    for (const loadedEntry of this.loaded.values()) {
      const distance = distanceToBounds(this.lastPosition, loadedEntry.entry);
      const replacementReady = order.some((lod) => lod !== loadedEntry.entry.lod && this.loaded.has(`${lod}:${loadedEntry.entry.id}`));
      if (this.visibleLod.get(loadedEntry.entry.id) === loadedEntry.entry.lod) protectedCells.visible += 1;
      if (isAhead(this.lastPosition, this.preloadDirection, loadedEntry.entry) &&
          distanceToBounds(this.preloadPosition, loadedEntry.entry) <= ranges[loadedEntry.entry.lod] + desiredMargin) protectedCells.ahead += 1;
      if (loadedEntry.entry.lod === 'far' && distance <= ranges.near + desiredMargin && !replacementReady) protectedCells.immediateFallback += 1;
    }
    return {
      loaded,
      visible,
      desired,
      requested,
      loadedBytes: this.loadedBytes,
      cacheLimitBytes: this.maxBytes,
      queued: this.queue.length,
      pending: this.pending.size,
      activeFetches: this.activeRequests.size,
      queuedBuilds: this.buildQueue.length,
      abortedFetches: this.abortedFetches,
      protectedCells,
      loadedChunks: this.loadedChunks,
      evictedChunks: this.evictedChunks,
      discardedLoads: this.discardedLoads,
      failedFetches: this.failedFetches,
      missingImmediateCells,
      averageFetchMs: this.fetchCount ? this.fetchTotalMs / this.fetchCount : 0,
      maxFetchMs: this.maxFetchMs,
      averageParseMs: this.parseCount ? this.parseTotalMs / this.parseCount : 0,
      maxParseMs: this.maxParseMs,
      averageBuildMs: this.buildCount ? this.buildTotalMs / this.buildCount : 0,
      maxBuildMs: this.maxBuildMs,
      maxBuildFilename: this.maxBuildFilename,
      speed: this.currentSpeed,
      preloadDistance: this.currentPreloadDistance,
    };
  }

  // DEV diagnostics call this at low frequency only. It deliberately inspects
  // the attached scene objects instead of treating a completed HTTP request as
  // a successful visual cell.
  getVisualDebug(position: THREE.Vector3, camera: THREE.Camera): DallasChunkVisualDebug[] {
    if (!this.manifest) return [];
    const frustum = new THREE.Frustum();
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    const candidates = [...this.cells.values()]
      .map((entries) => entries.near ?? entries.mid ?? entries.far)
      .filter((entry): entry is ManifestEntry => Boolean(entry) && distanceToBounds(position, entry!) <= 2_000)
      .sort((a, b) => distanceToBounds(position, a) - distanceToBounds(position, b));
    return candidates.map((representative) => {
      const desiredLod = this.targetLodFor(representative, position);
      const visibleLod = this.visibleLod.get(representative.id);
      const loaded = (visibleLod && this.loaded.get(`${visibleLod}:${representative.id}`))
        ?? order.map((lod) => this.loaded.get(`${lod}:${representative.id}`)).find(Boolean);
      const entry = loaded?.entry ?? representative;
      const key = this.keyFor(entry);
      const inBuild = this.buildQueue.some((job) => this.keyFor(job.entry) === key);
      const inFetch = this.activeRequests.has(key);
      const queued = this.queue.some((queuedEntry) => this.keyFor(queuedEntry) === key);
      const lifecycle: DallasChunkVisualDebug['lifecycle'] = loaded ? 'attached' : inBuild ? 'building' : inFetch ? 'fetching' : queued ? 'queued' : 'absent';
      const worldBounds = new THREE.Box3();
      let hasBounds = false;
      let meshes = 0;
      let meshVisible = 0;
      let buildingMeshes = 0;
      let roadMeshes = 0;
      let vertices = 0;
      let indices = 0;
      let material: DallasChunkVisualDebug['material'];
      for (const group of loaded?.groups ?? []) {
        group.updateWorldMatrix(true, true);
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          meshes += 1;
          if (object.visible && group.visible && object.parent) meshVisible += 1;
          if (object.name.startsWith('osm-building')) buildingMeshes += 1;
          if (object.name === 'osm-road') roadMeshes += 1;
          vertices += object.geometry.getAttribute('position')?.count ?? 0;
          indices += object.geometry.index?.count ?? 0;
          if (!material) {
            const candidate = Array.isArray(object.material) ? object.material[0] : object.material;
            material = { opacity: candidate.opacity, transparent: candidate.transparent, depthTest: candidate.depthTest, depthWrite: candidate.depthWrite };
          }
          object.geometry.computeBoundingBox();
          if (object.geometry.boundingBox) {
            worldBounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
            hasBounds = true;
          }
        });
      }
      const bounds = hasBounds ? {
        minX: worldBounds.min.x, minY: worldBounds.min.y, minZ: worldBounds.min.z,
        maxX: worldBounds.max.x, maxY: worldBounds.max.y, maxZ: worldBounds.max.z,
      } : undefined;
      return {
        id: representative.id,
        lod: entry.lod,
        desiredLod,
        lifecycle,
        source: loaded?.features,
        attached: Boolean(loaded?.groups.length && loaded.groups.every((group) => group.parent === this.scene)),
        groupVisible: Boolean(loaded?.groups.some((group) => group.visible)),
        meshVisible,
        meshes,
        buildingMeshes,
        roadMeshes,
        vertices,
        indices,
        bounds,
        cameraDistance: bounds ? camera.position.distanceTo(worldBounds.getCenter(new THREE.Vector3())) : undefined,
        frustumIntersects: bounds ? frustum.intersectsBox(worldBounds) : undefined,
        groupLayers: loaded?.groups[0]?.layers.mask ?? 0,
        cameraLayers: camera.layers.mask,
        material,
      };
    });
  }

  private keyFor(entry: ManifestEntry): string { return `${entry.lod}:${entry.id}`; }
}
