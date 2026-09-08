export const contextualHintDefinitions = {
  runwayControls: {
    title: 'READY TO TAXI',
    body: 'Hold W for power; S brakes and reverses after stopping. ↑/↓ pitch, ←/→ roll, A/D turn.',
    durationMs: 5_500,
  },
  worldMap: {
    title: 'NAVIGATE THE CITY',
    body: 'Press M to open the map and set a waypoint anywhere.',
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
    body: 'Keep a real pilot inside the center circle to lock; outside it, gunfire travels straight.',
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
