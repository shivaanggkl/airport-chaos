import { COMBAT_RANGE, BASE_PROJECTILE_SPEED, FIRE_RATE_PER_SECOND } from '../../shared/protocol.mjs';

const fullFiringAllowance = Math.ceil(COMBAT_RANGE / BASE_PROJECTILE_SPEED * Math.max(...Object.values(FIRE_RATE_PER_SECOND))) + 2;

// A pilot cannot consume another pilot's normal firing allowance. Cities are independent.
export class CombatProjectileBudget {
  private readonly owners = new Map<string, number>();
  private readonly cities = new Map<string, number>();
  constructor(private readonly perOwner = fullFiringAllowance, private readonly perCity = fullFiringAllowance * 128) {}
  reserve(owner: string, city: string): boolean {
    const own = this.owners.get(owner) ?? 0, total = this.cities.get(city) ?? 0;
    if (own >= this.perOwner || total >= this.perCity) return false;
    this.owners.set(owner, own + 1); this.cities.set(city, total + 1); return true;
  }
  release(owner: string, city: string): void {
    for (const [map, key] of [[this.owners, owner], [this.cities, city]] as const) {
      const count = map.get(key) ?? 0;
      if (count <= 1) map.delete(key); else map.set(key, count - 1);
    }
  }
}
