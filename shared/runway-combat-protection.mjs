export function runwayCombatProtectionActive({ lifeState, airborne, groundedAtRunway }) {
  return lifeState === 'alive' && airborne === false && groundedAtRunway === true;
}
