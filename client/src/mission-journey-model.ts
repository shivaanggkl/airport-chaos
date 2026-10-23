export type ChapterNumber = 1 | 2 | 3 | 4;
export type MissionJourneyStage = Readonly<{
  id: string;
  number: number;
  chapter: ChapterNumber;
  implementation: 'playable';
  x: number;
  y: number;
}>;
export type MissionJourneyStatus = 'completed' | 'current' | 'available' | 'locked';

// Percentages share one coordinate system with the SVG route. Every mission
// moves right and slightly upward, including the chapter transitions.
const missionXs = Array.from({ length: 24 }, (_, index) => 2.5 + index * 95 / 23);
const missionYs = Array.from({ length: 24 }, (_, index) => 74 - index * 40 / 23);
export const chapterNames = ['TAKE OFF', 'CITY SKIES', 'HIGHER GROUND', 'FINAL APPROACH'] as const;

export const missionJourneyStages: readonly MissionJourneyStage[] = missionXs.map((x, index) => ({
  id: `journey-dallas-${String(index + 1).padStart(2, '0')}`,
  number: index + 1,
  chapter: (Math.floor(index / 6) + 1) as ChapterNumber,
  implementation: 'playable' as const,
  x,
  y: missionYs[index]!,
}));

export function missionJourneyStatuses(completed: readonly boolean[], eligible: readonly boolean[], signInRequired: boolean): {
  currentMission: number;
  statuses: readonly MissionJourneyStatus[];
} {
  const eligibleIndex = completed.findIndex((done, index) => !done && eligible[index] === true);
  const currentMission = eligibleIndex >= 0 ? eligibleIndex + 1 : signInRequired && !completed[0] ? 1 : 0;
  return {
    currentMission,
    statuses: missionJourneyStages.map((stage, index) => completed[index] ? 'completed'
      : !eligible[index] && !(stage.number === 1 && signInRequired) ? 'locked'
        : stage.number === currentMission ? 'current' : 'available'),
  };
}
