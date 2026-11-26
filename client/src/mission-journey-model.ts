import { journeyMainMissionIds, journeyCategorySlots, journeyPursuitSlots, type JourneyCategorySlot } from '../../shared/journey-categories.mjs';
export type MissionJourneyStage = JourneyCategorySlot & Readonly<{
  number: number;
}>;
export type MissionJourneyStatus = 'completed' | 'current' | 'available' | 'locked';
// Internal selection indices never become mission identities or gameplay numbers.
export const missionJourneyStages: readonly MissionJourneyStage[] = [...journeyCategorySlots, ...journeyPursuitSlots]
  .map((slot, index) => ({ ...slot, number: index + 1 }));
export function missionJourneyStatuses(completed: readonly boolean[], eligible: readonly boolean[], signInRequired: boolean) {
  const signInEntry = (stage: MissionJourneyStage) => signInRequired && stage.kind === 'main' && stage.categoryNumber === 1;
  const first = missionJourneyStages.findIndex((stage, index) => stage.implementation === 'playable' && !completed[index] && (eligible[index] || signInEntry(stage)));
  return { currentMission: first < 0 ? 0 : first + 1, statuses: missionJourneyStages.map((stage, index): MissionJourneyStatus => stage.implementation === 'placeholder' ? 'locked' : completed[index] ? 'completed' : !eligible[index] && !signInEntry(stage) ? 'locked' : index === first ? 'current' : 'available') };
}
export function journeyMainCompleted(progress: Readonly<Record<string, {
  completed?: boolean;
}>>): number {
  return journeyMainMissionIds.filter(id => progress[id]?.completed).length;
}

/** All current Dallas slots, including bonuses, bosses and the two extra pursuits. */
export function journeyCompletionSummary(progress: Readonly<Record<string, { completed?: boolean }>>): Readonly<{completed: number; total: number}> {
  return {
    completed: new Set(missionJourneyStages.filter(stage => stage.implementation === 'playable' && progress[stage.id]?.completed === true).map(stage => stage.id)).size,
    total: missionJourneyStages.length,
  };
}
