import { journeyCatalog, journeyChapters } from '../../shared/journey-mission.mjs';
export type ChapterNumber = 1 | 2 | 3 | 4;
export type MissionJourneyStage = Readonly<{
  id: string;
  title: string;
  number: number;
  chapter: ChapterNumber;
  implementation: 'playable' | 'placeholder';
  x: number;
  y: number;
}>;
export type MissionJourneyStatus = 'completed' | 'current' | 'available' | 'locked';

// Percentages share one coordinate system with the SVG route. Every mission
// moves right and slightly upward, including the chapter transitions.
export const chapterNames = journeyChapters;
export const missionJourneyStages: readonly MissionJourneyStage[] = journeyCatalog.map(slot => ({
  ...slot,
  x: 2.5 + (slot.number - 1) * 95 / (journeyCatalog.length - 1),
  y: 74 - (slot.number - 1) * 40 / (journeyCatalog.length - 1),
}));

export function missionJourneyStatuses(completed: readonly boolean[], eligible: readonly boolean[], signInRequired: boolean): {
  currentMission: number;
  statuses: readonly MissionJourneyStatus[];
} {
  const eligibleIndex = completed.findIndex((done, index) => !done && eligible[index] === true && missionJourneyStages[index]?.implementation === 'playable');
  const currentMission = eligibleIndex >= 0 ? eligibleIndex + 1 : signInRequired && !completed[0] ? 1 : 0;
  return {
    currentMission,
    statuses: missionJourneyStages.map((stage, index) => stage.implementation === 'placeholder' ? 'locked' : completed[index] ? 'completed'
      : !eligible[index] && !(stage.number === 1 && signInRequired) ? 'locked'
        : stage.number === currentMission ? 'current' : 'available'),
  };
}
