export type EntityType = 'player' | 'ambient' | 'event';
export type EventCombatMode = 'noncombat' | 'protectable' | 'attackable';

export type EntityCapabilities = {
  radarMarker: 'player' | 'ambient' | 'event';
  targetable: boolean;
  damageable: boolean;
  collidable: boolean;
  rewardEligible: boolean;
};

export function entityCapabilities(
  entityType: EntityType,
  eventCombatMode: EventCombatMode = 'noncombat',
): EntityCapabilities {
  if (entityType === 'player') {
    return { radarMarker: 'player', targetable: true, damageable: true, collidable: true, rewardEligible: true };
  }
  if (entityType === 'event') {
    const attackable = eventCombatMode === 'attackable';
    return { radarMarker: 'event', targetable: attackable, damageable: attackable, collidable: false, rewardEligible: false };
  }
  return { radarMarker: 'ambient', targetable: false, damageable: false, collidable: false, rewardEligible: false };
}
