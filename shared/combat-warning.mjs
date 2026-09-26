const threatArrows = Object.freeze(['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']);

// Radar-relative bearing: forward is up, right is clockwise. The same eight
// sectors work for the compact HUD arrow on every input/display platform.
export function combatThreatDirection(right, ahead) {
  if (!Number.isFinite(right) || !Number.isFinite(ahead) || Math.hypot(right, ahead) < 0.000001) return '↑';
  const sector = (Math.round(Math.atan2(right, ahead) / (Math.PI / 4)) + threatArrows.length) % threatArrows.length;
  return threatArrows[sector];
}
