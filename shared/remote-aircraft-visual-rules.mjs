const smoothstep = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

/**
 * Screen-space width for the non-collidable remote-aircraft contact marker.
 * Keep distant contacts readable without making them look artificially close.
 */
export function remoteProxyPixelWidth(distance) {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  if (safeDistance < 550) return 20 + (16 - 20) * smoothstep(safeDistance, 350, 550);
  if (safeDistance < 900) return 16;
  if (safeDistance < 1_300) return 16 + (12 - 16) * smoothstep(safeDistance, 900, 1_300);
  return 12;
}

/** Keep 5 Hz bot transforms moving between packets without changing authority. */
export function remoteInterpolationDuration(previous, packetInterval, isBot) {
  const target = isBot
    ? Math.max(0.24, Math.min(0.33, packetInterval * 1.2))
    : Math.max(0.09, Math.min(0.2, packetInterval * 1.08));
  return previous + (target - previous) * 0.35;
}
