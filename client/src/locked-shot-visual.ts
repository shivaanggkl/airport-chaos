type Point3 = { x: number; y: number; z: number };

export function lockedShotProgress(origin: Point3, endpoint: Point3, position: Point3): number {
  const dx = endpoint.x - origin.x;
  const dy = endpoint.y - origin.y;
  const dz = endpoint.z - origin.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared < 0.000001) return 1;
  const traveled = (position.x - origin.x) * dx + (position.y - origin.y) * dy + (position.z - origin.z) * dz;
  return Math.max(0, Math.min(1, traveled / lengthSquared));
}
