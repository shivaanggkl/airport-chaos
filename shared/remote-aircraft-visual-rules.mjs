const smoothstep = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

/**
 * Screen-space width for the existing non-collidable remote-aircraft proxy.
 * The real aircraft mesh remains fixed at world scale; only this readability
 * overlay uses screen-space sizing.
 */
export function remoteProxyPixelWidth(distance) {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  if (safeDistance < 550) return 20 + (16 - 20) * smoothstep(safeDistance, 350, 550);
  if (safeDistance < 900) return 16;
  if (safeDistance < 1_300) return 16 + (12 - 16) * smoothstep(safeDistance, 900, 1_300);
  return 12;
}
