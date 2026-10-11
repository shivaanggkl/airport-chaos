export type Point3 = Readonly<{ x: number; y: number; z: number }>;
export type GateProjection = Readonly<{
  x: number; y: number; z: number; seconds: number;
  lateral: number; vertical: number; opening: number;
  state: 'ALIGNED' | 'EDGE' | 'MISS';
}>;

/** Constant-velocity guidance only. The server still decides actual swept crossings. */
export function projectGateCrossing(position: Point3, velocity: Point3, center: Point3,
  normal: Readonly<{ x: number; z: number }>, radius: number): GateProjection | null {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const along = velocity.x * normal.x + velocity.z * normal.z;
  const behind = (position.x - center.x) * normal.x + (position.z - center.z) * normal.z;
  if (!Number.isFinite(speed) || speed < 50 || !Number.isFinite(along) || along / speed < .24 || behind >= -15) return null;
  const seconds = -behind / along;
  if (!Number.isFinite(seconds) || seconds < .25 || seconds > 8) return null;
  const x = position.x + velocity.x * seconds;
  const y = position.y + velocity.y * seconds;
  const z = position.z + velocity.z * seconds;
  const lateral = (x - center.x) * -normal.z + (z - center.z) * normal.x;
  const vertical = y - center.y;
  const opening = radius * .92;
  const offset = Math.hypot(lateral, vertical);
  return { x, y, z, seconds, lateral, vertical, opening,
    state: offset <= opening * .84 ? 'ALIGNED' : offset <= opening ? 'EDGE' : 'MISS' };
}
