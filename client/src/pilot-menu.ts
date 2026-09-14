import { identityText, visualLanguage, playerFacingText } from './visual-language';
import { controlGroups, controlKeyLabel, menuKeyLabel } from './flight-input';
import { mountAirportChaosLogo } from './brand';
import { companyContact, contactLinks, sponsorLocations } from './company-contact';
export type PilotMenuAction = { label: string; run: () => void; disabled?: boolean; title?: string };

export type PilotMenuActivity = {
  name: string;
  detail: string;
  meta: string;
  actions?: readonly PilotMenuAction[];
};

export type PilotMenuEvent = {
  name: string;
  detail: string;
  meta: string;
  actions?: readonly PilotMenuAction[];
};

export type PilotMenuStunt = { name: string; how: string; where: string; reward: number };

export type PilotMenuPlayer = {
  name: string;
  aircraft: string;
  distance: number | undefined;
  lifecycle: string;
  score: number;
  kills?: number;
  isLocal: boolean;
  isBot?: boolean;
  ownedTerritories?: readonly { name: string; color: string }[];
  mostWanted: boolean;
  king: boolean;
  setWaypoint?: () => void;
};
export type PilotMenuTerritory = {
  id: string;
  name: string;
  controller: string;
  contested: boolean;
  color: string;
  fixedColor: string;
  progress: number;
  distance: number;
  ownedByYou: boolean;
  setWaypoint: () => void;
};
export type PilotMenuObjective = { label: string; progress: number; target: number; reward: number; completed: boolean };
export type PilotMenuMission = { id: string; name: string; detail: string; difficulty: string; credits: number; score: number; completions: number; cooldownUntil: number; territoryIds: readonly string[]; progressText?: string; progress?: number; target?: number; setWaypoint?: () => void };
export type PilotMenuAircraftProgress = { name: string; owned: boolean; premium: boolean; price: number; neededCredits: number };

export type PilotMenuData = {
  progression: { credits: number; score: number; aircraft: readonly PilotMenuAircraftProgress[] };
  missions: { activeId?: string; activeCity?: string; entries: readonly PilotMenuMission[]; accept: (id: string, replace: boolean) => void; abandon: () => void };
  players: { city: string; entries: readonly PilotMenuPlayer[] };
  territories: { city: string; entries: readonly PilotMenuTerritory[]; legend: readonly { name: string; color: string; colorName?: string }[]; neutralColor: string };
  objectives: { daily: readonly PilotMenuObjective[]; weekly: readonly PilotMenuObjective[]; dailyId?: string; weeklyId?: string };
  mastery: { city: string; level: number; xp: number; levelStartXp: number; nextXp: number; rewards: readonly string[] };
  leaderboards: readonly { category: string; weekId: string; entries: readonly { name: string; value: number; you: boolean }[]; localRank?: number }[];
  activities: readonly PilotMenuActivity[];
  liveEvent?: PilotMenuEvent;
  stunts: readonly PilotMenuStunt[];
  discoveries: { city: string; discovered: readonly string[]; remaining: number; total: number; percent: number; openMap: () => void };
  garage: { available: boolean; reason?: string; open: () => void; setAirportWaypoint: () => void };
  hints: { enabled: boolean; toggle: () => void };
  navigation: { enabled: boolean; toggle: () => void };
  audio: { muted: boolean; toggle: () => void; levels: { master: number; engine: number; combat: number; ui: number }; setLevel: (category: 'master' | 'engine' | 'combat' | 'ui', value: number) => void };
  guide: { open: () => void };
};

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = playerFacingText(text);
  if (className) element.className = className;
  return element;
}

function section(title: string): HTMLElement {
  const sectionElement = document.createElement('section');
  sectionElement.className = 'pilot-menu-section';
  const heading = textElement('h2', title);
  const identity = Object.values(visualLanguage).find(item => title === `${item.icon} ${item.label}`);
  if (identity) heading.style.color = identity.color;
  sectionElement.append(heading);
  return sectionElement;
}

function actionButton(action: PilotMenuAction): HTMLButtonElement {
  const button = textElement('button', action.label) as HTMLButtonElement;
  button.type = 'button';
  button.disabled = action.disabled ?? false;
  if (action.title) button.title = action.title;
  button.addEventListener('click', action.run);
  return button;
}

