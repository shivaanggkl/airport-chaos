function bounds(building) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 4; i < building.length - 1; i += 2) {
    minX = Math.min(minX, building[i]); maxX = Math.max(maxX, building[i]);
    minZ = Math.min(minZ, building[i + 1]); maxZ = Math.max(maxZ, building[i + 1]);
  }
  return { minX, maxX, minZ, maxZ, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

export function representativeBuildings(buildings, grid) {
  const isMid = grid === 360;
  if (!isMid && grid !== 1000) throw new RangeError('Unsupported Dallas LOD grid');
  const limit = isMid ? 3 : 8;
  const cells = new Map();
  for (const building of buildings) {
    const box = bounds(building);
    if (!Number.isFinite(box.x) || !Number.isFinite(box.z)) continue;
    const key = `${Math.floor(box.x / grid)}:${Math.floor(box.z / grid)}`;
    const candidates = cells.get(key) ?? [];
    candidates.push({ building, box, area: (box.maxX - box.minX) * (box.maxZ - box.minZ) });
    cells.set(key, candidates);
  }
  const result = [];
  for (const candidates of cells.values()) {
    const selected = [];
    // A substantial real footprint anchors each cell. Subsequent selections
    // maximize separation, so clustered source records cannot monopolize it.
    candidates.sort((a, b) => b.area - a.area || a.box.x - b.box.x || a.box.z - b.box.z);
    selected.push(candidates.shift());
    // Keep a mapped tall building as a second skyline anchor. Area-only
    // sampling otherwise favors warehouses and erases district silhouettes.
    if (candidates.length && selected.length < limit) {
      candidates.sort((a, b) => b.building[0] - a.building[0] || b.area - a.area || a.box.x - b.box.x || a.box.z - b.box.z);
      if (candidates[0].building[0] >= 28) selected.push(candidates.shift());
    }
    while (selected.length < limit && candidates.length) {
      let bestIndex = 0, bestScore = -1;
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const separation = Math.min(...selected.map(other => (candidate.box.x - other.box.x) ** 2 + (candidate.box.z - other.box.z) ** 2));
        const score = separation + Math.min(candidate.area, 60_000) * 0.02;
        if (score > bestScore) { bestScore = score; bestIndex = i; }
      }
      selected.push(candidates.splice(bestIndex, 1)[0]);
    }
    // Distant chunks share one material so preserving the source outlines and
    // heights does not multiply draw calls by every source building family.
    for (const { building } of selected) result.push([building[0], 2, building[2], building[3], ...building.slice(4)]);
  }
  return result;
}
