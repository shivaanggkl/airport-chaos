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

export type PilotMenuData = {
  status: readonly string[];
  activities: readonly PilotMenuActivity[];
  liveEvent?: PilotMenuEvent;
  stunts: readonly PilotMenuStunt[];
  discoveries: { city: string; discovered: readonly string[]; remaining: number; total: number; percent: number; openMap: () => void };
  garage: { available: boolean; reason?: string; open: () => void };
  hints: { enabled: boolean; toggle: () => void };
};

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function section(title: string): HTMLElement {
  const sectionElement = document.createElement('section');
  sectionElement.className = 'pilot-menu-section';
  sectionElement.append(textElement('h2', title));
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

  constructor(private readonly element: HTMLElement) {}

  isOpen(): boolean { return this.openState; }

  open(data: PilotMenuData): void {
    this.openState = true;
    this.element.hidden = false;
    const card = document.createElement('article');
    card.className = 'pilot-menu-card';
    const header = document.createElement('header');
    const heading = document.createElement('div');
    heading.append(textElement('span', 'PILOT MENU', 'pilot-menu-kicker'), textElement('h1', 'Flight briefing'));
    const close = actionButton({ label: 'Close · TAB', run: () => this.close() });
    header.append(heading, close);
    card.append(header);

    const status = section('Fly / Current Status');
    status.append(...data.status.map((line) => textElement('div', line, 'pilot-menu-status')));
    card.append(status);

    const activities = section('Activities');
    if (!data.activities.length) activities.append(textElement('p', 'No local activities are available in this city yet.', 'pilot-menu-muted'));
    for (const activity of data.activities) activities.append(this.createCard(activity));
    card.append(activities);

    const events = section('Live Events');
    if (data.liveEvent) events.append(this.createCard(data.liveEvent));
    else events.append(textElement('p', 'No live event right now. Keep flying — the next opportunity is optional.', 'pilot-menu-muted'));
    card.append(events);

    const stunts = section('Stunts');
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
    card.append(stunts);

    const discoveries = section('Discoveries');
    discoveries.append(textElement('p', `${data.discoveries.city} Discovery: ${data.discoveries.discovered.length} / ${data.discoveries.total} — ${data.discoveries.percent}%`));
    if (data.discoveries.discovered.length) discoveries.append(textElement('div', data.discoveries.discovered.join(' · '), 'pilot-menu-discovered'));
    if (data.discoveries.remaining) discoveries.append(textElement('p', `${data.discoveries.remaining} location${data.discoveries.remaining === 1 ? '' : 's'} remain. Use the map for subtle ? markers; secrets stay hidden until found.`, 'pilot-menu-muted'));
    discoveries.append(actionButton({ label: 'Open World Map · M', run: data.discoveries.openMap }));
    card.append(discoveries);

    const garageSection = section('Garage');
    garageSection.append(textElement('p', 'Choose, compare and equip aircraft. Garage is available before entering a city or while safely on the ground.', 'pilot-menu-muted'));
    garageSection.append(actionButton({ label: data.garage.available ? 'Open Garage' : 'Garage unavailable in flight', run: data.garage.open, disabled: !data.garage.available, title: data.garage.reason }));
    if (!data.garage.available && data.garage.reason) garageSection.append(textElement('small', data.garage.reason, 'pilot-menu-muted'));
    card.append(garageSection);

    const hints = section('Hints');
    hints.append(
      textElement('p', 'Short one-time reminders appear when a system first becomes relevant. They never pause multiplayer flight.', 'pilot-menu-muted'),
      actionButton({ label: data.hints.enabled ? 'Hints On' : 'Hints Off', run: data.hints.toggle }),
    );
    card.append(hints);

    const controls = section('Controls');
    controls.append(textElement('p', 'W throttle up · S reduce power / brake / reverse taxi · ↑ / ↓ pitch · A / D or Q / E turn · ← / → roll · Space fire · M world map · R restart after crash · TAB Pilot Menu', 'pilot-menu-controls'));
    card.append(controls);

    this.element.replaceChildren(card);
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
