type WorldPosition = { x: number; y: number; z: number };

export function isFiniteGuidancePosition(position?: WorldPosition | null): position is WorldPosition {
  return position != null && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

export function horizontalDistanceSquared(a: WorldPosition, b: WorldPosition): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

const feetFormatter = new Intl.NumberFormat('en-US');

export function opponentAltitudeGuidance(
  player: WorldPosition, opponent: WorldPosition | null | undefined, metersPerWorldUnit: number, feetPerWorldUnit: number,
): string {
  if (!isFiniteGuidancePosition(player) || !isFiniteGuidancePosition(opponent)) return '';
  const horizontalMeters = Math.sqrt(horizontalDistanceSquared(player, opponent)) * metersPerWorldUnit;
  const verticalFeet = (opponent.y - player.y) * feetPerWorldUnit;
  if (!Number.isFinite(horizontalMeters) || horizontalMeters > 6_000 || !Number.isFinite(verticalFeet) || Math.abs(verticalFeet) <= 300) return '';
  const feet = Math.round(Math.abs(verticalFeet) / 100) * 100;
  return `${verticalFeet > 0 ? '↑ FLY UP' : '↓ FLY DOWN'} ${feetFormatter.format(feet)} FT`;
}