function territoryDot(name: string, color: string): HTMLElement {
  const dot = document.createElement('i');
  dot.className = 'territory-color-dot';
  dot.style.backgroundColor = color;
  dot.title = name;
  dot.setAttribute('aria-label', name);
  return dot;
}

export class PilotMenu {
  private openState = false;
  private content: HTMLDivElement | undefined;
  private readonly sections = ['MISSIONS', 'MAP', 'PLAYERS', 'TERRITORIES', 'PROGRESS', 'GARAGE', 'HELP', 'SETTINGS'] as const;
  private activeSection: (typeof this.sections)[number] = 'MISSIONS';
  private navigation: HTMLElement | undefined;
  private lastData: PilotMenuData | undefined;
  private lastSnapshot = '';
  private lastScrollInteractionAt = 0;
  private advertisingOpen = false;
  private territoryLegendOpen = this.readLegendPreference();
  private pendingMissionId: string | undefined;

  constructor(private readonly element: HTMLElement) {}

  private readLegendPreference(): boolean {
    try { return localStorage.getItem('airport-chaos-tab-territory-legend-collapsed-v1') !== '1'; }
    catch { return true; }
  }

  private setLegendPreference(open: boolean): void {
    this.territoryLegendOpen = open;
    try { localStorage.setItem('airport-chaos-tab-territory-legend-collapsed-v1', open ? '0' : '1'); }
    catch { /* optional UI preference */ }
  }

  private switchTo(name: (typeof this.sections)[number]): void {
    if (this.activeSection === name || !this.lastData) return;
    this.activeSection = name;
    this.render(this.lastData, true);
  }

  private createTerritoryLegend(data: PilotMenuData): HTMLDetailsElement {
    const legend = document.createElement('details');
    legend.className = 'territory-color-legend';
    legend.open = this.territoryLegendOpen;
    legend.addEventListener('toggle', () => {
      if (legend.isConnected && legend.open !== this.territoryLegendOpen) this.setLegendPreference(legend.open);
    });
    legend.append(textElement('summary', 'TERRITORY COLORS'));
    const items = document.createElement('div'); items.className = 'territory-color-legend-items';
    for (const territory of data.territories.legend) {
      const item = document.createElement('span');
      item.append(territoryDot(territory.name, territory.color), textElement('span', `${territory.colorName ? `${territory.colorName} — ` : ''}${territory.name}`));
      items.append(item);
    }
    const neutral = document.createElement('span');
    neutral.append(territoryDot('Neutral', data.territories.neutralColor), textElement('span', 'Silver / White — Neutral'));
    items.append(neutral);
    legend.append(items);
    return legend;
  }

  private progressCard(kind: string, title: string, value: string, explanation: string): HTMLElement {
    const card = document.createElement('section');
    card.className = `pilot-progress-card pilot-progress-${kind}`;
    card.append(textElement('h3', title), textElement('strong', value, 'pilot-progress-value'), textElement('p', explanation));
    return card;
  }

  isOpen(): boolean { return this.openState; }
  isActivelyScrolling(now = performance.now()): boolean { return now - this.lastScrollInteractionAt < 260; }

  open(data: PilotMenuData): void {
    this.openState = true;
    this.activeSection = 'MISSIONS';
    this.lastSnapshot = '';
    this.element.hidden = false;
    this.render(data);
  }

  refresh(data: PilotMenuData): void {
    if (!this.openState || this.isActivelyScrolling()) return;
    const snapshot = this.snapshot(data);
    if (snapshot === this.lastSnapshot) {
      if (this.activeSection === 'MISSIONS') this.updateActiveMission(data);
      if (this.activeSection === 'PROGRESS') this.updateLiveProgress(data);
      if (this.activeSection === 'TERRITORIES') this.updateLiveTerritories(data);
      return;
    }
    this.render(data);
  }

