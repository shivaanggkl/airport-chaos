import { altitudeFeet } from '../../shared/multiplayer-altitude.mjs';

export type HumanRosterEntry = {
  playerId: string;
  displayName: string;
  score: number;
  masteryLevel: number;
  altitudeMeters?: number;
  status: 'flying' | 'onGround' | 'destroyed' | 'respawning' | 'spawnSafe';
};

const statusLabel: Record<HumanRosterEntry['status'], string> = {
  flying: 'FLYING', onGround: 'ON GROUND', destroyed: 'DESTROYED',
  respawning: 'RESPAWNING', spawnSafe: 'SPAWN SAFE',
};

/** Renders every server-provided pilot inside the shared card's scroll area. */
export class PlayersPanel {
  private readonly empty = document.createElement('small');
  private readonly rows: ReturnType<typeof PlayersPanel.createRow>[] = [];

  private static createRow() {
    const row = document.createElement('div');
    const identity = document.createElement('div');
    const dot = document.createElement('i');
    const aircraft = document.createElement('span');
    const name = document.createElement('span');
    const status = document.createElement('small');
    const altitude = document.createElement('small');
    const score = document.createElement('strong');
    row.className = 'human-player-row';
    identity.className = 'human-player-identity';
    dot.className = 'human-player-state-dot';
    aircraft.className = 'human-player-aircraft';
    aircraft.textContent = '✈';
    aircraft.setAttribute('aria-hidden', 'true');
    status.className = 'human-player-status';
    altitude.className = 'human-player-altitude';
    score.title = 'Current flight score';
    identity.append(dot, aircraft, name, status, altitude);
    row.append(identity, score);
    return { row, name, status, altitude, score };
  }

  constructor(private readonly root: HTMLElement, private readonly onCount?: (count: number) => void) {
    root.classList.add('gameplay-info-list');
    root.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    this.empty.className = 'gameplay-info-empty';
    this.empty.textContent = 'WAITING FOR PILOTS';
    root.append(this.empty);
    this.update([], null);
  }

  update(players: readonly HumanRosterEntry[], localId: string | null,
    ownedTerritories?: (playerId: string) => readonly { name: string; color: string }[]): void {
    const sorted = [...players].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName) || a.playerId.localeCompare(b.playerId));
    this.onCount?.(sorted.length);
    while (this.rows.length < sorted.length) {
      const slot = PlayersPanel.createRow();
      this.rows.push(slot);
      this.root.insertBefore(slot.row, this.empty);
    }
    this.empty.hidden = sorted.length > 0;
    for (let index = 0; index < this.rows.length; index++) {
      const slot = this.rows[index], player = sorted[index];
      slot.row.hidden = !player;
      if (!player) continue;
      const you = player.playerId === localId;
      slot.row.classList.toggle('you', you);
      slot.row.dataset.status = player.status;
      const name = you ? 'YOU' : player.displayName;
      if (slot.name.textContent !== name) slot.name.textContent = name;
      if (slot.status.textContent !== statusLabel[player.status]) slot.status.textContent = statusLabel[player.status];
      const feet = player.altitudeMeters === undefined ? undefined : altitudeFeet(player.altitudeMeters);
      const altitude = feet === undefined ? '' : `${feet.toLocaleString()} FT`;
      if (slot.altitude.textContent !== altitude) slot.altitude.textContent = altitude;
      const score = Math.round(player.score).toLocaleString();
      if (slot.score.textContent !== `${score} PTS`) slot.score.textContent = `${score} PTS`;
      const territoryNames = ownedTerritories?.(player.playerId).map(territory => territory.name).join(', ');
      slot.row.setAttribute('aria-label', `${name}, ${statusLabel[player.status]}${altitude ? `, altitude ${altitude}` : ''}, current flight score ${score}, level ${player.masteryLevel}${territoryNames ? `, owns ${territoryNames}` : ''}`);
    }
  }
}

export type CityTerritoryEntry = {
  name: string;
  color: string;
  controllerId?: string;
  controllerName?: string;
  contested: boolean;
  captureProgress?: number;
};

/** Displays server-owned territory state without changing the shared card size. */
export class CityTerritoriesPanel {
  private readonly empty = document.createElement('small');
  private readonly rows: ReturnType<typeof CityTerritoriesPanel.createRow>[] = [];

  private static createRow() {
    const row = document.createElement('div');
    const dot = document.createElement('i');
    const name = document.createElement('span');
    const owner = document.createElement('strong');
    row.className = 'city-territory-row';
    dot.className = 'territory-color-dot';
    row.append(dot, name, owner);
    return { row, dot, name, owner };
  }

  constructor(private readonly root: HTMLElement, private readonly onCount?: (count: number) => void) {
    root.classList.add('gameplay-info-list');
    root.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    this.empty.className = 'gameplay-info-empty';
    this.empty.textContent = 'NO TERRITORIES IN THIS CITY';
    root.append(this.empty);
    this.update([], null);
  }

  setEmptyMessage(message: string): void {
    this.empty.textContent = message || 'NO TERRITORIES IN THIS CITY';
  }

  update(territories: readonly CityTerritoryEntry[], localId: string | null, online = true): void {
    this.onCount?.(online ? territories.filter(territory => territory.controllerId && !territory.contested).length : 0);
    while (this.rows.length < territories.length) {
      const slot = CityTerritoriesPanel.createRow();
      this.rows.push(slot);
      this.root.insertBefore(slot.row, this.empty);
    }
    this.empty.hidden = territories.length > 0;
    for (let index = 0; index < this.rows.length; index++) {
      const slot = this.rows[index], territory = territories[index];
      slot.row.hidden = !territory;
      if (!territory) continue;
      if (slot.name.textContent !== territory.name) slot.name.textContent = territory.name;
      if (slot.dot.dataset.color !== territory.color) {
        slot.dot.style.backgroundColor = territory.color;
        slot.dot.dataset.color = territory.color;
      }
      const owner = !online ? 'OFFLINE' : !territory.controllerId ? 'NEUTRAL' :
        territory.controllerId === localId ? 'YOU' : territory.controllerName ?? 'PILOT';
      const progress = online && territory.captureProgress ? ` · ${Math.round(Math.min(100, Math.max(0, territory.captureProgress)))}%` : '';
      const label = `${owner}${territory.contested ? ' · CONTESTED' : ''}${progress}`;
      if (slot.owner.textContent !== label) slot.owner.textContent = label;
      slot.owner.title = label;
      slot.row.classList.toggle('you', online && territory.controllerId === localId && !territory.contested);
      slot.row.classList.toggle('contested', online && territory.contested);
      slot.row.classList.toggle('neutral', !territory.contested && (!online || !territory.controllerId));
    }
  }
}
