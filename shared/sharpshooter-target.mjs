// A target's anchor never changes after activation. Motion uses mission elapsed
// time, so pausing/reconnecting preserves the same phase without frame packets.
export function sharpshooterTargetPose(target, elapsedMs, out) {
  const phase = target.stage === 2 ? Math.max(0, elapsedMs - target.activatedAt) * Math.PI * 2 / 8000 : 0;
  const offset = target.stage === 2 ? Math.sin(phase) * 150 : 0;
  out.x = target.x + Math.cos(target.heading) * offset;
  out.y = target.y;
  out.z = target.z - Math.sin(target.heading) * offset;
  return out;
}