  private snapshot(data: PilotMenuData): string {
    switch (this.activeSection) {
      case 'MISSIONS': return JSON.stringify([this.activeSection, this.pendingMissionId, data.missions.activeId,
        data.missions.activeCity, data.missions.entries.map(({ id, name, detail, difficulty, credits, score, completions, cooldownUntil, territoryIds }) =>
          [id, name, detail, difficulty, credits, score, completions, cooldownUntil, territoryIds]),
        data.territories.entries.map(({ id, controller, contested, progress }) => [id, controller, contested, progress]),
        data.missions.entries.some((entry) => entry.cooldownUntil > Date.now()) ? Math.floor(Date.now() / 60_000) : 0]);
      case 'MAP': return JSON.stringify([this.activeSection, data.territories.legend]);
      case 'PLAYERS': return JSON.stringify([this.activeSection, data.players.entries.map(({ name, aircraft, distance, lifecycle, score, kills, isLocal, isBot, ownedTerritories, mostWanted, king }) =>
        [name, aircraft, distance && Math.round(distance / 100), lifecycle, score, kills, isLocal, isBot, ownedTerritories, mostWanted, king])]);
      case 'TERRITORIES': return JSON.stringify([this.activeSection, data.territories.entries.map(({ id, name, controller, contested, color, ownedByYou }) =>
        [id, name, controller, contested, color, ownedByYou])]);
      case 'PROGRESS': return JSON.stringify([this.activeSection,
        data.progression.aircraft.map(({ name, owned, premium, price }) => [name, owned, premium, price]),
        data.mastery.city, data.mastery.level, data.mastery.levelStartXp, data.mastery.nextXp, data.missions.activeId,
        data.missions.entries.map(({ id, completions }) => [id, completions]),
        data.territories.entries.map(({ id, ownedByYou }) => [id, ownedByYou]), data.leaderboards]);
      case 'GARAGE': return JSON.stringify([this.activeSection, data.garage.available, data.garage.reason]);
      case 'HELP': return this.activeSection;
      case 'SETTINGS': return JSON.stringify([this.activeSection, data.hints.enabled, data.navigation.enabled, data.audio.muted]);
    }
  }

  private updateActiveMission(data: PilotMenuData): void {
    const current = data.missions.entries.find((entry) => entry.id === data.missions.activeId);
    const card = this.content?.querySelector<HTMLElement>('.pilot-menu-mission-active');
    if (!current || !card) return;
    const detail = card.querySelector('p');
    const text = playerFacingText(current.progressText ?? current.detail);
    if (detail && detail.textContent !== text) detail.textContent = text;
    const meter = card.querySelector('progress');
    if (meter && current.target && current.progress !== undefined) meter.value = Math.min(current.target, current.progress);
  }

  private updateLiveProgress(data: PilotMenuData): void {
    const set = (slot: string, value: string) => {
      const element = this.content?.querySelector<HTMLElement>(`[data-progress-slot="${slot}"]`);
      if (element && element.textContent !== value) element.textContent = value;
    };
    set('credits', data.progression.credits.toLocaleString());
    set('score', data.progression.score.toLocaleString());
    const active = data.missions.entries.find((entry) => entry.id === data.missions.activeId);
    set('mission', active?.progressText ? playerFacingText(active.progressText) : '');
    const bar = this.content?.querySelector<HTMLProgressElement>('.pilot-progress-level-bar');
    if (bar) bar.value = data.mastery.level >= 25 ? bar.max : Math.max(0, Math.min(bar.max, data.mastery.xp - data.mastery.levelStartXp));
    const missionBar = this.content?.querySelector<HTMLProgressElement>('.pilot-progress-mission-bar');
    if (missionBar && active?.progress !== undefined) missionBar.value = Math.max(0, Math.min(missionBar.max, active.progress));
    for (const [index, plane] of data.progression.aircraft.entries()) {
      set(`aircraft-${index}`, plane.owned ? '✓ OWNED' : plane.premium ? 'PREMIUM' : plane.neededCredits
        ? `${plane.neededCredits.toLocaleString()} Credits needed` : `${plane.price.toLocaleString()} Credits to unlock`);
    }
  }

  private updateLiveTerritories(data: PilotMenuData): void {
    for (const territory of data.territories.entries) {
      const card = this.content?.querySelector<HTMLElement>(`[data-territory-id="${territory.id}"]`);
      const detail = card?.querySelector<HTMLElement>('.pilot-territory-detail');
      const text = this.territoryDetail(territory);
      if (detail && detail.textContent !== text) detail.textContent = text;
    }
  }

