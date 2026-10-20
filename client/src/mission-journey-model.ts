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

// Percentages share one coordinate system with the SVG routes and stay in chapter order.
const chapterXs = [[7, 14, 21, 28, 35, 45], [55, 63, 70, 77, 84, 94], [7, 14, 21, 29, 37, 45], [55, 63, 70, 77, 84, 94]] as const;
const chapterYs = [[38, 35, 36, 34, 37, 36], [36, 38, 35, 36, 37, 35], [84, 83, 80, 81, 84, 83], [84, 85, 81, 83, 85, 83]] as const;
export const chapterNames = ['TAKE OFF', 'CITY SKIES', 'HIGHER GROUND', 'FINAL APPROACH'] as const;

export const missionJourneyStages: readonly MissionJourneyStage[] = chapterXs.flatMap((xs, chapter) => xs.map((x, index) => ({
  id: `journey-dallas-${String(chapter * 6 + index + 1).padStart(2, '0')}`,
  number: chapter * 6 + index + 1,
  chapter: (chapter + 1) as ChapterNumber,
  implementation: 'playable' as const,
  x,
  y: chapterYs[chapter]![index]!,
})));

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
