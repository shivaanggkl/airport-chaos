import { earnedRankDefinitions, earnedRankIdForLevel, pilotTitleForLevel } from '../../shared/pilot-progression.mjs';

export const rankHelmets = earnedRankDefinitions.map(({ id, level }) => ({
  id,
  level,
  title: pilotTitleForLevel(level),
  src: `/media/rank-helmets/${id}-v2.avif`,
}));

export type RankHelmet = (typeof rankHelmets)[number];

export function rankHelmetForLevel(level: number): RankHelmet {
  return rankHelmets.find(helmet => helmet.id === earnedRankIdForLevel(level)) ?? rankHelmets[0];
}

export function createRankHelmet(helmet: RankHelmet, size: 'large' | 'medium' | 'small' | 'thumbnail', locked = false): HTMLElement {
  const element = document.createElement('span');
  element.className = `rank-helmet rank-helmet--${size}${locked ? ' is-locked' : ''}`;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', `${helmet.title} pilot helmet${locked ? `, unlock at Level ${helmet.level}` : ''}`);
  const image = document.createElement('img');
  image.src = helmet.src;
  image.alt = '';
  image.width = 768;
  image.height = 768;
  image.decoding = 'async';
  image.loading = size === 'thumbnail' ? 'lazy' : 'eager';
  image.addEventListener('error', () => {
    image.remove();
    element.textContent = helmet.title;
    element.classList.add('is-fallback');
  }, { once: true });
  element.append(image);
  return element;
}
