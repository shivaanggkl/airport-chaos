export type DiscoveryType =
  | 'landmark'
  | 'airstrip'
  | 'rooftop'
  | 'bridge'
  | 'water'
  | 'downtown'
  | 'airport'
  | 'secret';

export type DiscoveryDefinition = {
  id: string;
  name: string;
  type: DiscoveryType;
  x: number;
  z: number;
  radius: number;
  minAltitude: number;
  maxAltitude: number;
  credits: number;
  setId?: string;
  setBonus?: number;
  mapVisible?: boolean;
};

export type DiscoveryMapMarker = {
  id: string;
  label: string;
  x: number;
  z: number;
  discovered: boolean;
  secret: boolean;
};

export type DiscoveryProgress = { discovered: number; total: number; percent: number };

type DiscoveryCallbacks = {
  onDiscover: (definition: DiscoveryDefinition) => void;
  onSetComplete: (setId: string, bonus: number) => void;
};

export class DiscoverySystem {
  private checkElapsed = 0;

  constructor(
    private readonly definitions: readonly DiscoveryDefinition[],
    private readonly discoveredIds: Set<string>,
    private readonly callbacks: DiscoveryCallbacks,
  ) {}

  update(delta: number, position: { x: number; z: number }, altitude: number): void {
    this.checkElapsed += delta;
    if (this.checkElapsed < 0.18) return;
    this.checkElapsed = 0;
    for (const definition of this.definitions) {
      if (this.discoveredIds.has(definition.id)) continue;
      if (altitude < definition.minAltitude || altitude > definition.maxAltitude) continue;
      if (Math.hypot(position.x - definition.x, position.z - definition.z) > definition.radius) continue;
      this.discoveredIds.add(definition.id);
      this.callbacks.onDiscover(definition);
      this.checkSetCompletion(definition.setId);
      // Keep feedback readable when related locations share a corridor.
      return;
    }
  }

  hydrate(ids: Iterable<string>): void {
    if (ids === this.discoveredIds) return;
    this.discoveredIds.clear();
    for (const id of ids) this.discoveredIds.add(id);
  }

  getProgress(): DiscoveryProgress {
    const discovered = this.definitions.filter((definition) => this.discoveredIds.has(definition.id)).length;
    return { discovered, total: this.definitions.length, percent: this.definitions.length === 0 ? 0 : Math.round(discovered / this.definitions.length * 100) };
  }

  getMapMarkers(): readonly DiscoveryMapMarker[] {
    return this.definitions
      .filter((definition) => definition.mapVisible !== false || this.discoveredIds.has(definition.id))
      .map((definition) => ({
        id: definition.id,
        label: definition.name,
        x: definition.x,
        z: definition.z,
        discovered: this.discoveredIds.has(definition.id),
        secret: definition.type === 'secret',
      }));
  }

  private checkSetCompletion(setId: string | undefined): void {
    if (!setId) return;
    const setDefinitions = this.definitions.filter((definition) => definition.setId === setId);
    if (!setDefinitions.length || !setDefinitions.every((definition) => this.discoveredIds.has(definition.id))) return;
    const completionId = `set:${setId}`;
    if (this.discoveredIds.has(completionId)) return;
    this.discoveredIds.add(completionId);
    this.callbacks.onSetComplete(setId, Math.max(...setDefinitions.map((definition) => definition.setBonus ?? 0)));
  }
}