  private territoryDetail(territory: PilotMenuTerritory): string {
    return territory.contested
      ? `Contested · capture paused · ${Math.round(territory.distance)}m away`
      : `${territory.controller} · ${territory.progress > 0 ? `Capture ${territory.progress}% · ` : ''}${Math.round(territory.distance)}m away`;
  }

  private ensureContent(): HTMLDivElement {
    if (this.content) return this.content;
    const card = document.createElement('article');
    card.className = 'pilot-menu-card';
    const header = document.createElement('header');
    const heading = document.createElement('div');
    const kicker = textElement('span', 'AIRPORT CHAOS', 'pilot-menu-kicker');
    heading.append(kicker, textElement('span', 'PILOT MENU', 'pilot-menu-kicker'), textElement('h1', 'What do you want to do?'));
    void mountAirportChaosLogo(kicker, 'brand-logo-menu');
    const close = actionButton({ label: 'Close · TAB', run: () => this.close() });
    header.append(heading, close);
    const content = document.createElement('div');
    content.className = 'pilot-menu-content';
    // Preserve native wheel/trackpad scrolling here while preventing future
    // overlay-level input from treating this UI gesture as flight-camera input.
    content.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
    content.addEventListener('scroll', () => { this.lastScrollInteractionAt = performance.now(); }, { passive: true });
    content.addEventListener('pointerdown', () => { this.lastScrollInteractionAt = performance.now(); }, { passive: true });
    const navigation = document.createElement('nav');
    navigation.className = 'pilot-menu-navigation';
    navigation.setAttribute('aria-label', 'Pilot Menu sections');
    for (const name of this.sections) {
      const button = actionButton({ label: name, run: () => this.switchTo(name) });
      button.dataset.section = name;
      navigation.append(button);
    }
    card.append(header, navigation, content);
    this.element.replaceChildren(card);
    this.content = content;
    this.navigation = navigation;
    return content;
  }

