// Shared presentation only: no gameplay eligibility or reward rules live here.
export const visualLanguage = {
  you: { icon: '▲', label: 'YOU', color: '#ecfbff' },
  airport: { icon: '◆', label: 'Airport', color: '#73d8ed' },
  downtown: { icon: '■', label: 'City Center', color: '#8db8c6' },
  waypoint: { icon: '⊕', label: 'Waypoint', color: '#ffd865' },
  mission: { icon: '🎯', label: 'Mission', color: '#ffd865' },
  player: { icon: '●', label: 'Real Player', color: '#ff6d70' },
  ai: { icon: '◇', label: 'AI Pilot', color: '#53c9ff' },
  event: { icon: '○', label: 'Live Event', color: '#ffb34f' },
  challenge: { icon: '△', label: 'Sky Challenge', color: '#63e8ff' },
  territory: { icon: '□', label: 'Territory', color: '#f4f7ff' },
  stunt: { icon: '✦', label: 'Stunt', color: '#63e8ff' },
  discovery: { icon: '◈', label: 'Discovery', color: '#77d8d2' },
  objectives: { icon: '✓', label: 'Objectives', color: '#ffd865' },
  repair: { icon: '◇', label: 'Repair', color: '#66edc0' },
  heat: { icon: '🔥', label: 'Danger', color: '#ff7862' },
  wanted: { icon: '🔥', label: 'Most Wanted', color: '#ff7862' },
  credits: { icon: '🪙', label: 'Credits', color: '#ffd865' },
  mastery: { icon: '✦', label: 'City Level', color: '#ffd865' },
  score: { icon: '★', label: 'Score', color: '#f4f7ff' },
  contact: { icon: '✉', label: 'Contact & Advertise', color: '#f4f7ff' },
} as const;
export const meaningColors = {
  danger: visualLanguage.player.color,
  ai: visualLanguage.ai.color,
  safe: visualLanguage.repair.color,
  reward: visualLanguage.credits.color,
  warning: visualLanguage.event.color,
  neutral: visualLanguage.you.color,
  mission: visualLanguage.mission.color,
  level: '#a799ff',
} as const;
export const territoryOwnershipColors = {
  own: '#36d8ff', enemy: '#ff4555', contested: '#ffb331', neutral: '#f4f7ff',
} as const;
export type TerritoryAppearance = keyof typeof territoryOwnershipColors;
export type VisualIdentity = keyof typeof visualLanguage;
export const targetBracketPath = 'M40 13H13V40 M88 13H115V40 M13 88V115H40 M88 115H115V88';
// Both the game canvas and Help use the exact same target-bracket geometry.
export const targetBracketMarkup = () => `<svg viewBox="0 0 128 128" aria-hidden="true"><path d="${targetBracketPath}" fill="none" stroke="${visualLanguage.player.color}" stroke-width="5"/></svg>`;
for (const [key, value] of Object.entries(visualLanguage)) document.documentElement.style.setProperty(`--identity-${key}`, value.color);
for (const [key, value] of Object.entries(meaningColors)) document.documentElement.style.setProperty(`--meaning-${key}`, value);
export function identityText(kind: VisualIdentity): string {
  const item = visualLanguage[kind]; return `${item.icon} ${item.label}`;
}
export function playerFacingText(text: string): string { return text
  .replace(/\bHEAT\b/g, 'DANGER').replace(/\bHeat\b/g, 'Danger')
  .replace(/\bHULL\b/g, 'PLANE LIFE').replace(/\bHull\b/g, 'Plane Life')
  .replace(/\bTHROTTLE\b/g, 'SPEED').replace(/\bThrottle\b/g, 'Speed')
  .replace(/\bDESCENT RATE\b/g, 'COMING DOWN').replace(/\bDESCENT\b/g, 'COMING DOWN')
  .replace(/\bALIGNMENT\b/g, 'LINE UP').replace(/\bBANK\b/g, 'TILT')
  .replace(/\bMASTERY\b/g, 'CITY LEVEL').replace(/\bMastery\b/g, 'City Level')
  .replace(/\bbank it\b/g, 'collect it'); }
export function identityMarkup(kind: VisualIdentity): string {
  const item = visualLanguage[kind];
  return `<span class="game-identity" style="color:${item.color}"><b aria-hidden="true">${item.icon}</b> ${item.label}</span>`;
}
export const aircraftRoles = {
  trainer: 'Easy • Stable • Explore',
  cargo: 'Heavy • Tough • Cargo',
  privateJet: 'Fast • Smooth • Travel',
  fighter: 'Fastest • Agile • Combat',
} as const;
