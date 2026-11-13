import { journeyMissionOrder } from '../../shared/journey-mission.mjs';
export type ChapterNumber = 1 | 2 | 3 | 4 | 5;
export type MissionJourneyStage = Readonly<{
  id: string;
  number: number;
  chapter: ChapterNumber;
  implementation: 'playable' | 'placeholder';
  x: number;
  y: number;
}>;
export type MissionJourneyStatus = 'completed' | 'current' | 'available' | 'locked';

// Percentages share one coordinate system with the SVG route. Every mission
// moves right and slightly upward, including the chapter transitions.
const stageCount = journeyMissionOrder.length + 6;
const missionXs = Array.from({ length: stageCount }, (_, index) => 2.5 + index * 95 / (stageCount - 1));
const missionYs = Array.from({ length: stageCount }, (_, index) => 74 - index * 40 / (stageCount - 1));
export const chapterNames = ['GOLDEN GATES', 'SKY BATTLES', 'GIANT PLANE BATTLES', 'DR. BOSS RISING', 'COMING SOON'] as const;

export const missionJourneyStages: readonly MissionJourneyStage[] = missionXs.map((x, index) => ({
  id: journeyMissionOrder[index] ?? `placeholder-dallas-${index + 1}`,
  number: index + 1,
  chapter: (Math.floor(index / 6) + 1) as ChapterNumber,
  implementation: index < journeyMissionOrder.length ? 'playable' : 'placeholder',
  x,
  y: missionYs[index]!,
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
