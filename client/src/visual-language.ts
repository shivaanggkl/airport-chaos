// Shared presentation only: no gameplay eligibility or reward rules live here.
export const visualLanguage = {
  you: { icon: '▲', label: 'YOU', color: '#ecfbff' },
  airport: { icon: '◆', label: 'Airport', color: '#73d8ed' },
  downtown: { icon: '■', label: 'Downtown', color: '#8db8c6' },
  waypoint: { icon: '⊕', label: 'Waypoint', color: '#ffd865' },
  player: { icon: '●', label: 'Real Player', color: '#ff6d70' },
  ai: { icon: '◇', label: 'AI Pilot', color: '#53c9ff' },
  event: { icon: '○', label: 'Live Event', color: '#ffb34f' },
  challenge: { icon: '△', label: 'Sky Challenge', color: '#63e8ff' },
  territory: { icon: '□', label: 'Territory', color: '#bca6ef' },
  stunt: { icon: '✦', label: 'Stunt', color: '#63e8ff' },
  discovery: { icon: '◈', label: 'Discovery', color: '#77d8d2' },
  objectives: { icon: '✓', label: 'Objectives', color: '#ffd865' },
  repair: { icon: '◇', label: 'Repair', color: '#66edc0' },
  heat: { icon: '🔥', label: 'Danger', color: '#ff7862' },
  wanted: { icon: '🔥', label: 'Most Wanted', color: '#ff7862' },
  credits: { icon: '🪙', label: 'Credits', color: '#ffd865' },
  mastery: { icon: '★', label: 'Mastery', color: '#ffd865' },
} as const;
export type VisualIdentity = keyof typeof visualLanguage;
export const targetBracketPath = 'M40 13H13V40 M88 13H115V40 M13 88V115H40 M88 115H115V88';
// Both the game canvas and Help use the exact same target-bracket geometry.
export const targetBracketMarkup = () => `<svg viewBox="0 0 128 128" aria-hidden="true"><path d="${targetBracketPath}" fill="none" stroke="${visualLanguage.player.color}" stroke-width="5"/></svg>`;
for (const [key, value] of Object.entries(visualLanguage)) document.documentElement.style.setProperty(`--identity-${key}`, value.color);
export function identityText(kind: VisualIdentity): string {
  const item = visualLanguage[kind]; return `${item.icon} ${item.label}`;
}
export function playerFacingText(text: string): string { return text.replace(/\bHEAT\b/g, 'DANGER').replace(/\bHeat\b/g, 'Danger').replace(/\bbank it\b/g, 'collect it'); }
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
