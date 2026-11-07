// Continuous aircraft-center sweep against the existing world obstacle envelope.
// The bottom offset and horizontal padding retain the flight client's contact rules.
export function segmentHitsWorldObstacle(start, end, obstacle, padding = 3.5) {
  let enter = 0, leave = 1;
  const dx = end.x - start.x, dz = end.z - start.z, dy = end.y - start.y;
  const minX = obstacle.x - obstacle.halfX - padding, maxX = obstacle.x + obstacle.halfX + padding;
  const minZ = obstacle.z - obstacle.halfZ - padding, maxZ = obstacle.z + obstacle.halfZ + padding;
  if (dx === 0) { if (start.x < minX || start.x > maxX) return false; }
  else { const a = (minX - start.x) / dx, b = (maxX - start.x) / dx; enter = Math.max(enter, Math.min(a,b)); leave = Math.min(leave, Math.max(a,b)); }
  if (dz === 0) { if (start.z < minZ || start.z > maxZ) return false; }
  else { const a = (minZ - start.z) / dz, b = (maxZ - start.z) / dz; enter = Math.max(enter, Math.min(a,b)); leave = Math.min(leave, Math.max(a,b)); }
  const top = (obstacle.baseY ?? 0) + obstacle.height + .8;
  if (dy === 0) { if (start.y > top) return false; }
  else if (dy > 0) leave = Math.min(leave, (top - start.y) / dy);
  else enter = Math.max(enter, (top - start.y) / dy);
  if (enter > leave) return false;
  const polygon = obstacle.polygon;
  if (!polygon?.length) return true;
  const x = start.x + dx * enter, z = start.z + dz * enter;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1,z1] = polygon[j], [x2,z2] = polygon[i];
    if ((z1 > z) !== (z2 > z) && x < (x2-x1)*(z-z1)/(z2-z1)+x1) inside = !inside;
    const ex = x2-x1, ez = z2-z1, denominator = dx*ez-dz*ex;
    if (Math.abs((x-x1)*ez-(z-z1)*ex) < 1e-8 &&
        x >= Math.min(x1,x2) && x <= Math.max(x1,x2) && z >= Math.min(z1,z2) && z <= Math.max(z1,z2)) return true;
    if (denominator === 0) continue;
    const t = ((x1-start.x)*ez-(z1-start.z)*ex)/denominator;
    const u = ((x1-start.x)*dz-(z1-start.z)*dx)/denominator;
    if (t >= enter && t <= leave && u >= 0 && u <= 1) return true;
  }
  return inside;
}
