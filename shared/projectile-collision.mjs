// Earliest continuous contact between a projectile segment and a moving sphere.
// The target position is its end-of-tick position; rewind both objects equally.
export function projectileImpactFraction(start, end, target, velocity, delta, radius) {
  const x = start.x - target.x + velocity.x * delta;
  const y = start.y - target.y + velocity.y * delta;
  const z = start.z - target.z + velocity.z * delta;
  const dx = end.x - start.x - velocity.x * delta;
  const dy = end.y - start.y - velocity.y * delta;
  const dz = end.z - start.z - velocity.z * delta;
  const c = x*x + y*y + z*z - radius*radius;
  if (c <= 0) return 0;
  const a = dx*dx + dy*dy + dz*dz;
  if (a < 1e-12) return null;
  const b = x*dx + y*dy + z*dz;
  const disc = b*b - a*c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
