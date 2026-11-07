// Dallas authoring data stays in its original map coordinates. The same
// physical scale is applied to client scenery and server gameplay anchors.
export const DALLAS_WORLD_SCALE = 3;

export function scaleDallasPoint(point) {
  return { ...point, x: point.x * DALLAS_WORLD_SCALE, z: point.z * DALLAS_WORLD_SCALE };
}

export function scaleDallasBounds(bounds) {
  return {
    ...bounds,
    minX: bounds.minX * DALLAS_WORLD_SCALE,
    maxX: bounds.maxX * DALLAS_WORLD_SCALE,
    minZ: bounds.minZ * DALLAS_WORLD_SCALE,
    maxZ: bounds.maxZ * DALLAS_WORLD_SCALE,
  };
}
