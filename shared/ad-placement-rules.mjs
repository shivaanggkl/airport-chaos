export const airborneAdVisibilityMultiplier = 2;

export function isAirborneAdPlacement(type) {
  return type === 'SKYBOARD' || type === 'SKY_GATE' || type === 'SPONSOR_BLIMP';
}

export function canCombatSuppressPlacement(type) {
  return type !== 'SPONSOR_BLIMP';
}

export function resolveAdPlacementPresentation(spec) {
  if (!isAirborneAdPlacement(spec.type)) {
    return { position: spec.position, size: spec.size };
  }

  return {
    position: {
      ...spec.position,
      y: spec.position.y * airborneAdVisibilityMultiplier,
    },
    size: {
      x: spec.size.x * airborneAdVisibilityMultiplier,
      y: spec.size.y * airborneAdVisibilityMultiplier,
      z: spec.type === 'SPONSOR_BLIMP'
        ? spec.size.z * airborneAdVisibilityMultiplier
        : spec.size.z,
    },
  };
}
