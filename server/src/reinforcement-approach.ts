type TransportHeading = { x: number; y: number; z: number; yaw: number };

// Enter ahead of the transport at the edges of a pursuing pilot's view, then
// cross inward toward its front flanks before beginning attack passes.
export function reinforcementApproachPoint(
  transport: TransportHeading, ordinal: 3 | 4, phase: 'entry' | 'formation',
): { x: number; y: number; z: number } {
  const side = ordinal === 3 ? -1 : 1;
  const lateral = phase === 'entry' ? 1_250 : 720;
  const along = phase === 'entry' ? -1_000 : -550;
  return {
    x: transport.x + Math.cos(transport.yaw) * side * lateral + Math.sin(transport.yaw) * along,
    y: transport.y + 180,
    z: transport.z - Math.sin(transport.yaw) * side * lateral + Math.cos(transport.yaw) * along,
  };
}
