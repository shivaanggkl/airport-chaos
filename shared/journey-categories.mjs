import { journeyCatalog } from './journey-mission.mjs';
const legacy = new Map(journeyCatalog.map(slot => [slot.id, slot]));
const id = number => `journey-dallas-${String(number).padStart(2, '0')}`;
const category = (key, label, color, icon, ids) => Object.freeze({ id: key, label, color, icon, missionIds: Object.freeze(ids) });
export const journeyCategories = Object.freeze([
  category('golden-rings', 'GOLDEN RINGS', '#ffd239', 'ring', [...[1, 3, 4, 5, 6].map(id), 'journey-dallas-coin-hunt-01']),
  category('shooting-targets', 'SHOOTING TARGETS', '#60ef45', 'target', ['journey-dallas-sharpshooter-01', 'journey-dallas-sharpshooter-02', 'journey-dallas-sharpshooter-03', ...Array.from({ length: 3 }, (_, i) => `placeholder-dallas-shooting-targets-${i + 4}`)]),
  category('plane-battles', 'PLANE BATTLES', '#ff683e', 'plane', [id(13), id(14), 'journey-dallas-twin-hunters-01', id(16), id(17), id(18)]),
  category('giant-battles', 'GIANT BATTLES', '#b76aff', 'giant', [7, 8, 9, 10, 11, 12].map(id)),
  category('territory-missions', 'TERRITORY MISSIONS', '#35f2e4', 'territory', ['journey-dallas-capture-01', 'journey-dallas-territory-defense-01', 'journey-dallas-capture-three-01', 'placeholder-dallas-27', 'placeholder-dallas-territory-missions-5', 'placeholder-dallas-territory-missions-6']),
]);
const extras = [
  { id: 'bonus-2', label: 'BONUS 2', color: '#ffd239', icon: 'gift', missionIds: ['journey-dallas-coin-hunt-02'] },
  { id: 'dr-boss', label: 'DR. BOSS', color: '#e05dff', icon: 'boss', missionIds: [id(23), id(19)] },
];
export const journeySpecialPursuits = Object.freeze({ id: 'special-pursuits', label: 'SPECIAL PURSUITS', color: '#ff683e', icon: 'plane', missionIds: Object.freeze([id(15), 'journey-dallas-ace-intercept-01']) });
export const journeyDisplayGroups = Object.freeze([
  ...journeyCategories, extras[0], extras[1],
].map(group => Object.freeze(group)));
function slots(groups) {
  return groups.flatMap(group => group.missionIds.map((id, index) => {
    // Both bonus entries launch the same authoritative coin-hunt round.
    const missionId = id === 'journey-dallas-coin-hunt-02' ? 'journey-dallas-coin-hunt-01' : id;
    return Object.freeze({
      id, missionId, categoryId: group.id, categoryNumber: index + 1,
      kind: missionId === 'journey-dallas-coin-hunt-01' || group.id === 'shooting-targets' && index === 5 ? 'bonus' : group.id === 'dr-boss' ? 'boss' : group.id === 'special-pursuits' ? 'special' : 'main',
      title: legacy.get(missionId)?.title ?? 'COMING SOON',
      implementation: legacy.get(missionId)?.implementation === 'playable' ? 'playable' : 'placeholder',
    });
  }));
}
export const journeyCategorySlots = Object.freeze(slots(journeyDisplayGroups));
export const journeyPursuitSlots = Object.freeze(slots([journeySpecialPursuits]));
export const journeyMainMissionIds = Object.freeze(journeyCategorySlots.filter(slot => slot.kind === 'main').map(slot => slot.id));
export const journeyPlayableMainIds = Object.freeze(journeyCategorySlots.filter(slot => slot.kind === 'main' && slot.implementation === 'playable').map(slot => slot.id));
const slotById = new Map([...journeyCategorySlots, ...journeyPursuitSlots].map(slot => [slot.id, slot]));
export function journeyCategorySlot(missionId) { return slotById.get(missionId); }
export function categoryMissionAccess(missionId, completed) {
  const slot = slotById.get(missionId);
  if (!slot || slot.implementation !== 'playable')
    return false;
  if (slot.missionId !== slot.id) return categoryMissionAccess(slot.missionId, completed);
  if (completed.has(missionId))
    return true;
  if (slot.kind === 'main') {
    const group = journeyCategories.find(group => group.id === slot.categoryId);
    return slot.categoryNumber === 1 || completed.has(group.missionIds[slot.categoryNumber - 2]);
  }
  if (slot.kind === 'bonus') {
    const group = journeyCategories.find(group => group.id === slot.categoryId);
    return Boolean(group && group.missionIds.slice(0, slot.categoryNumber - 1).every(id => completed.has(id)));
  }
  if (slot.kind === 'special')
    return completed.has(slot.categoryNumber === 1 ? 'journey-dallas-twin-hunters-01' : id(15));
  if (slot.kind === 'boss')
    return slot.categoryNumber === 1 ? journeyPlayableMainIds.every(id => completed.has(id)) : completed.has(id(23));
  return false;
}