  private render(data: PilotMenuData, switched = false): void {
    this.lastData = data;
    this.lastSnapshot = this.snapshot(data);
    const content = this.ensureContent();
    const scrollTop = switched ? 0 : content.scrollTop;
    content.replaceChildren();
    for (const button of this.navigation?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
      button.classList.toggle('active', button.dataset.section === this.activeSection);
      button.setAttribute('aria-current', button.dataset.section === this.activeSection ? 'page' : 'false');
    }

    if (this.activeSection === 'MISSIONS') {
    const missions = section(identityText('mission').toUpperCase() + 'S');
    missions.querySelector('h2')!.style.color = visualLanguage.mission.color;
    missions.append(textElement('p', 'Choose one mission. Finish it for the full Credits and Score reward.', 'pilot-menu-muted'));
    const current = data.missions.entries.find((entry) => entry.id === data.missions.activeId);
    if (current) {
      const active = this.createCard({
        name: `ACTIVE · ${current.name}`,
        detail: current.progressText ?? current.detail,
        meta: `REWARD · ${visualLanguage.credits.icon} ${current.credits.toLocaleString()} Credits · ${visualLanguage.score.icon} ${current.score.toLocaleString()} Score`,
        actions: [
          ...(current.setWaypoint ? [{ label: 'Set Waypoint', run: current.setWaypoint }] : []),
          { label: 'Abandon Mission', run: data.missions.abandon },
        ],
      });
      active.classList.add('pilot-menu-mission-active');
      this.addMissionTerritories(active, current, data.territories.entries);
      if (current.target && current.progress !== undefined) {
        const bar = document.createElement('progress'); bar.max = current.target; bar.value = Math.min(current.target, current.progress);
        active.append(bar);
      }
      missions.append(active);
    } else if (data.missions.activeId) {
      missions.append(this.createCard({
        name: `ACTIVE IN ${(data.missions.activeCity ?? 'ANOTHER CITY').toUpperCase()}`,
        detail: 'Return to that city to continue, or choose another mission and lose its progress.',
        meta: 'Only one mission can be active.',
        actions: [{ label: 'Abandon Mission', run: data.missions.abandon }],
      }));
    }

    if (this.pendingMissionId && this.pendingMissionId !== data.missions.activeId) {
      const pending = data.missions.entries.find((entry) => entry.id === this.pendingMissionId);
      if (pending) {
        const confirm = this.createCard({ name: 'LEAVE CURRENT MISSION?', detail: 'Current progress will be lost. No Credits or Score will be earned.', meta: `Accept ${pending.name}?`, actions: [
          { label: 'KEEP MISSION', run: () => { this.pendingMissionId = undefined; this.render(data); } },
          { label: 'ACCEPT NEW MISSION', run: () => { this.pendingMissionId = undefined; data.missions.accept(pending.id, true); } },
        ] });
        confirm.classList.add('pilot-menu-mission-confirm');
        missions.append(confirm);
      }
    }
    for (const item of data.missions.entries) {
      const now = Date.now();
      const cooling = item.cooldownUntil > now;
      const active = item.id === data.missions.activeId;
      const card = this.createCard({
        name: `${item.name}${active ? ' · ACTIVE' : item.completions ? ` · COMPLETED ×${item.completions}` : ''}`,
        detail: item.detail,
        meta: `${item.difficulty} · ${visualLanguage.credits.icon} ${item.credits.toLocaleString()} Credits · ${visualLanguage.score.icon} ${item.score.toLocaleString()} Score${cooling ? ` · Replay in ${Math.ceil((item.cooldownUntil - now) / 60_000)} min` : ''}`,
        actions: active ? undefined : [{ label: cooling ? 'COOLDOWN' : item.completions ? 'REPLAY' : 'ACCEPT', disabled: cooling, run: () => {
          if (data.missions.activeId) { this.pendingMissionId = item.id; this.render(data); }
          else data.missions.accept(item.id, false);
        } }],
      });
      this.addMissionTerritories(card, item, data.territories.entries);
      missions.append(card);
    }
    content.append(missions);
    }

    if (this.activeSection === 'MAP') {
      const map = section('MAP');
      map.append(textElement('p', 'Find places and set a waypoint.', 'pilot-menu-muted'));
      map.append(actionButton({ label: 'OPEN MAP · M', run: data.discoveries.openMap }));
      map.append(this.createTerritoryLegend(data)); content.append(map);
    }

    if (this.activeSection === 'PLAYERS') {
    const humanPlayers = data.players.entries.filter((player) => !player.isBot);
    const players = section(`● Players · ${data.players.city} — ${humanPlayers.length} Online`);
    if (!humanPlayers.length) {
      players.append(textElement('p', 'No pilots are currently connected to this city.', 'pilot-menu-muted'));
    }
    for (const player of humanPlayers) {
      const badges = [
        player.mostWanted ? identityText('wanted').toUpperCase() : '',
        player.king ? '♛ KING' : '',
      ].filter(Boolean).join(' · ');
      const meta = [
        player.distance === undefined ? player.lifecycle : `${player.lifecycle} · ${Math.round(player.distance)}m`,
        `Score ${player.score}`,
        player.kills === undefined ? '' : `Kills ${player.kills}`,
        badges,
      ].filter(Boolean).join(' · ');
      const playerCard = this.createCard({
        name: `${player.name}${player.isLocal ? ' (You)' : ''} · ${player.aircraft}`,
        detail: meta,
        meta: player.isLocal
          ? 'Your plane.'
          : 'Another player. Set Waypoint marks where they are now.',
        actions: player.setWaypoint ? [{ label: 'Set Waypoint', run: player.setWaypoint }] : undefined,
      });
      playerCard.querySelector<HTMLElement>('strong')!.style.color = visualLanguage[player.isLocal ? 'you' : 'player'].color;
      if (player.ownedTerritories?.length) {
        const dots = document.createElement('span'); dots.className = 'pilot-player-ownership';
        for (const territory of player.ownedTerritories.slice(0, 3)) dots.append(territoryDot(territory.name, territory.color));
        dots.setAttribute('aria-label', `Owns ${player.ownedTerritories.map(({ name }) => name).join(', ')}`);
        playerCard.querySelector<HTMLElement>('strong')!.append(dots);
      }
      players.append(playerCard);
    }
    content.append(players);
    }

    if (this.activeSection === 'TERRITORIES') {
    const territories = section(identityText('territory'));
    territories.append(this.createTerritoryLegend(data));
    if (!data.territories.entries.length) territories.append(textElement('p', 'No territory control is active in this city.', 'pilot-menu-muted'));
    for (const territory of data.territories.entries) {
      const card = this.createCard({
        name: `${territory.name}${territory.contested ? ' · CONTESTED' : ''}`,
        detail: this.territoryDetail(territory),
        meta: 'Keep flying here to claim it. Parking does not count.',
        actions: [{ label: 'Set Waypoint', run: territory.setWaypoint }],
      });
      card.classList.add('pilot-territory-card');
      card.dataset.territoryId = territory.id;
      card.querySelector('p')!.classList.add('pilot-territory-detail');
      card.style.setProperty('--territory-color', territory.color);
      card.querySelector<HTMLElement>('strong')!.prepend(territoryDot(territory.name, territory.color));
      territories.append(card);
    }
    content.append(territories);
    }

    if (this.activeSection === 'PROGRESS') {
    const progress = section('PROGRESS');
    const cards = document.createElement('div'); cards.className = 'pilot-progress-grid';
    const creditsCard = this.progressCard('credits', `${visualLanguage.credits.icon} CREDITS`, data.progression.credits.toLocaleString(), 'Use Credits to unlock aircraft.');
    creditsCard.querySelector('.pilot-progress-value')!.setAttribute('data-progress-slot', 'credits');
    const scoreCard = this.progressCard('score', `${visualLanguage.score.icon} SCORE`, data.progression.score.toLocaleString(), 'Your competition score.');
    scoreCard.querySelector('.pilot-progress-value')!.setAttribute('data-progress-slot', 'score');
    cards.append(creditsCard, scoreCard);
    const cityLevel = this.progressCard('level', `🏙 CITY LEVEL`, `Level ${data.mastery.level}`, `Your ${data.mastery.city} progress.`);
    const levelBar = document.createElement('progress'); levelBar.className = 'pilot-progress-level-bar';
    levelBar.max = Math.max(1, data.mastery.nextXp - data.mastery.levelStartXp);
    levelBar.value = data.mastery.level >= 25 ? levelBar.max : Math.max(0, Math.min(levelBar.max, data.mastery.xp - data.mastery.levelStartXp));
    cityLevel.querySelector('p')!.before(levelBar);
    cards.append(cityLevel);

    const completed = data.missions.entries.filter((entry) => entry.completions > 0).length;
    const active = data.missions.entries.find((entry) => entry.id === data.missions.activeId);
    const missionCard = this.progressCard('missions', `${visualLanguage.mission.icon} MISSIONS`, `Completed ${completed} / ${data.missions.entries.length}`, 'Finish missions to earn rewards.');
    missionCard.append(textElement('div', active ? `Active: ${active.name}` : 'Choose your next mission.', 'pilot-progress-detail'));
    if (active) {
      const missionDetail = textElement('div', active.progressText ?? '', 'pilot-progress-detail');
      missionDetail.dataset.progressSlot = 'mission';
      missionCard.append(missionDetail);
      if (active.target && active.progress !== undefined) {
        const missionBar = document.createElement('progress'); missionBar.className = 'pilot-progress-mission-bar';
        missionBar.max = active.target; missionBar.value = Math.max(0, Math.min(active.target, active.progress));
        missionCard.append(missionBar);
      }
    }
    missionCard.append(actionButton({ label: 'VIEW MISSIONS', run: () => this.switchTo('MISSIONS') }));
    cards.append(missionCard);

    const owned = data.territories.entries.filter((entry) => entry.ownedByYou);
    const territoryCard = this.progressCard('territories', `${visualLanguage.territory.icon} TERRITORIES`, `Owned ${owned.length} / ${data.territories.entries.length}`, 'Areas you control.');
    const ownedList = document.createElement('div'); ownedList.className = 'pilot-progress-owned';
    if (owned.length) for (const item of owned) {
      const row = textElement('span', item.name); row.prepend(territoryDot(item.name, item.fixedColor)); ownedList.append(row);
    } else ownedList.append(textElement('span', 'None yet.'));
    territoryCard.append(ownedList, actionButton({ label: 'VIEW TERRITORIES', run: () => this.switchTo('TERRITORIES') }));
    cards.append(territoryCard);

    const weeklyBoard = data.leaderboards.find((board) => board.category === 'mastery') ?? data.leaderboards.find((board) => board.localRank);
    const weekly = this.progressCard('weekly', '🏆 WEEKLY', weeklyBoard?.localRank ? `Your rank #${weeklyBoard.localRank}` : 'No rank yet', 'Your rank this week.');
    weekly.append(textElement('div', weeklyBoard?.category === 'mastery' ? 'City Level earned this week' : weeklyBoard ? weeklyBoard.category.replace(/([a-z])([A-Z])/g, '$1 $2') : 'Play to join the weekly competition.', 'pilot-progress-detail'));
    const leaderboardDetails = document.createElement('details'); leaderboardDetails.className = 'pilot-progress-leaderboards';
    leaderboardDetails.append(textElement('summary', 'VIEW LEADERBOARDS'));
    for (const board of data.leaderboards) leaderboardDetails.append(this.createCard({
      name: board.category === 'mastery' ? 'CITY LEVEL EARNED' : board.category.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase(),
      detail: board.entries.slice(0, 3).map((entry, index) => `${index + 1}. ${entry.name}${entry.you ? ' (You)' : ''} · ${Math.round(entry.value)}`).join(' · ') || 'No results yet.',
      meta: board.localRank ? `Your rank #${board.localRank}` : 'Play to get ranked.',
    }));
    weekly.append(leaderboardDetails); cards.append(weekly);

    const aircraft = this.progressCard('aircraft', '✈ AIRCRAFT', `Owned ${data.progression.aircraft.filter((entry) => entry.owned).length} / ${data.progression.aircraft.length}`, 'Planes you own.');
    const aircraftList = document.createElement('div'); aircraftList.className = 'pilot-progress-aircraft-list';
    for (const [index, plane] of data.progression.aircraft.entries()) {
      const row = document.createElement('div');
      const state = textElement('span', plane.owned ? '✓ OWNED' : plane.premium ? 'PREMIUM' : plane.neededCredits ? `${plane.neededCredits.toLocaleString()} Credits needed` : `${plane.price.toLocaleString()} Credits to unlock`);
      state.dataset.progressSlot = `aircraft-${index}`;
      row.append(textElement('span', plane.name), state);
      if (plane.owned) row.classList.add('owned');
      aircraftList.append(row);
    }
    aircraft.append(aircraftList, actionButton({ label: 'OPEN GARAGE', run: data.garage.open, disabled: !data.garage.available, title: data.garage.reason }));
    if (!data.garage.available) aircraft.append(textElement('small', 'Land and stop at an airport to open Garage.', 'pilot-progress-detail'));
    cards.append(aircraft);
    progress.append(cards); content.append(progress);
    }

    if (this.activeSection === 'GARAGE') {
    const garageSection = section('Garage');
    garageSection.append(textElement('p', 'Choose, compare and equip aircraft. Land at an airport and stop safely to change aircraft.', 'pilot-menu-muted'));
    garageSection.append(actionButton({ label: data.garage.available ? 'Open Garage' : 'Garage unavailable in flight', run: data.garage.open, disabled: !data.garage.available, title: data.garage.reason }));
    if (!data.garage.available) garageSection.append(actionButton({ label: 'Set Airport Waypoint', run: data.garage.setAirportWaypoint }));
    if (!data.garage.available && data.garage.reason) garageSection.append(textElement('small', data.garage.reason, 'pilot-menu-muted'));
    content.append(garageSection);
    }

    if (this.activeSection === 'SETTINGS') {
    const audio = section('Audio');
    audio.append(actionButton({ label: data.audio.muted ? 'Sound Off · Turn On' : 'Sound On · Turn Off', run: data.audio.toggle }));
    for (const category of ['master', 'engine', 'combat', 'ui'] as const) {
      const row = document.createElement('label');
      row.className = 'pilot-menu-audio-row';
      const title = textElement('span', category.toUpperCase());
      const value = textElement('output', `${data.audio.levels[category]}%`);
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
      slider.value = String(data.audio.levels[category]);
      slider.setAttribute('aria-label', `${category} volume`);
      slider.addEventListener('input', () => {
        const level = Number(slider.value);
        value.textContent = `${level}%`;
        data.audio.setLevel(category, level);
      });
      row.append(title, slider, value);
      audio.append(row);
    }
    content.append(audio);
    const hints = section('Hints');
    hints.append(
      textElement('p', 'Short one-time reminders appear when a system first becomes relevant. They never pause multiplayer flight.', 'pilot-menu-muted'),
      actionButton({ label: data.hints.enabled ? 'Hints On' : 'Hints Off', run: data.hints.toggle }),
    );
    content.append(hints);
    const navigation = section('Navigation');
    navigation.append(actionButton({ label: data.navigation.enabled ? 'Nav Markers On' : 'Nav Markers Off', run: data.navigation.toggle }));
    content.append(navigation);

    const advertising = section('Advertising');
    const sponsorInfo = document.createElement('div'); sponsorInfo.className = 'pilot-menu-sponsor-info';
    sponsorInfo.append(textElement('p', 'Interested in advertising in Airport Chaos?'),
      textElement('p', `Sponsor: ${sponsorLocations}`), textElement('p', companyContact.companyName));
    const sponsorLinks = document.createElement('div'); sponsorLinks.innerHTML = contactLinks(); sponsorInfo.append(sponsorLinks);
    sponsorInfo.hidden = !this.advertisingOpen;
    advertising.append(actionButton({ label: 'Advertise in Airport Chaos', run: () => {
      this.advertisingOpen = !this.advertisingOpen;
      sponsorInfo.hidden = !this.advertisingOpen;
    } }), sponsorInfo);
    content.append(advertising);
    }

    if (this.activeSection === 'HELP') {
      const help = section('HELP');
      help.append(textElement('p', 'See the visual guide or check the keys below.', 'pilot-menu-muted'));
      help.append(actionButton({ label: 'OPEN VISUAL GUIDE', run: data.guide.open }));
      for (const group of controlGroups) {
        const controls = document.createElement('div'); controls.className = 'pilot-menu-control-group';
        controls.append(textElement('h3', group.label));
        for (const row of group.rows) controls.append(textElement('div', `${controlKeyLabel(row.actions)}   ${row.label}`, 'pilot-menu-controls'));
        help.append(controls);
      }
      help.append(textElement('p', `${menuKeyLabel('map')} Map · ${menuKeyLabel('menu')} Menu · ? Help`, 'pilot-menu-controls'));
      content.append(help);
    }
    content.scrollTop = scrollTop;
  }

