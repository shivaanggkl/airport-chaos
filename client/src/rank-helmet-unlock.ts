import { createRankHelmet, rankHelmetForLevel } from './rank-helmets';

const pendingKey = 'airport-chaos-rank-helmet-pending-v1';
const shownKey = 'airport-chaos-rank-helmet-shown-v1';
type RankUnlock = { pilotId: string; level: number; rankId: string };

function read(key: string): RankUnlock | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Partial<RankUnlock> | null;
    if (value && typeof value.pilotId === 'string' && typeof value.level === 'number' && typeof value.rankId === 'string')
      return value as RankUnlock;
  } catch { /* Session storage may be unavailable. */ }
  return undefined;
}

export function queueVerifiedRankHelmetUnlock(pilotId: string, previousLevel: number, level: number): void {
  if (!pilotId || !Number.isFinite(previousLevel) || !Number.isFinite(level) || level <= previousLevel) return;
  const helmet = rankHelmetForLevel(level);
  if (rankHelmetForLevel(previousLevel).id === helmet.id) return;
  const shown = read(shownKey);
  if (shown?.pilotId === pilotId && shown.level >= level) return;
  const pending = read(pendingKey);
  if (pending?.pilotId === pilotId && pending.level >= level) return;
  try { sessionStorage.setItem(pendingKey, JSON.stringify({ pilotId, level, rankId: helmet.id })); }
  catch { /* Cosmetic feedback does not affect progression. */ }
}

export function showPendingRankHelmetUnlock(pilotId: string | undefined, verifiedLevel: number | undefined): void {
  const pending = read(pendingKey);
  if (!pending || !pilotId || !Number.isFinite(verifiedLevel) || pending.pilotId !== pilotId || verifiedLevel! < pending.level) return;
  const helmet = rankHelmetForLevel(verifiedLevel!);
  try {
    sessionStorage.removeItem(pendingKey);
    if (helmet.id === pending.rankId) sessionStorage.setItem(shownKey, JSON.stringify(pending));
  } catch { /* Cosmetic feedback does not affect navigation. */ }
  if (helmet.id !== pending.rankId) return;
  document.querySelector('.rank-helmet-unlock')?.remove();
  const toast = document.createElement('div');
  toast.className = 'rank-helmet-unlock';
  toast.setAttribute('role', 'status');
  const copy = document.createElement('div');
  const heading = document.createElement('strong'); heading.textContent = 'New Rank Unlocked!';
  const rank = document.createElement('span'); rank.textContent = helmet.title;
  copy.append(heading, rank);
  toast.append(createRankHelmet(helmet, 'medium'), copy);
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 4_200);
}
