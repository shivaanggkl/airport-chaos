export type RunwayCombatProtectionState = {
  lifeState: string;
  airborne: boolean | undefined;
  groundedAtRunway: boolean;
};

export function runwayCombatProtectionActive(state: RunwayCombatProtectionState): boolean;
