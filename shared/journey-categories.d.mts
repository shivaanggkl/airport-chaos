export type JourneyCategory = Readonly<{
  id: string;
  label: string;
  color: string;
  icon: string;
  missionIds: readonly string[];
}>;
export type JourneyCategorySlot = Readonly<{
  id: string;
  categoryId: string;
  categoryNumber: number;
  kind: 'main' | 'bonus' | 'boss' | 'special';
  title: string;
  implementation: 'playable' | 'placeholder';
}>;
export const journeyCategories: readonly JourneyCategory[];
export const journeyDisplayGroups: readonly JourneyCategory[];
export const journeySpecialPursuits: JourneyCategory;
export const journeyCategorySlots: readonly JourneyCategorySlot[];
export const journeyPursuitSlots: readonly JourneyCategorySlot[];
export const journeyMainMissionIds: readonly string[];
export const journeyPlayableMainIds: readonly string[];
export function categoryMissionAccess(missionId: string, completed: ReadonlySet<string>): boolean;
