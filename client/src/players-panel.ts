export type HumanRosterEntry = {
  playerId: string;
  displayName: string;
  score: number;
  masteryLevel: number;
  status: 'flying' | 'onGround' | 'destroyed' | 'respawning' | 'spawnSafe';
};

const statusLabel: Record<HumanRosterEntry['status'], string> = {
  flying: '🟢 FLYING',
  onGround: '🟡 ON GROUND',
  destroyed: '💥 DESTROYED',
  respawning: '⏳ RESPAWNING',
  spawnSafe: '🛡 SPAWN SAFE',
};

const mobilePanelDefault = (): boolean => matchMedia('(pointer: coarse)').matches || innerWidth <= 900;

// Five stable row slots; roster updates only change text that actually changed.
export class PlayersPanel {
  private readonly title = document.createElement('span');
  private readonly indicator = document.createElement('i');
  private readonly toggle = document.createElement('button');
  private readonly content = document.createElement('div');
  private readonly columns = document.createElement('div');
  private readonly more = document.createElement('small');
  private readonly rows = Array.from({ length: 5 }, () => {
    const row = document.createElement('div');
    const identity = document.createElement('div');
    const name = document.createElement('span');
    const ownership = document.createElement('span');
    const dots = Array.from({ length: 3 }, () => document.createElement('i'));
    const score = document.createElement('strong');
    const level = document.createElement('span');
    const status = document.createElement('span');
    row.className = 'human-player-row';
    identity.className = 'human-player-identity';
    ownership.className = 'human-player-ownership';
    ownership.append(...dots);
    identity.append(name, ownership);
    score.title = 'Live Score';
    level.title = 'City Level';
    status.className = 'human-player-status';
    row.append(identity, score, level, status);
    return { row, name, ownership, dots, score, level, status };
  });
  private collapsed = mobilePanelDefault();

  constructor(root: HTMLElement) {
    this.toggle.type = 'button';
    this.toggle.className = 'flight-panel-summary';
    this.content.id = 'human-player-rows';
    this.toggle.setAttribute('aria-controls', this.content.id);
    this.indicator.setAttribute('aria-hidden', 'true');
    this.toggle.append(this.title, this.indicator);
    this.columns.className = 'human-player-columns';
    this.columns.innerHTML = '<span>PILOT</span><span>LIVE SCORE</span><span>LEVEL</span>';
    this.content.append(this.columns, ...this.rows.map(row => row.row), this.more);
    root.append(this.toggle, this.content);
    this.toggle.onclick = () => {
      this.collapsed = !this.collapsed;
      this.applyCollapse();
    };
    root.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    this.applyCollapse();
    this.update([], null);
  }

  private applyCollapse(): void {
    this.content.hidden = this.collapsed;
    this.toggle.parentElement?.classList.toggle('expanded', !this.collapsed);
    this.indicator.textContent = this.collapsed ? '▸' : '▾';
    this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
    this.toggle.setAttribute('aria-label', this.collapsed ? 'Show players' : 'Hide players');
  }

  update(players: readonly HumanRosterEntry[], localId: string | null,
    ownedTerritories?: (playerId: string) => readonly { name: string; color: string }[]): void {
    const sorted = [...players].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName) || a.playerId.localeCompare(b.playerId));
    const shown = sorted.slice(0, 5);
    const local = sorted.find(player => player.playerId === localId);
    if (local && !shown.includes(local)) shown[4] = local;
    const text = (element: HTMLElement, value: string): void => { if (element.textContent !== value) element.textContent = value; };
    text(this.title, `PLAYERS ${players.length}`);
    for (let index = 0; index < this.rows.length; index++) {
      const slot = this.rows[index], player = shown[index];
      if (slot.row.hidden !== !player) slot.row.hidden = !player;
      if (!player) continue;
      const you = player.playerId === localId;
      slot.row.classList.toggle('you', you);
      slot.row.classList.toggle('destroyed', player.status === 'destroyed');
      text(slot.name, `${player.displayName}${you ? ' (You)' : ''}`);
      const ownership = ownedTerritories?.(player.playerId) ?? [];
      slot.ownership.hidden = ownership.length === 0;
      slot.ownership.setAttribute('aria-label', ownership.length ? `Owns ${ownership.map(({ name }) => name).join(', ')}` : '');
      for (let dotIndex = 0; dotIndex < slot.dots.length; dotIndex += 1) {
        const dot = slot.dots[dotIndex], territory = ownership[dotIndex];
        dot.hidden = !territory;
        if (territory) { dot.style.backgroundColor = territory.color; dot.title = territory.name; }
      }
      text(slot.score, Math.round(player.score).toLocaleString());
      text(slot.level, `Lv ${player.masteryLevel}`);
      text(slot.status, statusLabel[player.status]);
    }
    text(this.more, players.length > shown.length ? `+${players.length - shown.length} more · TAB for details` : '');
  }
}

