import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticEvent = 'selection' | 'confirmation' | 'checkpoint' | 'rewardSuccess' | 'missionSuccess' | 'combatSuccess' | 'damage' | 'destruction' | 'failure';

type HapticAdapter = Pick<typeof Haptics, 'impact' | 'notification'>;
type HapticsDependencies = {
  adapter: HapticAdapter;
  nativeAvailable: () => boolean;
  visible: () => boolean;
  now: () => number;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
};

const preferenceKey = 'airport-chaos-haptics-enabled-v1';
const onceEvents = new Set<HapticEvent>(['checkpoint', 'rewardSuccess', 'missionSuccess', 'combatSuccess', 'destruction', 'failure']);
const cooldownMs: Record<HapticEvent, number> = {
  selection: 100, confirmation: 100, checkpoint: 100, rewardSuccess: 0, missionSuccess: 0, combatSuccess: 0, damage: 300, destruction: 0, failure: 0,
};

export class HapticsManager {
  private enabled = true;
  private readonly lastAt = new Map<HapticEvent, number>();
  private readonly delivered = new Set<string>();

  constructor(private readonly dependencies: HapticsDependencies = {
    adapter: Haptics,
    nativeAvailable: () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Haptics'),
    visible: () => !document.hidden,
    now: () => performance.now(),
    storage: {
      getItem: key => { try { return localStorage.getItem(key); } catch { return null; } },
      setItem: (key, value) => { localStorage.setItem(key, value); },
    },
  }) {
    try { this.enabled = dependencies.storage.getItem(preferenceKey) !== 'off'; } catch { /* Keep the session default. */ }
  }

  isAvailable(): boolean { return this.dependencies.nativeAvailable(); }
  isEnabled(): boolean { return this.isAvailable() && this.enabled; }

  setEnabled(enabled: boolean): void {
    if (!this.isAvailable()) return;
    this.enabled = enabled;
    try { this.dependencies.storage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch { /* Session setting still applies. */ }
  }

  emit(event: HapticEvent, id?: string): void {
    if (!this.isEnabled() || !this.dependencies.visible()) return;
    const now = this.dependencies.now();
    if (now - (this.lastAt.get(event) ?? -Infinity) < cooldownMs[event]) return;
    const key = id && onceEvents.has(event) ? `${event}:${id}` : undefined;
    if (key && this.delivered.has(key)) return;
    this.lastAt.set(event, now);
    if (key) {
      this.delivered.add(key);
      if (this.delivered.size > 128) this.delivered.delete(this.delivered.values().next().value!);
    }
    try {
      const feedback = () => event === 'rewardSuccess' || event === 'missionSuccess' || event === 'combatSuccess' || event === 'failure'
        ? this.dependencies.adapter.notification({ type: event === 'failure' ? NotificationType.Warning : NotificationType.Success })
        : this.dependencies.adapter.impact({ style: event === 'confirmation' || event === 'damage' || event === 'destruction' ? ImpactStyle.Heavy : ImpactStyle.Medium });
      const doubleCombatFeedback = event === 'damage' || event === 'destruction' || event === 'combatSuccess';
      void Promise.resolve(feedback()).then(() => {
        if (doubleCombatFeedback && this.isEnabled() && this.dependencies.visible()) return feedback();
      }).catch(() => undefined);
    } catch { /* Haptics never interrupts the action it accompanies. */ }
  }
}

export const hapticsManager = new HapticsManager();

type JourneyFeedbackState = { attemptId: string; missionId?: string; status: string; gateIndex: number };

export function emitConfirmedJourneyFeedback(manager: HapticsManager, previous: JourneyFeedbackState | null, current: JourneyFeedbackState): void {
  if (!previous || previous.attemptId !== current.attemptId) return;
  if (previous.status !== current.status && current.status === 'COMPLETED') {
    manager.emit(current.missionId === 'journey-dallas-02' ? 'combatSuccess' : 'missionSuccess', current.attemptId);
    return;
  }
  if (previous.status !== current.status && current.status === 'FAILED') {
    manager.emit('failure', current.attemptId);
    return;
  }
  if (current.gateIndex > previous.gateIndex &&
    (current.missionId === 'journey-dallas-06' ? current.gateIndex <= 6 : current.missionId === 'journey-dallas-12' ? current.gateIndex < 6 : current.missionId === 'journey-dallas-10' || current.missionId === 'journey-dallas-11' || current.missionId === 'journey-dallas-13' ? current.gateIndex < 5 : current.gateIndex < 4)) {
    manager.emit('checkpoint', `${current.attemptId}:${current.gateIndex}`);
  }
}

type ProfileRewardState = { season?: {
  seasonId: string;
  rewards: Array<{ id: string; state: string }>;
  weeklyEvent?: { weeklyEventId: string; rewarded: boolean };
} };

export function emitConfirmedProfileRewardFeedback(manager: HapticsManager, previous: ProfileRewardState, current: ProfileRewardState, reason?: string): void {
  if (reason === 'Season Reward Claimed' && current.season) {
    for (const reward of current.season.rewards) {
      if (reward.state === 'claimed' && previous.season?.rewards.find(item => item.id === reward.id)?.state === 'claimable') {
        manager.emit('rewardSuccess', `season:${current.season.seasonId}:${reward.id}`);
      }
    }
  }
  if (reason === 'Weekly Event Reward Claimed' && current.season?.weeklyEvent?.rewarded && !previous.season?.weeklyEvent?.rewarded) {
    manager.emit('rewardSuccess', `weekly-event:${current.season.weeklyEvent.weeklyEventId}`);
  }
}
