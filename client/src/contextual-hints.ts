import { actionKeyLabel, menuKeyLabel } from './flight-input';
export const contextualHintDefinitions = {
  runwayControls: {
    title: 'LET’S FLY',
    body: `Hold ${actionKeyLabel('throttleUp')} to go faster, then ${actionKeyLabel('pitchUp')} to lift the nose.`,
    durationMs: 5_500,
  },
  worldMap: {
    title: 'FIND A PLACE TO GO',
    body: `Press ${menuKeyLabel('map')} to open the map and set a waypoint anywhere.`,
    durationMs: 5_000,
  },
  firstDestination: {
    title: 'PICK A DESTINATION',
    body: 'Use the bright sky markers or the map to fly toward an airport, Downtown, or a landmark.',
    durationMs: 5_000,
  },
  boost: {
    title: 'BOOST READY',
    body: `Hold ${actionKeyLabel('boost')} in the air for a short speed surge. Release it to recharge the meter.`,
    durationMs: 4_800,
  },
  repair: {
    title: 'HULL DAMAGED',
    body: 'Fly through a green repair beacon, or stop safely at an airport for a full repair.',
    durationMs: 5_000,
  },
  stunt: {
    title: 'SKILL OPPORTUNITY',
    body: 'Fly this opportunity cleanly for score; chain a different stunt for a combo.',
    durationMs: 5_000,
  },
  liveEvent: {
    title: 'LIVE EVENT',
    body: 'This optional city activity is shared with pilots. Follow the orange marker or keep free-flying.',
    durationMs: 5_500,
  },
  discovery: {
    title: 'DISCOVERY LOGGED',
    body: 'This counts once toward city progress. M shows subtle ? markers for unknown places.',
    durationMs: 5_000,
  },
  garage: {
    title: 'GARAGE AVAILABLE',
    body: 'You are safely landed. Press TAB, then open Garage to compare and equip aircraft.',
    durationMs: 5_000,
  },
  combat: {
    title: 'COMBAT LOCK',
    body: 'Get another plane near the circle. Press Space to shoot; LOCKED helps you hit.',
    durationMs: 5_500,
  },
  formation: {
    title: 'FORMATION',
    body: 'Stay near pilots with similar heading and speed to build a formation bonus.',
    durationMs: 5_000,
  },
  mostWanted: {
    title: 'MOST WANTED',
    body: 'The marked pilot earns a bounty by surviving; bringing them down earns the reward.',
    durationMs: 5_500,
  },
} as const;

export type ContextualHintId = keyof typeof contextualHintDefinitions;

type ActiveHint = {
  id: ContextualHintId;
  expiresAt: number;
};

export class ContextualHintSystem {
  private readonly dismissed = new Set<ContextualHintId>();
  private readonly queued: ContextualHintId[] = [];
  private active: ActiveHint | null = null;
  private enabled: boolean;

  constructor(
    dismissedIds: readonly string[],
    enabled: boolean,
    private readonly onChange: (active: ContextualHintId | null) => void,
    private readonly onPersist: (dismissed: readonly ContextualHintId[], enabled: boolean) => void,
  ) {
    this.enabled = enabled;
    for (const id of dismissedIds) {
      if (id in contextualHintDefinitions) this.dismissed.add(id as ContextualHintId);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.queued.length = 0;
    if (!enabled) this.active = null;
    this.onChange(this.active?.id ?? null);
    this.persist();
  }

  trigger(id: ContextualHintId): void {
    // The visual tutorial covers the other systems. Keep only timely prompts;
    // landing risk already has its own single-warning HUD path.
    if (id !== 'runwayControls' && id !== 'worldMap' && id !== 'boost' && id !== 'repair') return;
    if (!this.enabled || this.dismissed.has(id) || this.active?.id === id || this.queued.includes(id)) return;
    this.queued.push(id);
    this.advance();
  }

  dismiss(): void {
    if (!this.active) return;
    this.active = null;
    this.onChange(null);
    this.advance();
  }

  update(now = performance.now()): void {
    if (this.active && now >= this.active.expiresAt) this.dismiss();
  }

  private advance(): void {
    if (!this.enabled || this.active || !this.queued.length) return;
    const id = this.queued.shift()!;
    const definition = contextualHintDefinitions[id];
    this.dismissed.add(id);
    this.active = { id, expiresAt: performance.now() + definition.durationMs };
    this.onChange(id);
    this.persist();
  }

  private persist(): void {
    this.onPersist([...this.dismissed], this.enabled);
  }
}
