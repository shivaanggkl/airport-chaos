export type GameplayInfoMode = 'mission' | 'multiplayer' | 'tutorial' | 'none';
export type GameplayInfoTab = 'players' | 'territories';

/** One upper-left flight card for mission details or authoritative multiplayer lists. */
export class GameplayInfoCard {
  readonly playersRoot = document.createElement('div');
  readonly territoriesRoot = document.createElement('div');
  private readonly multiplayer = document.createElement('div');
  private readonly toggle = document.createElement('button');
  private readonly tabs: Record<GameplayInfoTab, HTMLButtonElement>;
  private readonly counts: Record<GameplayInfoTab, HTMLElement>;
  private mode: GameplayInfoMode = 'none';
  private tab: GameplayInfoTab = 'players';

  constructor(private readonly root: HTMLElement) {
    root.classList.add('journey-hud', 'gameplay-info-card');
    this.multiplayer.className = 'gameplay-info-multiplayer';
    this.multiplayer.hidden = true;
    const tabBar = document.createElement('div');
    tabBar.className = 'gameplay-info-tabs';
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', 'Multiplayer information');
    const makeTab = (tab: GameplayInfoTab, label: string): [HTMLButtonElement, HTMLElement] => {
      const button = document.createElement('button');
      const count = document.createElement('span');
      button.type = 'button';
      button.id = `gameplay-info-tab-${tab}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', tab === 'players' ? 'real-players' : 'city-territories');
      button.append(label, count);
      button.addEventListener('click', () => this.setTab(tab));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'players' : event.key === 'End' ? 'territories'
          : tab === 'players' ? 'territories' : 'players';
        this.setTab(next);
        this.tabs[next].focus();
      });
      tabBar.append(button);
      return [button, count];
    };
    const [playersTab, playersCount] = makeTab('players', 'PLAYERS ');
    const [territoriesTab, territoriesCount] = makeTab('territories', 'TERRITORIES ');
    this.tabs = { players: playersTab, territories: territoriesTab };
    this.counts = { players: playersCount, territories: territoriesCount };
    this.playersRoot.id = 'real-players';
    this.territoriesRoot.id = 'city-territories';
    for (const [tab, panel] of [['players', this.playersRoot], ['territories', this.territoriesRoot]] as const) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', this.tabs[tab].id);
      panel.tabIndex = 0;
    }
    this.multiplayer.append(tabBar, this.playersRoot, this.territoriesRoot);
    this.toggle.type = 'button';
    this.toggle.className = 'journey-hud-toggle';
    this.toggle.addEventListener('click', () => this.setCollapsed(!root.classList.contains('is-collapsed')));
    root.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    root.append(this.multiplayer, this.toggle);
    this.setTab('players');
    this.setCollapsed(false);
  }

  get activeTab(): GameplayInfoTab { return this.tab; }

  attachTutorial(content: HTMLElement): void {
    this.root.append(content);
  }

  setMode(mode: GameplayInfoMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.classList.toggle('hidden', mode === 'none');
    this.root.classList.toggle('is-multiplayer', mode === 'multiplayer');
    this.root.classList.toggle('is-tutorial', mode === 'tutorial');
    this.multiplayer.hidden = mode !== 'multiplayer';
    this.setTab('players');
    this.setCollapsed(false);
  }

  setTab(tab: GameplayInfoTab): void {
    this.tab = tab;
    for (const key of ['players', 'territories'] as const) {
      const active = key === tab;
      this.tabs[key].setAttribute('aria-selected', String(active));
      this.tabs[key].tabIndex = active ? 0 : -1;
    }
    this.playersRoot.hidden = tab !== 'players';
    this.territoriesRoot.hidden = tab !== 'territories';
  }

  setCounts(players: number, territories: number): void {
    this.counts.players.textContent = String(players);
    this.counts.territories.textContent = String(territories);
  }

  setCount(tab: GameplayInfoTab, count: number): void {
    this.counts[tab].textContent = String(count);
  }

  setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('is-collapsed', collapsed);
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    this.toggle.setAttribute('aria-label', collapsed ? 'Show flight information' : 'Hide flight information');
  }

  reset(): void {
    this.setTab('players');
    this.setCollapsed(false);
    this.setCounts(0, 0);
  }
}
