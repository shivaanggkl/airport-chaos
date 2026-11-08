import { createRankHelmet, rankHelmetForLevel } from './rank-helmets';

export type CombatPilotIdentity = { name: string; level: number; helmetVerified?: boolean };

/** Shared Sky Duel and Journey aircraft telemetry presentation. */
export class CombatStatsHeader {
  readonly element: HTMLElement;
  private readonly localHud: HTMLElement;
  private readonly opponentHud: HTMLElement;
  readonly localScore: HTMLElement;
  readonly opponentScore: HTMLElement;
  readonly clock: HTMLElement;
  private identityKey = '';

  constructor(label = 'Sky Duel match status') {
    this.element = document.createElement('div');
    this.element.className = 'sky-duel-hud';
    this.element.setAttribute('aria-label', label);
    this.localHud = this.hudPilot('local');
    this.opponentHud = this.hudPilot('opponent');
    const scoreboard = document.createElement('div'); scoreboard.className = 'sky-duel-hud-scoreboard';
    this.localScore = document.createElement('strong'); this.localScore.className = 'sky-duel-hud-score';
    this.clock = document.createElement('time'); this.clock.className = 'sky-duel-hud-clock';
    this.opponentScore = document.createElement('strong'); this.opponentScore.className = 'sky-duel-hud-score';
    scoreboard.append(this.localScore, this.clock, this.opponentScore);
    this.element.append(this.localHud, scoreboard, this.opponentHud);
    this.element.hidden = true;
  }

  private hudPilot(side: 'local' | 'opponent'): HTMLElement {
    const pilot = document.createElement('div');
    pilot.className = `sky-duel-hud-pilot sky-duel-hud-${side}`;
    const helmet = document.createElement('span'); helmet.className = 'sky-duel-hud-helmet';
    const name = document.createElement('strong'); name.className = 'sky-duel-hud-name';
    const level = document.createElement('span'); level.className = 'sky-duel-hud-level';
    const health = document.createElement('span'); health.className = 'sky-duel-hud-vital sky-duel-hud-health';
    const heart = document.createElement('img'); heart.src = '/media/hud/health.png'; heart.alt = 'Health';
    const healthValue = document.createElement('span'); healthValue.className = 'sky-duel-hud-health-value';
    health.append(heart, healthValue);
    const altitude = document.createElement('span'); altitude.className = 'sky-duel-hud-vital sky-duel-hud-altitude';
    const altitudeIcon = document.createElement('img'); altitudeIcon.src = '/media/hud/altitude.png'; altitudeIcon.alt = 'Altitude';
    const altitudeValue = document.createElement('span'); altitudeValue.className = 'sky-duel-hud-altitude-value';
    altitude.append(altitudeIcon, altitudeValue);
    pilot.append(...(side === 'local' ? [helmet, name, level, health, altitude] : [altitude, health, level, name, helmet]));
    return pilot;
  }

  setIdentity(localPilot: CombatPilotIdentity, opponentPilot?: CombatPilotIdentity): void {
    const key = JSON.stringify([localPilot, opponentPilot]);
    if (key === this.identityKey) return;
    this.identityKey = key;
    for (const [side, element, pilot] of [['local', this.localHud, localPilot],
      ['opponent', this.opponentHud, opponentPilot]] as const) {
      element.querySelector<HTMLElement>('.sky-duel-hud-name')!.textContent = pilot?.name || (side === 'opponent' ? 'OPPONENT' : 'YOU');
      element.querySelector<HTMLElement>('.sky-duel-hud-level')!.textContent = pilot && pilot.helmetVerified !== false ? `L${pilot.level}` : '';
      const helmet = element.querySelector<HTMLElement>('.sky-duel-hud-helmet')!;
      helmet.replaceChildren();
      if (pilot && pilot.helmetVerified !== false) helmet.append(createRankHelmet(rankHelmetForLevel(pilot.level), 'small'));
    }
  }

  updateTelemetry(localHealth: number, localAltitudeFeet: number, opponentHealth?: number, opponentAltitudeFeet?: number): void {
    if (this.element.hidden) return;
    const update = (host: HTMLElement, health?: number, altitude?: number): void => {
      const healthText = Number.isFinite(health) ? String(Math.max(0, Math.round(health!))) : '—';
      const altitudeText = Number.isFinite(altitude) ? `${Math.max(0, Math.round(altitude!)).toLocaleString()} FT` : '— FT';
      const healthElement = host.querySelector<HTMLElement>('.sky-duel-hud-health-value')!;
      const altitudeElement = host.querySelector<HTMLElement>('.sky-duel-hud-altitude-value')!;
      if (healthElement.textContent !== healthText) healthElement.textContent = healthText;
      if (altitudeElement.textContent !== altitudeText) altitudeElement.textContent = altitudeText;
    };
    update(this.localHud, localHealth, localAltitudeFeet);
    update(this.opponentHud, opponentHealth, opponentAltitudeFeet);
  }

}
