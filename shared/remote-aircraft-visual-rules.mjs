const smoothstep = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

/**
 * Screen-space width for the non-collidable remote-player contact marker.
 * The real aircraft mesh remains fixed at world scale and uses perspective.
 */
export function remoteProxyPixelWidth(distance) {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  if (safeDistance < 600) return 14 + 6 * smoothstep(safeDistance, 150, 600);
  if (safeDistance < 2_500) return 20 + 4 * smoothstep(safeDistance, 600, 2_500);
  return 24;
}