  close(): void {
    this.openState = false;
    this.pendingMissionId = undefined;
    this.element.hidden = true;
  }

  toggle(data: PilotMenuData): void {
    if (this.openState) this.close(); else this.open(data);
  }

  private createCard(item: PilotMenuActivity | PilotMenuEvent): HTMLElement {
    const card = document.createElement('div');
    card.className = 'pilot-menu-item';
    card.append(textElement('strong', item.name), textElement('p', item.detail), textElement('small', item.meta));
    if (item.actions?.length) {
      const actions = document.createElement('div');
      actions.className = 'pilot-menu-actions';
      actions.append(...item.actions.map(actionButton));
      card.append(actions);
    }
    return card;
  }

  private addMissionTerritories(card: HTMLElement, mission: PilotMenuMission, territories: readonly PilotMenuTerritory[]): void {
    if (!mission.territoryIds.length) return;
    const chips = document.createElement('div'); chips.className = 'pilot-mission-territories';
    for (const id of mission.territoryIds) {
      const territory = territories.find((entry) => entry.id === id);
      if (!territory) continue;
      const chip = document.createElement('span');
      chip.append(territoryDot(territory.name, territory.color),
        textElement('span', `${territory.name} · ${territory.contested ? 'CONTESTED' : territory.controller}`));
      chip.classList.toggle('contested', territory.contested);
      chips.append(chip);
    }
    if (chips.childElementCount) card.insertBefore(chips, card.querySelector('.pilot-menu-actions'));
  }
}
