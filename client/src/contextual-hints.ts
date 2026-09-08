export const contextualHintDefinitions = {
  runwayControls: {
    title: 'READY TO TAXI',
    body: 'Hold W to add power; hold S to brake, stop, then reverse taxi. ↑/↓ pitch, ←/→ roll, and A/D turns.',
    durationMs: 7_500,
  },
  worldMap: {
    title: 'NAVIGATE THE CITY',
    body: 'Press M for the world map. Pick any airport, landmark, or open point to set a waypoint.',
    durationMs: 6_500,
  },
  stunt: {
    title: 'SKILL OPPORTUNITY',
    body: 'This area supports a stunt. Fly it cleanly for score, then chain a different stunt for a combo.',
    durationMs: 6_500,
  },
  liveEvent: {
    title: 'LIVE EVENT',
    body: 'This optional city activity is shared with nearby pilots. Follow the orange marker, join if you want, or keep free-flying.',
    durationMs: 7_000,
  },
  discovery: {
    title: 'DISCOVERY LOGGED',
    body: 'Discoveries build your city progress and unlock credits once. Open M to see subtle ? markers for places still unknown.',
    durationMs: 6_500,
  },
  garage: {
    title: 'GARAGE AVAILABLE',
    body: 'You can compare and equip unlocked aircraft while safely landed. Open Pilot Menu with TAB, then choose Garage.',
    durationMs: 6_500,
  },
  combat: {
    title: 'COMBAT LOCK',
    body: 'Keep a real pilot inside the center lock circle to lock on and guide rounds. Outside it, gunfire travels straight.',
    durationMs: 6_500,
  },
  formation: {
    title: 'FORMATION',
    body: 'Stay near allied pilots with a similar heading and speed to build a formation bonus together.',
    durationMs: 6_000,
  },
  mostWanted: {
    title: 'MOST WANTED',
    body: 'The marked pilot earns a bounty by surviving. Bring them down for the reward, or stay alive if the marker is yours.',
    durationMs: 7_000,
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
