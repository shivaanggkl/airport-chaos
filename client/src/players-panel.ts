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

// Five stable row slots; roster updates only change text that actually changed.
export class PlayersPanel {
  private readonly title = document.createElement('span');
  private readonly toggle = document.createElement('button');
  private readonly content = document.createElement('div');
  private readonly more = document.createElement('small');
  private readonly rows = Array.from({ length: 5 }, () => {
    const row = document.createElement('div');
    const name = document.createElement('span');
    const score = document.createElement('strong');
    const level = document.createElement('span');
    const status = document.createElement('span');
    row.className = 'human-player-row';
    score.title = 'Score';
    level.title = 'City Mastery level';
    status.className = 'human-player-status';
    row.append(name, score, level, status);
    return { row, name, score, level, status };
  });
  private collapsed = false;

  constructor(root: HTMLElement) {
    try { this.collapsed = localStorage.getItem('airport-chaos-players-collapsed') === '1'; } catch { /* default expanded */ }
    this.toggle.type = 'button';
    this.content.id = 'human-player-rows';
    this.toggle.setAttribute('aria-controls', this.content.id);
    const header = document.createElement('div');
    header.className = 'human-player-header';
    header.append(this.title, this.toggle);
    this.content.append(...this.rows.map(row => row.row), this.more);
    root.append(header, this.content);
    this.toggle.onclick = () => {
      this.collapsed = !this.collapsed;
      try { localStorage.setItem('airport-chaos-players-collapsed', this.collapsed ? '1' : '0'); } catch { /* optional preference */ }
      this.applyCollapse();
    };
    root.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    this.applyCollapse();
    this.update([], null);
  }

  private applyCollapse(): void {
    this.content.hidden = this.collapsed;
    this.toggle.textContent = this.collapsed ? '+' : '−';
    this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
    this.toggle.setAttribute('aria-label', this.collapsed ? 'Show players' : 'Hide players');
  }

  update(players: readonly HumanRosterEntry[], localId: string | null): void {
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
      text(slot.score, Math.round(player.score).toLocaleString());
      text(slot.level, `Lv ${player.masteryLevel}`);
      text(slot.status, statusLabel[player.status]);
    }
    text(this.more, players.length > shown.length ? `+${players.length - shown.length} more · TAB for details` : '');
  }
}