export type CityTerritoryEntry = {
  name: string;
  color: string;
  controllerId?: string;
  controllerName?: string;
  contested: boolean;
};

// Fixed row slots retain focus/scroll while authoritative ownership changes.
export class CityTerritoriesPanel {
  private readonly title = document.createElement('span');
  private readonly indicator = document.createElement('i');
  private readonly toggle = document.createElement('button');
  private readonly content = document.createElement('div');
  private readonly rows = Array.from({ length: 8 }, () => CityTerritoriesPanel.createRow());
  private collapsed = mobilePanelDefault();

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

  constructor(root: HTMLElement) {
    this.toggle.type = 'button';
    this.toggle.className = 'flight-panel-summary';
    this.content.id = 'city-territory-rows';
    this.toggle.setAttribute('aria-controls', this.content.id);
    this.indicator.setAttribute('aria-hidden', 'true');
    this.toggle.append(this.title, this.indicator);
    this.content.append(...this.rows.map(({ row }) => row));
    root.append(this.toggle, this.content);
    this.toggle.onclick = () => {
      this.collapsed = !this.collapsed;
      this.applyCollapse();
    };
    root.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    this.applyCollapse();
    this.update([], null);
  }

  private applyCollapse(): void {
    this.content.hidden = this.collapsed;
    this.toggle.parentElement?.classList.toggle('expanded', !this.collapsed);
    this.indicator.textContent = this.collapsed ? '▸' : '▾';
    this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
    this.toggle.setAttribute('aria-label', this.collapsed ? 'Show city territories' : 'Hide city territories');
  }

  update(territories: readonly CityTerritoryEntry[], localId: string | null, online = true): void {
    while (this.rows.length < territories.length) {
      const slot = CityTerritoriesPanel.createRow();
      this.rows.push(slot);
      this.content.append(slot.row);
    }
    const title = `TERRITORIES${online ? '' : ' · OFFLINE'}`;
    if (this.title.textContent !== title) this.title.textContent = title;
    for (let index = 0; index < this.rows.length; index += 1) {
      const slot = this.rows[index];
      const territory = territories[index];
      slot.row.hidden = !territory;
      if (!territory) continue;
      if (slot.name.textContent !== territory.name) slot.name.textContent = territory.name;
      if (slot.dot.dataset.color !== territory.color) {
        slot.dot.style.backgroundColor = territory.color;
        slot.dot.dataset.color = territory.color;
      }
      const owner = !online ? 'OFFLINE' : territory.contested ? 'CONTESTED' : !territory.controllerId ? 'Neutral' :
        territory.controllerId === localId ? 'YOU' : territory.controllerName ?? 'Pilot';
      if (slot.owner.textContent !== owner) slot.owner.textContent = owner;
      slot.owner.title = owner;
      slot.row.classList.toggle('you', online && territory.controllerId === localId && !territory.contested);
      slot.row.classList.toggle('contested', online && territory.contested);
      slot.row.classList.toggle('neutral', !territory.contested && (!online || !territory.controllerId));
    }
  }
}
