import { identityText, visualLanguage, playerFacingText } from './visual-language';
import { controlGroups, controlKeyLabel, menuKeyLabel } from './flight-input';
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
  mostWanted: boolean;
  king: boolean;
  setWaypoint?: () => void;
};
export type PilotMenuTerritory = {
  name: string;
  controller: string;
  contested: boolean;
  progress: number;
  distance: number;
  setWaypoint: () => void;
};
export type PilotMenuObjective = { label: string; progress: number; target: number; reward: number; completed: boolean };

export type PilotMenuData = {
  status: readonly string[];
  players: { city: string; entries: readonly PilotMenuPlayer[] };
  territories: { city: string; entries: readonly PilotMenuTerritory[] };
  objectives: { daily: readonly PilotMenuObjective[]; weekly: readonly PilotMenuObjective[]; dailyId?: string; weeklyId?: string };
  mastery: { city: string; level: number; xp: number; nextXp: number; rewards: readonly string[] };
  leaderboards: readonly { category: string; weekId: string; entries: readonly { name: string; value: number; you: boolean }[]; localRank?: number }[];
  activities: readonly PilotMenuActivity[];
  liveEvent?: PilotMenuEvent;
  stunts: readonly PilotMenuStunt[];
  discoveries: { city: string; discovered: readonly string[]; remaining: number; total: number; percent: number; openMap: () => void };
  garage: { available: boolean; reason?: string; open: () => void; setAirportWaypoint: () => void };
  hints: { enabled: boolean; toggle: () => void };
  navigation: { enabled: boolean; toggle: () => void };
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

export class PilotMenu {
  private openState = false;
  private content: HTMLDivElement | undefined;
  private lastScrollInteractionAt = 0;

  constructor(private readonly element: HTMLElement) {}

  isOpen(): boolean { return this.openState; }
  isActivelyScrolling(now = performance.now()): boolean { return now - this.lastScrollInteractionAt < 260; }

  open(data: PilotMenuData): void {
    this.openState = true;
    this.element.hidden = false;
    this.render(data);
  }

  refresh(data: PilotMenuData): void {
    if (!this.openState || this.isActivelyScrolling()) return;
    this.render(data);
  }

  private ensureContent(): HTMLDivElement {
    if (this.content) return this.content;
    const card = document.createElement('article');
    card.className = 'pilot-menu-card';
    const header = document.createElement('header');
    const heading = document.createElement('div');
    heading.append(textElement('span', 'PILOT MENU', 'pilot-menu-kicker'), textElement('h1', 'What do you want to do?'));
    const close = actionButton({ label: 'Close · TAB', run: () => this.close() });
    header.append(heading, close);
    const content = document.createElement('div');
    content.className = 'pilot-menu-content';
    // Preserve native wheel/trackpad scrolling here while preventing future
    // overlay-level input from treating this UI gesture as flight-camera input.
    content.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
    content.addEventListener('scroll', () => { this.lastScrollInteractionAt = performance.now(); }, { passive: true });
    content.addEventListener('pointerdown', () => { this.lastScrollInteractionAt = performance.now(); }, { passive: true });
    card.append(header, content);
    this.element.replaceChildren(card);
    this.content = content;
    return content;
  }

  private render(data: PilotMenuData): void {
    const content = this.ensureContent();
    const scrollTop = content.scrollTop;
    content.replaceChildren();

    const status = section('✈ Fly / Current Status');
    status.append(...data.status.map((line) => textElement('div', line, 'pilot-menu-status')));
    status.append(actionButton({ label: 'Tutorial / Help', run: data.guide.open }));
    content.append(status);

    const players = section(`● Players · ${data.players.city} — ${data.players.entries.length} Online`);
    if (!data.players.entries.length) {
      players.append(textElement('p', 'No pilots are currently connected to this city.', 'pilot-menu-muted'));
    }
    for (const player of data.players.entries) {
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
        name: `${player.name}${player.isLocal ? ' (You)' : ''} · ${player.aircraft}${player.isBot ? ' · AI Pilot' : ''}`,
        detail: meta,
        meta: player.isLocal
          ? 'Your plane.'
          : player.isBot ? 'Computer-controlled plane. Set Waypoint marks where it is now.' : 'Another player. Set Waypoint marks where they are now.',
        actions: player.setWaypoint ? [{ label: 'Set Waypoint', run: player.setWaypoint }] : undefined,
      });
      playerCard.querySelector<HTMLElement>('strong')!.style.color = visualLanguage[player.isLocal ? 'you' : player.isBot ? 'ai' : 'player'].color;
      players.append(playerCard);
    }
    content.append(players);

    const territories = section(identityText('territory'));
    if (!data.territories.entries.length) territories.append(textElement('p', 'No territory control is active in this city.', 'pilot-menu-muted'));
    for (const territory of data.territories.entries) {
      territories.append(this.createCard({
        name: `${territory.name}${territory.contested ? ' · CONTESTED' : ''}`,
        detail: territory.contested
          ? `Contested · capture paused · ${Math.round(territory.distance)}m away`
          : `${territory.controller} · ${territory.progress > 0 ? `Capture ${territory.progress}% · ` : ''}${Math.round(territory.distance)}m away`,
        meta: 'Keep flying here to claim it. Parking does not count.',
        actions: [{ label: 'Set Waypoint', run: territory.setWaypoint }],
      }));
    }
    content.append(territories);

    const objectives = section(identityText('objectives'));
    const addObjectiveGroup = (title: string, entries: readonly PilotMenuObjective[], reset?: string) => {
      objectives.append(textElement('h3', `${title}${reset ? ` · resets ${reset}` : ''}`, 'pilot-menu-kicker'));
      if (!entries.length) objectives.append(textElement('p', 'Objectives are preparing for this city.', 'pilot-menu-muted'));
      for (const objective of entries) objectives.append(this.createCard({
        name: `${objective.completed ? '✓ ' : ''}${objective.label}`,
        detail: `${Math.min(objective.progress, objective.target)} / ${objective.target} · +${objective.reward} ${identityText('credits')}`,
        meta: objective.completed ? 'Complete' : 'Play to make progress.',
      }));
    };
    addObjectiveGroup('Daily', data.objectives.daily, data.objectives.dailyId);
    addObjectiveGroup('Weekly', data.objectives.weekly, data.objectives.weeklyId);
    content.append(objectives);

    const mastery = section(identityText('mastery'));
    const remaining = Math.max(0, data.mastery.nextXp - data.mastery.xp);
    mastery.append(textElement('p', `${data.mastery.city} Mastery Level ${data.mastery.level} · ${data.mastery.xp} XP${data.mastery.level >= 25 ? ' · MAX' : ` · ${remaining} XP to next level`}`));
    mastery.append(textElement('p', data.mastery.rewards.length ? `Unlocked: ${data.mastery.rewards.join(' · ')}` : 'Your next city milestone unlocks a status or cosmetic reward.', 'pilot-menu-muted'));
    content.append(mastery);

    const leaderboards = section('🏆 Progression · Weekly Leaders');
    for (const board of data.leaderboards) leaderboards.append(this.createCard({ name: board.category.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase(), detail: board.entries.map((entry, index) => `${index + 1}. ${entry.name}${entry.you ? ' (You)' : ''} · ${Math.round(entry.value)}`).join(' · ') || 'No verified scores yet.', meta: `Week of ${board.weekId}${board.localRank ? ` · Your rank #${board.localRank}` : ''}` }));
    content.append(leaderboards);

    const activities = section('🗺 Activities');
    if (!data.activities.length) activities.append(textElement('p', 'No local activities are available in this city yet.', 'pilot-menu-muted'));
    for (const activity of data.activities) activities.append(this.createCard(activity));
    content.append(activities);

    const events = section(identityText('event'));
    if (data.liveEvent) events.append(this.createCard(data.liveEvent));
    else events.append(textElement('p', 'No live event right now. Keep flying — the next opportunity is optional.', 'pilot-menu-muted'));
    content.append(events);

    const stunts = section(identityText('stunt'));
    stunts.append(textElement('p', 'Chain different stunts within a short window to build a combo. Repeating the same stunt does not farm rewards.', 'pilot-menu-muted'));
    const stuntGrid = document.createElement('div');
    stuntGrid.className = 'pilot-menu-stunts';
    for (const stunt of data.stunts) {
      const item = document.createElement('div');
      item.className = 'pilot-menu-stunt';
      item.append(textElement('strong', `${stunt.name} +${stunt.reward}`), textElement('span', stunt.how), textElement('small', `WHERE · ${stunt.where}`));
      stuntGrid.append(item);
    }
    stunts.append(stuntGrid);
    content.append(stunts);

    const discoveries = section(identityText('discovery'));
    discoveries.append(textElement('p', `${data.discoveries.city} Discovery: ${data.discoveries.discovered.length} / ${data.discoveries.total} — ${data.discoveries.percent}%`));
    if (data.discoveries.discovered.length) discoveries.append(textElement('div', data.discoveries.discovered.join(' · '), 'pilot-menu-discovered'));
    if (data.discoveries.remaining) discoveries.append(textElement('p', `${data.discoveries.remaining} location${data.discoveries.remaining === 1 ? '' : 's'} remain. Use the map for subtle ? markers; secrets stay hidden until found.`, 'pilot-menu-muted'));
    discoveries.append(actionButton({ label: 'Open World Map · M', run: data.discoveries.openMap }));
    content.append(discoveries);

    const garageSection = section('Garage');
    garageSection.append(textElement('p', 'Choose, compare and equip aircraft. Land at an airport and stop safely to change aircraft.', 'pilot-menu-muted'));
    garageSection.append(actionButton({ label: data.garage.available ? 'Open Garage' : 'Garage unavailable in flight', run: data.garage.open, disabled: !data.garage.available, title: data.garage.reason }));
    if (!data.garage.available) garageSection.append(actionButton({ label: 'Set Airport Waypoint', run: data.garage.setAirportWaypoint }));
    if (!data.garage.available && data.garage.reason) garageSection.append(textElement('small', data.garage.reason, 'pilot-menu-muted'));
    content.append(garageSection);

    const hints = section('Hints');
    hints.append(
      textElement('p', 'Short one-time reminders appear when a system first becomes relevant. They never pause multiplayer flight.', 'pilot-menu-muted'),
      actionButton({ label: data.hints.enabled ? 'Hints On' : 'Hints Off', run: data.hints.toggle }),
    );
    content.append(hints);

    const controls = section('Controls');
    for (const group of controlGroups) controls.append(textElement('p', `${group.label} · ${group.rows.map(row => `${controlKeyLabel(row.actions)} ${row.label}`).join(' · ')}`, 'pilot-menu-controls'));
    controls.append(textElement('p', `${menuKeyLabel('map')} Map · ${menuKeyLabel('menu')} Pilot Menu · ${menuKeyLabel('restart')} Restart after crash`, 'pilot-menu-controls'));
    controls.append(actionButton({ label: data.navigation.enabled ? 'Nav Markers On' : 'Nav Markers Off', run: data.navigation.toggle }));
    content.append(controls);
    content.scrollTop = scrollTop;
  }

  close(): void {
    this.openState = false;
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
}
