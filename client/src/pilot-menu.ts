import { identityText, visualLanguage, playerFacingText } from './visual-language';
import { actionKeyLabel, cameraControlLabels, controlGroups, controlKeyLabel, menuKeyLabel } from './flight-input';
import { mountAirportChaosLogo } from './brand';
import { companyContact, contactLinks, sponsorLocations } from './company-contact';
import { mobileControlPlacementLimits, type MobileControlId, type MobileControlLayout, type MobileControlPlacement } from './mobile-input';
import { closeTopUiLayer, registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { formatPilotAltitude } from '../../shared/multiplayer-altitude.mjs';
import { pilotXpForLevel } from '../../shared/pilot-progression.mjs';
import { legalConfig } from '../../shared/legal-config.mjs';
import { legalPolicyHref } from './brand';
import { recordProductIntent } from './product-analytics';
import { hapticsManager } from './haptics-manager';
export type PilotMenuAction = { label: string; run: () => void; disabled?: boolean; title?: string; intent?: 'primary' | 'danger' };
export type PilotMenuSection = 'PROFILE' | 'ACCOUNT' | 'MISSIONS' | 'REWARDS' | 'MAP' | 'PLAYERS' | 'TERRITORIES' | 'PROGRESS' | 'GARAGE' | 'CONTROLS' | 'AUDIO' | 'HELP' | 'WORLD / CITIES' | 'LEGAL / SUPPORT' | 'DATA LICENSES';
export type PilotMenuOptions = {
  sections?: readonly PilotMenuSection[];
  title?: string;
  closeLabel?: string | (() => string);
  showFlightActions?: boolean;
  appShell?: boolean;
  showContextStatus?: boolean;
  onClose?: () => void;
};

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
  id?: string;
  name: string;
  aircraft: string;
  distance: number | undefined;
  lifecycle: string;
  score: number;
  altitudeMeters?: number;
  kills?: number;
  isLocal: boolean;
  isBot?: boolean;
  ownedTerritories?: readonly { name: string; color: string }[];
  mostWanted: boolean;
  king: boolean;
  setWaypoint?: () => void;
  challenge?: () => void;
  sprint?: () => void;
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
export type PilotMenuMission = { id: string; name: string; detail: string; difficulty: string; credits: number; score: number; completions: number; cooldownUntil: number; territoryIds: readonly string[]; retired?: boolean; unavailableReason?: string; progressText?: string; progress?: number; target?: number; setWaypoint?: () => void };
export type PilotMenuAircraftProgress = { name: string; owned: boolean; premium: boolean; price: number; neededCredits: number };
export type PilotMenuAccountResult = { ok: boolean; message: string; pilotName?: string };
export type PilotProfileSummary = {
  publicPilotId: string; lifetimeCreditsEarned: number;
  singlePlayer: { missionsCompleted: number; missionsTotal: number; chaptersCompleted: number; chaptersTotal: number;
    citiesCompleted: number; citiesTotal: number; overallProgress: number; totalScore: number;
    aircraftOwned: number; aircraftTotal: number };
  latestAchievements: readonly { key: string; title: string; description: string; category: 'MISSION'; earnedAt: number }[];
  serverWeekStartsAt: number; serverNow: number;
};

export type PilotMenuData = {
  profileSummary?: PilotProfileSummary;
  account: {
    state: 'guest' | 'account'; email?: string; pilotName: string;
    notice?: PilotMenuAccountResult;
    providers: { password: boolean; google: boolean; apple: boolean };
    availableProviders: readonly ('google' | 'apple')[];
    level: number; xp: number; credits: number; score: number; ownedAircraft: number; badges: number; legendaryPilot?: boolean;
    continueAsGuest: () => void;
    logOut: () => Promise<PilotMenuAccountResult>;
    changeName: (pilotName: string) => Promise<PilotMenuAccountResult>;
    providerAuth: (provider: 'google' | 'apple', action: 'login') => Promise<PilotMenuAccountResult>;
  };
  city: { name: string; timePreset: string; changeCity: () => void };
  intercity: { routes: readonly {routeId:string;destination:string;distanceLabel:string;recommendedAircraft:string;estimatedFlightTime:number;available:boolean;reason?:string;start:()=>void}[] };
  progression: { enabled: boolean; credits: number; score: number; aircraft: readonly PilotMenuAircraftProgress[];
    pilotProgress: { xp: number; level: number; title: string; nextLevelXp: number };
    dailyStreak: { current: number; longest: number; cycleDay: number; nextReward: number };
    personalRecords: Record<string, { value: number; cityId?: string; achievedAt: number }>;
    weeklyReward?: { weekId: string; rank: number; category: string; credits: number; badge: string; badgeExpiresAt: number };
    referral: { code: string; status: string; rewardedCount: number };
    pvpChallenge?: { id: string; mode: 'dogfight' | 'airportSprint'; status: string; expiresAt: number } | null;
    claimSeasonReward?: (rewardId:string)=>void;
    claimWeeklyEventReward?: (weeklyEventId:string)=>void;
    season?: { seasonId:string;name:string;theme:string;startsAt:number;endsAt:number;points:number;
      rewards:readonly {id:string;points:number;label:string;state:'locked'|'claimable'|'claimed'}[];
      missions:readonly {id:string;label:string;progress:number;target:number;completed:boolean}[];
      weeklyEvent?:{weeklyEventId:string;title:string;description:string;progress:number;target:number;completed:boolean;rewarded:boolean;weekEnd:number} };
  };
  rewards?: {
    authenticated: boolean;
    notice?: string;
    state: { schedule: readonly number[]; nextDay: number; nextAmount: number; claimable: boolean; claimedDays: readonly number[]; claimCount: number; lastClaimedAt?: number; nextEligibleAt: number; serverNow: number };
    claim: () => Promise<PilotMenuAccountResult>;
    watchAndEarn?: {
      notice?: string;
      phase: 'idle' | 'loading' | 'playing' | 'verifying';
      state: { rewardCredits: number; maxRewards: number; remaining: number; windowEndsAt?: number; serverNow: number; activeAttempt?: { attemptId: string; status: string; expiresAt: number } };
      watch: () => Promise<void>;
    };
    invite?: {
      code: string; url: string; joinedCount: number; qualifiedCount: number; earnedCredits: number;
      inviterRewardsInWindow: number; inviterRewardsRemaining: number; nextInviterRewardAt?: number;
      share: () => Promise<PilotMenuAccountResult>;
      copy: () => Promise<PilotMenuAccountResult>;
    };
  };
  missions: { practice: boolean; activeId?: string; activeCity?: string; entries: readonly PilotMenuMission[]; accept: (id: string, replace: boolean) => void; abandon: () => void };
  players: { city: string; entries: readonly PilotMenuPlayer[] };
  territories: { enabled: boolean; city: string; entries: readonly PilotMenuTerritory[]; legend: readonly { name: string; color: string; colorName?: string }[]; neutralColor: string };
  objectives: { daily: readonly PilotMenuObjective[]; weekly: readonly PilotMenuObjective[]; dailyId?: string; weeklyId?: string };
  mastery: { city: string; level: number; xp: number; levelStartXp: number; nextXp: number; rewards: readonly string[] };
  leaderboards: readonly { category: string; weekId: string; entries: readonly { name: string; value: number; you: boolean }[]; localRank?: number }[];
  activities: readonly PilotMenuActivity[];
  liveEvent?: PilotMenuEvent;
  stunts: readonly PilotMenuStunt[];
  map: { mount: (host: HTMLElement) => void; unmount: () => void };
  garage: { available: boolean; reason?: string; open: () => void; setAirportWaypoint: () => void };
  hints: { enabled: boolean; toggle: () => void };
  navigation: { enabled: boolean; toggle: () => void };
  preferences:{touchMode:'auto'|'on'|'off';touchLayout:boolean;setTouchMode:(mode:'auto'|'on'|'off')=>void;graphicsQuality:'auto'|'high'|'balanced'|'low';setGraphicsQuality:(mode:'auto'|'high'|'balanced'|'low')=>void;mobileLayout:MobileControlLayout;setMobileControl:(control:MobileControlId,placement:Partial<MobileControlPlacement>)=>void;resetMobileLayout:()=>MobileControlLayout};
  flightPitch: { inverted: boolean; touch: boolean; setInverted: (inverted: boolean) => void };
  restart: () => void;
  exitFlight?: () => void;
  cityGuide?: () => void;
  nativeWebPromotion?: boolean;
  audio: { muted: boolean; toggle: () => void; levels: { master: number; music: number; engine: number; combat: number; ui: number }; setLevel: (category: 'master' | 'music' | 'engine' | 'combat' | 'ui', value: number) => void };
  haptics: { available: boolean; enabled: boolean; toggle: () => void };
  guide: { enabled: boolean; open: () => void; replay:()=>void };
};

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = playerFacingText(text);
  if (className) element.className = className;
  return element;
}

type ProfileArt = 'progress' | 'missions' | 'chapters' | 'cities' | 'score' | 'aircraft' | 'combat' | 'landing';

function profileArt(kind: ProfileArt): HTMLSpanElement {
  const art = document.createElement('span');
  art.className = 'pilot-profile-art';
  art.setAttribute('aria-hidden', 'true');
  const image = kind === 'missions' || kind === 'chapters' ? '/media/hub/mission-medal.png'
    : kind === 'aircraft' || kind === 'landing' ? '/media/hub/aircraft.png' : undefined;
  if (image) {
    const img = document.createElement('img'); img.src = image; img.alt = ''; art.append(img);
    return art;
  }
  const shapes: Record<Exclude<ProfileArt, 'missions' | 'chapters' | 'aircraft' | 'landing'>, string> = {
    progress: '<path d="M8 38h8V25H8zm12 0h8V17h-8zm12 0h8V9h-8z" fill="#39bf5e" stroke="#16894a" stroke-width="2"/><path d="M7 42h35" stroke="#196f87" stroke-width="2"/>',
    cities: '<path d="M5 40V22h8v18m3 0V12h11v28m3 0V19h12v21" fill="#299bd3" stroke="#0d4b80" stroke-width="2"/><path d="M8 27h3m-3 5h3m11-14h3m-3 6h3m-3 6h3m12-5h3m-3 6h3" stroke="#f8d369" stroke-width="2"/><path d="M3 41h42" stroke="#a66e18" stroke-width="2"/>',
    score: '<circle cx="24" cy="24" r="17" fill="#f6e7c3" stroke="#b86c18" stroke-width="3"/><circle cx="24" cy="24" r="10" fill="#fff8e6" stroke="#e49426" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="#e65d28"/><path d="M24 2v11m0 22v11M2 24h11m22 0h11" stroke="#bf541a" stroke-width="3"/>',
    combat: '<path d="M8 7l8 6 19 21-5 5L11 17z" fill="#c8d9ed" stroke="#526f9a" stroke-width="2"/><path d="M40 7l-8 6-19 21 5 5 19-22z" fill="#dbe8f5" stroke="#526f9a" stroke-width="2"/><path d="M8 38l6-6m20 0 6 6" stroke="#b98027" stroke-width="4" stroke-linecap="round"/>',
  };
  art.innerHTML = `<svg viewBox="0 0 48 48" focusable="false" aria-hidden="true">${shapes[kind as keyof typeof shapes]}</svg>`;
  return art;
}

function achievementArt(key: string): HTMLSpanElement {
  return profileArt(key === 'first_combat' ? 'combat' : key === 'smooth_landing' ? 'landing'
    : key.startsWith('city:') ? 'cities' : 'missions');
}

function section(title: string): HTMLElement {
  const sectionElement = document.createElement('section');
  sectionElement.className = 'pilot-menu-section';
  const heading = textElement('h2', title);
  sectionElement.append(heading);
  return sectionElement;
}

function actionButton(action: PilotMenuAction): HTMLButtonElement {
  const button = textElement('button', action.label) as HTMLButtonElement;
  button.type = 'button';
  button.disabled = action.disabled ?? false;
  if (action.intent) button.classList.add(`pilot-menu-${action.intent}`);
  if (action.title) button.title = action.title;
  button.addEventListener('click', action.run);
  return button;
}

function providerIcon(provider: 'google' | 'apple'): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('pilot-provider-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  if (provider === 'google') {
    icon.setAttribute('viewBox', '0 0 18 18');
    icon.innerHTML = '<path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.703-1.568 2.684-3.878 2.684-6.614z"/><path fill="#4285F4" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.259c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.037-3.71H.956v2.332A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.963 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.71V4.958H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.042l3.007-2.332z"/><path fill="#34A853" d="M9 3.58c1.321 0 2.507.454 3.441 1.345l2.581-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .956 4.958L3.963 7.29C4.672 5.164 6.656 3.58 9 3.58z"/>';
  } else {
    icon.setAttribute('viewBox', '0 0 384 512');
    icon.innerHTML = '<path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-77.5-19.7C63.3 141.2 4 183.7 4 270.2 4 295.8 8.7 322.2 18.1 349c12.5 36.7 57.7 126.7 104.9 125.2 24.7-.6 42.2-17.5 74.4-17.5 31.2 0 47.3 17.5 74.8 17.5 47.6-.7 88.4-82.5 100.3-119.3-63.8-30.1-53.8-84.1-53.8-86.2zM260.7 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>';
  }
  return icon;
}

function externalLink(label: string, href: string): HTMLAnchorElement {
  const link = textElement('a', label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
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
  private backButton: HTMLButtonElement | undefined;
  private readonly sections: readonly PilotMenuSection[];
  private activeSection: PilotMenuSection = 'MISSIONS';
  private readonly sectionHistory: PilotMenuSection[] = [];
  private navigation: HTMLElement | undefined;
  private lastData: PilotMenuData | undefined;
  private lastSnapshot = '';
  private lastScrollInteractionAt = 0;
  private pointerActive = false;
  private profileNameEditing = false;
  private profileFeedback?: PilotMenuAccountResult;
  private profileStatsTab: 'single' | 'multiplayer' = 'single';
  private advertisingOpen = false;
  private inviteOpen = false;
  private inviteNotice = '';
  private rewardsTimer?: number;
  private territoryLegendOpen = this.readLegendPreference();

  constructor(
    private readonly element: HTMLElement,
    private readonly onSectionViewed?: (section: string) => void,
    private readonly options: PilotMenuOptions = {},
  ) {
    this.sections = options.sections ?? ['PROFILE', 'MISSIONS', 'MAP', 'PLAYERS', 'TERRITORIES', 'PROGRESS', 'GARAGE', 'CONTROLS', 'AUDIO', 'HELP'];
    registerUiBackLayer({
      id: `pilot-menu-${++PilotMenu.instanceCount}`,
      priority: uiBackPriority.menu,
      isActive: () => this.isOpen(),
      close: () => this.backOrClose(),
      containsTarget: (target) => target instanceof Node && (
        Boolean(this.element.querySelector('.pilot-menu-card')?.contains(target)) ||
        Boolean(this.element.querySelector('.page-back')?.contains(target)) ||
        (this.options.appShell === true && Boolean(document.querySelector('.app-shell-header:not([hidden])')?.contains(target)))
      ),
    });
  }

  private static instanceCount = 0;

  private readLegendPreference(): boolean {
    try { return localStorage.getItem('airport-chaos-tab-territory-legend-collapsed-v1') !== '1'; }
    catch { return true; }
  }

  private setLegendPreference(open: boolean): void {
    this.territoryLegendOpen = open;
    try { localStorage.setItem('airport-chaos-tab-territory-legend-collapsed-v1', open ? '0' : '1'); }
    catch { /* optional UI preference */ }
  }

  private switchTo(name: PilotMenuSection): void {
    if (this.activeSection === name || !this.lastData) return;
    this.profileNameEditing = false;
    this.profileFeedback = undefined;
    if (name === 'PROFILE') this.profileStatsTab = 'single';
    this.sectionHistory.push(this.activeSection);
    this.activeSection = name;
    this.onSectionViewed?.(name);
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
  isSectionOpen(section: PilotMenuSection): boolean { return this.openState && this.activeSection === section; }
  isActivelyScrolling(now = performance.now()): boolean { return now - this.lastScrollInteractionAt < 260; }

  open(data: PilotMenuData, section: PilotMenuSection = 'MISSIONS'): void {
    if (!this.openState) {
      this.sectionHistory.length = 0;
    }
    this.openState = true;
    this.activeSection = section;
    this.profileNameEditing = false;
    this.profileFeedback = undefined;
    if (section === 'PROFILE') this.profileStatsTab = 'single';
    this.lastSnapshot = '';
    this.element.hidden = false;
    if (this.backButton) this.backButton.textContent = typeof this.options.closeLabel === 'function' ? this.options.closeLabel() : this.options.closeLabel ?? 'BACK TO GAME';
    this.render(data);
  }

  focusMission(missionId?: string): void {
    if (!this.openState || this.activeSection !== 'MISSIONS') return;
    const selector = missionId ? `[data-mission-id="${CSS.escape(missionId)}"]` : '.pilot-menu-mission-active';
    const card = this.content?.querySelector<HTMLElement>(selector) ?? this.content?.querySelector<HTMLElement>('.pilot-menu-mission-active, .pilot-menu-mission-option');
    if (!card) return;
    card.classList.remove('pilot-menu-mission-focus');
    void card.offsetWidth;
    card.classList.add('pilot-menu-mission-focus');
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => card.classList.remove('pilot-menu-mission-focus'), 1_600);
  }

  refresh(data: PilotMenuData, force = false): void {
    if (!this.openState || (!force && (this.pointerActive || this.isActivelyScrolling()))) return;
    if (!force && this.activeSection === 'PROFILE' && this.profileNameEditing) { this.lastData = data; return; }
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
      case 'PROFILE': return JSON.stringify([this.activeSection, data.account.state, data.account.pilotName, data.account.level, data.account.xp, data.profileSummary, data.account.notice]);
      case 'ACCOUNT': return JSON.stringify([this.activeSection, data.account.state, data.account.email, data.account.providers, data.account.notice]);
      case 'MISSIONS': return JSON.stringify([this.activeSection, data.missions.activeId,
        data.missions.activeCity, data.missions.entries.map(({ id, name, detail, difficulty, credits, score, completions, cooldownUntil, territoryIds }) =>
          [id, name, detail, difficulty, credits, score, completions, cooldownUntil, territoryIds]),
        data.territories.entries.map(({ id, controller, contested, progress }) => [id, controller, contested, progress]),
        data.missions.entries.some((entry) => entry.cooldownUntil > Date.now()) ? Math.floor(Date.now() / 60_000) : 0]);
      case 'REWARDS': return JSON.stringify([this.activeSection, data.rewards?.authenticated, data.rewards?.state, data.rewards?.watchAndEarn,
        data.rewards?.invite && { ...data.rewards.invite, share: undefined, copy: undefined }, Math.floor(Date.now() / 60_000)]);
      case 'MAP': return this.activeSection;
      case 'PLAYERS': return JSON.stringify([this.activeSection, data.players.entries.map(({ name, aircraft, distance, lifecycle, score, altitudeMeters, kills, isLocal, isBot, ownedTerritories, mostWanted, king }) =>
        [name, aircraft, distance && Math.round(distance / 100), lifecycle, score, altitudeMeters === undefined ? undefined : Math.round(altitudeMeters / 30), kills, isLocal, isBot, ownedTerritories, mostWanted, king])]);
      case 'TERRITORIES': return JSON.stringify([this.activeSection, data.territories.entries.map(({ id, name, controller, contested, color, ownedByYou }) =>
        [id, name, controller, contested, color, ownedByYou])]);
      case 'PROGRESS': return JSON.stringify([this.activeSection,
        data.progression.aircraft.map(({ name, owned, premium, price }) => [name, owned, premium, price]),
        data.mastery.city, data.mastery.level, data.mastery.levelStartXp, data.mastery.nextXp, data.missions.activeId,
        data.objectives.dailyId, data.objectives.daily.map(({ label, progress, target, completed }) => [label, progress, target, completed]),
        data.missions.entries.map(({ id, completions }) => [id, completions]),
        data.territories.entries.map(({ id, ownedByYou }) => [id, ownedByYou]), data.leaderboards]);
      case 'GARAGE': return JSON.stringify([this.activeSection, data.garage.available, data.garage.reason]);
      case 'CONTROLS': return JSON.stringify([this.activeSection, data.flightPitch.inverted, data.flightPitch.touch, data.preferences.touchMode, data.preferences.touchLayout, data.preferences.mobileLayout]);
      case 'AUDIO': return JSON.stringify([this.activeSection, data.audio.muted, data.audio.levels]);
      case 'HELP': return JSON.stringify([this.activeSection, data.hints.enabled]);
      case 'WORLD / CITIES': return JSON.stringify([this.activeSection, data.city.name, data.intercity.routes]);
      case 'LEGAL / SUPPORT': return this.activeSection;
      case 'DATA LICENSES': return this.activeSection;
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
    const distance = territory.distance >= 1000
      ? `${(territory.distance / 1000).toFixed(1).replace(/\.0$/, '')} km away`
      : `${Math.round(territory.distance)} m away`;
    return territory.contested
      ? `Contested • Capture paused • ${distance}`
      : `${territory.controller} • ${territory.progress > 0 ? `Capture ${territory.progress}% • ` : ''}${distance}`;
  }

  private ensureContent(): HTMLDivElement {
    if (this.content) return this.content;
    const card = document.createElement('article');
    card.className = 'pilot-menu-card app-shell-panel';
    card.classList.toggle('is-app-shell-screen', this.options.appShell === true);
    const header = document.createElement('header');
    const heading = document.createElement('div');
    const kicker = textElement('span', this.options.title ?? 'PILOT MENU', 'pilot-menu-kicker');
    const title = textElement('h1', 'What do you want to do?');
    title.dataset.pilotMenuTitle = '';
    const brand = textElement('span', 'AIRPORT CHAOS', 'pilot-menu-kicker');
    heading.append(brand, kicker, title);
    void mountAirportChaosLogo(brand, 'brand-logo-menu');
    const cityStatus = document.createElement('span'); cityStatus.className = 'pilot-menu-city-status'; cityStatus.dataset.cityStatus = '';
    const close = actionButton({ label: typeof this.options.closeLabel === 'function' ? this.options.closeLabel() : this.options.closeLabel ?? 'BACK TO GAME', run: closeTopUiLayer });
    close.classList.add('context-back');
    this.backButton = close;
    if (this.options.appShell) close.classList.add('page-back');
    const actions = document.createElement('div'); actions.className = 'pilot-menu-header-actions';
    if (this.options.showContextStatus !== false) actions.append(cityStatus);
    if (!this.options.appShell) actions.append(close);
    header.append(heading, actions);
    const content = document.createElement('div');
    content.className = 'pilot-menu-content';
    // Preserve native wheel/trackpad scrolling here while preventing future
    // overlay-level input from treating this UI gesture as flight-camera input.
    content.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
    content.addEventListener('scroll', () => { this.lastScrollInteractionAt = performance.now(); }, { passive: true });
    content.addEventListener('pointerdown', () => {
      this.pointerActive = true;
      this.lastScrollInteractionAt = performance.now();
    }, { passive: true });
    const releasePointer = () => {
      if (!this.pointerActive) return;
      this.pointerActive = false;
      this.lastScrollInteractionAt = performance.now();
    };
    window.addEventListener('pointerup', releasePointer, { passive: true });
    window.addEventListener('pointercancel', releasePointer, { passive: true });
    const navigation = document.createElement('nav');
    navigation.className = 'pilot-menu-navigation';
    navigation.setAttribute('aria-label', 'Pilot Menu sections');
    for (const name of this.sections) {
      const button = actionButton({ label: name === 'GARAGE' ? 'AIRCRAFTS' : name, run: () => this.switchTo(name) });
      button.dataset.section = name;
      navigation.append(button);
    }
    if (this.options.showFlightActions !== false) {
      const restart = actionButton({ label: 'RESTART / RESPAWN', run: () => this.lastData?.restart(), intent: 'danger' });
      restart.classList.add('pilot-menu-navigation-action');
      navigation.append(restart);
    }
    card.append(header, navigation, content);
    this.element.replaceChildren(card);
    if (this.options.appShell) this.element.append(close);
    this.content = content;
    this.navigation = navigation;
    return content;
  }

  private render(data: PilotMenuData, switched = false): void {
    if (this.rewardsTimer !== undefined) window.clearTimeout(this.rewardsTimer);
    this.rewardsTimer = undefined;
    this.lastData?.map.unmount();
    this.lastData = data;
    this.lastSnapshot = this.snapshot(data);
    const content = this.ensureContent();
    const cityStatus = this.element.querySelector<HTMLElement>('[data-city-status]');
    if (cityStatus) cityStatus.textContent = `${data.city.name} · ${data.city.timePreset}`;
    const title = this.element.querySelector<HTMLElement>('[data-pilot-menu-title]');
    if (title) title.textContent = this.activeSection === 'PROFILE' ? 'PILOT PROFILE'
      : this.options.appShell && ['CONTROLS', 'AUDIO', 'HELP', 'ACCOUNT'].includes(this.activeSection) ? 'SETTINGS'
        : this.activeSection === 'PROGRESS' ? 'PILOT PROGRESS' : this.activeSection === 'GARAGE' ? 'AIRCRAFTS' : this.activeSection;
    const scrollTop = switched ? 0 : content.scrollTop;
    content.replaceChildren();
    content.classList.toggle('pilot-menu-content-map', this.activeSection === 'MAP');
    const authenticationScreen = this.activeSection === 'PROFILE' && data.account.state === 'guest';
    content.classList.toggle('pilot-menu-content-authentication', authenticationScreen);
    this.element.querySelector('.pilot-menu-card')?.classList.toggle('is-authentication', authenticationScreen);
    this.element.querySelector('.pilot-menu-card')?.classList.toggle('is-pilot-profile', this.options.appShell === true && this.activeSection === 'PROFILE' && !authenticationScreen);
    this.element.querySelector('.pilot-menu-card')?.classList.toggle('is-hub-standalone', this.options.appShell === true && this.activeSection === 'REWARDS');
    for (const button of this.navigation?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
      const sectionName = button.dataset.section;
      button.hidden = sectionName === 'TERRITORIES' && !data.territories.enabled;
      button.classList.toggle('active', button.dataset.section === this.activeSection);
      button.setAttribute('aria-current', button.dataset.section === this.activeSection ? 'page' : 'false');
    }

    if (this.activeSection === 'PROFILE') {
      const account = data.account;
      const profile = account.state === 'guest' ? document.createElement('section') : section('PROFILE');
      profile.classList.add(account.state === 'guest' ? 'pilot-auth-card' : 'pilot-account-card');
      const initialNotice = account.notice?.message === 'CHOOSE HOW TO PLAY' ? undefined : account.notice;
      const message = textElement('p', initialNotice?.message ?? '', 'pilot-account-message'); message.setAttribute('role', 'status'); message.hidden = !initialNotice; message.classList.toggle('error', initialNotice?.ok === false);
      message.setAttribute('aria-live', 'polite');
      let actionPending = false;
      const run = async (
        button: HTMLButtonElement,
        action: () => Promise<PilotMenuAccountResult>,
        pendingMessage = 'Please wait…',
        failureMessage = 'Account service unavailable. Please try again.',
      ) => {
        if (actionPending) return;
        actionPending = true;
        profile.setAttribute('aria-busy', 'true');
        const label = button.querySelector<HTMLElement>('.pilot-provider-label') ?? button;
        const originalLabel = label.textContent ?? '';
        for (const control of profile.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) control.disabled = true;
        label.textContent = 'PLEASE WAIT…';
        message.hidden = false; message.textContent = pendingMessage; message.classList.remove('error');
        try {
          const result = await action();
          message.textContent = result.message; message.classList.toggle('error', !result.ok);
          return result;
        }
        catch {
          message.textContent = failureMessage; message.classList.add('error');
          return { ok: false, message: failureMessage };
        }
        finally {
          actionPending = false;
          if (profile.isConnected) {
            profile.removeAttribute('aria-busy');
            label.textContent = originalLabel;
            for (const control of profile.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) control.disabled = false;
          }
        }
      };
      if (account.state === 'guest') {
        profile.append(
          textElement('span', 'AIRPORT CHAOS', 'pilot-auth-brand'),
          textElement('h2', 'CHOOSE HOW TO PLAY'),
          textElement('p', 'Sign in to save your progress on every device', 'pilot-auth-subtitle'),
        );
        const providers = document.createElement('div'); providers.className = 'pilot-account-providers';
        for (const provider of account.availableProviders) {
          const label = `Continue with ${provider === 'google' ? 'Google' : 'Apple'}`;
          const button = actionButton({ label: '', run: () => void run(button, () => account.providerAuth(provider, 'login'), 'Signing in…', 'Unable to sign in. Please try again.') });
          button.classList.add('pilot-provider-button', `pilot-provider-${provider}`);
          button.setAttribute('aria-label', label);
          button.append(providerIcon(provider), textElement('span', label, 'pilot-provider-label'), document.createElement('i'));
          providers.append(button);
        }
        const divider = document.createElement('div'); divider.className = 'pilot-auth-divider'; divider.append(document.createElement('span'), textElement('b', 'OR'), document.createElement('span'));
        const guest = actionButton({ label: 'PLAY AS GUEST', run: account.continueAsGuest });
        guest.classList.add('pilot-auth-guest');
        const guestNote = textElement('p', 'Guest progress stays on this device', 'pilot-auth-guest-note');
        const legal = document.createElement('p'); legal.className = 'pilot-auth-legal';
        legal.append(
          document.createTextNode('By continuing, you agree to our '), externalLink('Terms of Use', legalPolicyHref(legalConfig.policyRoutes.terms)),
          document.createTextNode(' and acknowledge our '), externalLink('Privacy Policy', legalPolicyHref(legalConfig.policyRoutes.privacy)), document.createTextNode('.'),
        );
        profile.append(providers, divider, guest, guestNote, message, legal);
      } else {
        profile.classList.add('pilot-profile-panel');
        const pilot = data.progression.pilotProgress;
        const summary = data.profileSummary;
        const levelStartXp = pilotXpForLevel(pilot.level);
        const levelRange = Math.max(1, pilot.nextLevelXp - levelStartXp);
        const levelProgress = pilot.level >= 50 ? levelRange : Math.max(0, Math.min(levelRange, pilot.xp - levelStartXp));
        const identity = document.createElement('div'); identity.className = 'pilot-profile-hero';
        const emblem = document.createElement('span'); emblem.className = 'pilot-profile-avatar'; emblem.setAttribute('aria-hidden', 'true');
        emblem.innerHTML = `<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
          <defs><radialGradient id="pilotPortraitBlue"><stop stop-color="#22a6dc"/><stop offset="1" stop-color="#075597"/></radialGradient>
          <linearGradient id="pilotPortraitGold" x2="0" y2="1"><stop stop-color="#fff6b7"/><stop offset=".45" stop-color="#e4b744"/><stop offset="1" stop-color="#986118"/></linearGradient></defs>
          <circle cx="50" cy="50" r="48" fill="url(#pilotPortraitGold)"/><circle cx="50" cy="50" r="43" fill="url(#pilotPortraitBlue)" stroke="#f6e7a9" stroke-width="1"/>
          <path d="M18 86c4-19 17-28 32-28s28 9 32 28" fill="#123866" stroke="#051e43" stroke-width="2"/>
          <path d="M34 62l16 28 16-28-8-5H42z" fill="#f8fbff"/><path d="M46 68h8l-2 8 4 13H44l4-13z" fill="#0b4782"/>
          <path d="M41 58h18v9l-9 8-9-8z" fill="#f2d5b9"/><ellipse cx="50" cy="47" rx="14" ry="17" fill="#f7e3c8"/>
          <path d="M33 41c1-13 8-21 17-21s16 8 17 21" fill="#113963"/><path d="M30 42h40v7c-12 6-28 6-40 0z" fill="#102b54" stroke="#061d3e" stroke-width="1.5"/>
          <path d="M36 34h28l-3 6H39z" fill="#1f5082"/><path d="M43 36l7 3 7-3-7 8z" fill="url(#pilotPortraitGold)"/>
          <path d="M23 82l13-19 9 24M77 82L64 63l-9 24" fill="#0a284d" stroke="#4778a2" stroke-width="1"/>
          <circle cx="50" cy="50" r="47" fill="none" stroke="#fff7cd" stroke-width="2"/>
        </svg>`;
        const identityCopy = document.createElement('div'); identityCopy.className = 'pilot-profile-identity-copy';
        identityCopy.append(textElement('strong', account.pilotName), textElement('span', summary ? `PILOT ID  ${summary.publicPilotId}` : 'LOADING PILOT ID'), textElement('b', `LEVEL ${pilot.level}`));
        const xp = document.createElement('div'); xp.className = 'pilot-profile-xp';
        const xpBar = document.createElement('progress'); xpBar.max = levelRange; xpBar.value = levelProgress; xpBar.setAttribute('aria-label', `Level ${pilot.level} progress`);
        xp.append(xpBar, textElement('span', `${pilot.xp.toLocaleString()} / ${pilot.nextLevelXp.toLocaleString()} XP`));
        identityCopy.append(xp);
        const edit = document.createElement('div'); edit.className = 'pilot-profile-edit';
        if (this.profileNameEditing) {
          const form = document.createElement('form'); form.className = 'pilot-profile-name-form';
          const input = document.createElement('input'); input.name = 'pilotName'; input.value = account.pilotName;
          input.minLength = 3; input.maxLength = 20; input.required = true; input.dataset.pilotNameEditor = '';
          input.setAttribute('autocomplete', 'nickname'); input.setAttribute('aria-label', 'Pilot name');
          const cancel = actionButton({ label: 'CANCEL', run: () => { this.profileNameEditing = false; this.render(data, true); } });
          const save = actionButton({ label: 'SAVE', intent: 'primary', run: () => undefined }); save.type = 'submit';
          form.append(input, cancel, save);
          form.addEventListener('submit', event => {
            event.preventDefault();
            if (!input.reportValidity()) return;
            void (async () => {
              const result = await run(save, () => account.changeName(input.value), 'Saving…', 'Unable to update your pilot name.');
              if (!result?.ok) return;
              this.profileFeedback = result;
              this.profileNameEditing = false;
              const updatedName = result.pilotName ?? input.value.trim().replace(/\s+/g, ' ');
              account.pilotName = updatedName;
              identityCopy.querySelector('strong')!.textContent = updatedName;
              edit.replaceChildren(actionButton({ label: 'EDIT NAME', run: () => {
                this.profileFeedback = undefined; this.profileNameEditing = true; this.render(this.lastData ?? data, true);
              } }));
            })();
          });
          edit.append(form);
        } else {
          edit.append(actionButton({ label: 'EDIT NAME', run: () => { this.profileFeedback = undefined; this.profileNameEditing = true; this.render(data, true); } }));
        }
        const lifetime = document.createElement('div'); lifetime.className = 'pilot-profile-lifetime';
        const creditsIcon = document.createElement('img'); creditsIcon.src = '/media/hub/credits.avif'; creditsIcon.alt = '';
        lifetime.append(creditsIcon, textElement('strong', summary ? summary.lifetimeCreditsEarned.toLocaleString() : 'LOADING'),
          textElement('span', 'LIFETIME CREDITS EARNED'));
        identity.append(emblem, identityCopy, edit, lifetime);
        const feedback = this.profileFeedback ?? account.notice;
        message.textContent = feedback?.message ?? ''; message.hidden = !feedback; message.classList.toggle('error', feedback?.ok === false);
        profile.append(identity, message);

        const statistics = document.createElement('section'); statistics.className = 'pilot-profile-section';
        const statisticsHeading = document.createElement('div'); statisticsHeading.className = 'pilot-profile-section-heading';
        const tabs = document.createElement('div'); tabs.className = 'pilot-profile-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Player statistics');
        for (const [tab, label] of [['single', 'SINGLE PLAYER'], ['multiplayer', 'MULTIPLAYER']] as const) {
          const button = textElement('button', label, 'pilot-profile-mode'); button.type = 'button';
          button.id = `pilot-profile-${tab}-tab`; button.dataset.profileTab = tab;
          button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(this.profileStatsTab === tab));
          button.setAttribute('aria-controls', 'pilot-profile-stat-content');
          button.addEventListener('click', () => {
            if (this.profileStatsTab === tab) return;
            this.profileStatsTab = tab;
            this.render(this.lastData ?? data, true);
            this.content?.querySelector<HTMLButtonElement>(`[data-profile-tab="${tab}"]`)?.focus({ preventScroll: true });
          });
          tabs.append(button);
        }
        statisticsHeading.append(textElement('h2', 'PLAYER STATISTICS'), tabs);
        statistics.append(statisticsHeading);
        const statsContent = document.createElement('div'); statsContent.id = 'pilot-profile-stat-content';
        statsContent.setAttribute('role', 'tabpanel'); statsContent.setAttribute('aria-labelledby', `pilot-profile-${this.profileStatsTab}-tab`);
        if (this.profileStatsTab === 'multiplayer') {
          statsContent.append(textElement('p', 'Multiplayer battles are not available yet.', 'pilot-profile-multiplayer-empty'));
        } else if (summary) {
          const values = summary.singlePlayer;
          const stats = document.createElement('div'); stats.className = 'pilot-profile-stat-grid';
          for (const [kind, label, value] of [
            ['progress', 'OVERALL PROGRESS', `${values.overallProgress}%`],
            ['missions', 'MISSIONS COMPLETED', `${values.missionsCompleted} / ${values.missionsTotal}`],
            ['chapters', 'CHAPTERS COMPLETED', `${values.chaptersCompleted} / ${values.chaptersTotal}`],
            ['cities', 'CITIES COMPLETED', `${values.citiesCompleted} / ${values.citiesTotal}`],
            ['score', 'TOTAL SCORE', values.totalScore.toLocaleString()],
            ['aircraft', 'AIRCRAFT OWNED', `${values.aircraftOwned} / ${values.aircraftTotal}`],
          ] as const) {
            const stat = document.createElement('div'); stat.className = 'pilot-profile-stat-tile';
            const copy = document.createElement('div'); copy.className = 'pilot-profile-stat-copy';
            copy.append(textElement('strong', value), textElement('span', label));
            stat.append(profileArt(kind), copy); stats.append(stat);
          }
          statsContent.append(stats);
        } else statsContent.append(textElement('p', 'Loading player statistics…'));
        statistics.append(statsContent);
        profile.append(statistics);

        const achievements = document.createElement('section'); achievements.className = 'pilot-profile-section';
        achievements.append(textElement('h2', 'LATEST ACHIEVEMENTS'));
        if (summary) {
          if (summary.latestAchievements.length === 0) achievements.append(textElement('p', 'Complete missions to unlock achievements.'));
          else {
            const list = document.createElement('div'); list.className = 'pilot-profile-achievements';
            for (const item of summary.latestAchievements.slice(0, 3)) {
              const card = document.createElement('div'); card.className = 'pilot-profile-achievement';
              const icon = achievementArt(item.key); icon.classList.add('pilot-profile-achievement-icon');
              const copy = document.createElement('div');
              copy.append(textElement('strong', item.title), textElement('span', item.description));
              const date = item.earnedAt >= summary.serverWeekStartsAt && item.earnedAt <= summary.serverNow
                ? 'THIS WEEK' : new Date(item.earnedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
              copy.append(textElement('small', `MISSION · ${date}`));
              card.append(icon, copy); list.append(card);
            }
            achievements.append(list);
          }
        } else achievements.append(textElement('p', 'Loading achievements…'));
        profile.append(achievements);
      }
      content.append(profile);
    }

    if (this.activeSection === 'ACCOUNT') {
      const account = section('ACCOUNT'); account.classList.add('pilot-settings-account');
      const state = data.account;
      if (state.state === 'account') {
        const methods = [state.providers.password && 'Email', state.providers.google && 'Google', state.providers.apple && 'Apple'].filter(Boolean).join(', ');
        account.append(textElement('span', 'SIGNED-IN EMAIL', 'pilot-profile-field-label'), textElement('strong', state.email ?? 'Email unavailable'),
          textElement('span', 'SIGN-IN METHOD', 'pilot-profile-field-label'), textElement('strong', methods || 'Unavailable'));
        const notice = textElement('p', '', 'pilot-account-message'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.hidden = true;
        const logout = actionButton({ label: 'LOG OUT', intent: 'danger', run: () => {
          if (logout.disabled) return;
          logout.disabled = true;
          void state.logOut().then(result => {
            if (result.ok) this.close();
            else { notice.textContent = result.message; notice.hidden = false; notice.classList.add('error'); }
          })
            .finally(() => { if (logout.isConnected) logout.disabled = false; });
        } });
        account.append(notice, logout);
      } else account.append(textElement('p', 'Sign in from the Profile icon to manage your account.'));
      content.append(account);
    }

    if (this.activeSection === 'MISSIONS') {
    const missions = section(identityText('mission').toUpperCase() + 'S');
    missions.append(textElement('p', data.missions.practice ? 'Practice tasks build flight skills and give no permanent rewards.' : 'Choose one mission. Finish it for the full Credits and Score reward.', 'pilot-menu-muted'));
    const current = data.missions.entries.find((entry) => entry.id === data.missions.activeId);
    if (current) {
      const activeSection = document.createElement('div');
      activeSection.className = 'pilot-menu-mission-active-section';
      activeSection.append(textElement('h3', 'ACTIVE MISSION', 'pilot-menu-subheading'));
      const active = this.createCard({
        name: `ACTIVE · ${current.name}`,
        detail: current.progressText ?? current.detail,
        meta: data.missions.practice ? 'PRACTICE — NO REWARDS' : `REWARD · ${visualLanguage.credits.icon} ${current.credits.toLocaleString()} Credits · ${visualLanguage.score.icon} ${current.score.toLocaleString()} Score`,
        actions: [
          ...(current.setWaypoint ? [{ label: 'Set Waypoint', run: current.setWaypoint }] : []),
          { label: 'Abandon Mission', run: data.missions.abandon, intent: 'danger' },
        ],
      });
      active.classList.add('pilot-menu-mission-card', 'pilot-menu-mission-active');
      active.dataset.missionId = current.id;
      this.addMissionTerritories(active, current, data.territories.entries);
      if (current.target && current.progress !== undefined) {
        const bar = document.createElement('progress'); bar.max = current.target; bar.value = Math.min(current.target, current.progress);
        active.append(bar);
      }
      activeSection.append(active);
      missions.append(activeSection);
    } else if (data.missions.activeId) {
      const activeSection = document.createElement('div');
      activeSection.className = 'pilot-menu-mission-active-section';
      activeSection.append(textElement('h3', 'ACTIVE MISSION', 'pilot-menu-subheading'));
      const active = this.createCard({
        name: `ACTIVE IN ${(data.missions.activeCity ?? 'ANOTHER CITY').toUpperCase()}`,
        detail: 'Return to that city to continue, or choose another mission and lose its progress.',
        meta: 'Only one mission can be active.',
        actions: [{ label: 'Abandon Mission', run: data.missions.abandon, intent: 'danger' }],
      });
      active.classList.add('pilot-menu-mission-card', 'pilot-menu-mission-active');
      activeSection.append(active);
      missions.append(activeSection);
    }

    const availableMissions = data.missions.entries.filter((item) => item.id !== data.missions.activeId);
    if (availableMissions.length) missions.append(textElement('h3', 'AVAILABLE MISSIONS', 'pilot-menu-subheading'));
    for (const item of availableMissions) {
      const now = Date.now();
      const cooling = item.cooldownUntil > now;
      const anotherMissionActive = Boolean(data.missions.activeId);
      const unavailableReason = anotherMissionActive ? 'Abandon the active mission first.' : item.unavailableReason;
      const card = this.createCard({
        name: `${item.name}${item.completions ? ` · COMPLETED ×${item.completions}` : ''}`,
        detail: item.detail,
        meta: `${item.difficulty} · ${data.missions.practice ? 'PRACTICE — NO REWARDS' : `${visualLanguage.credits.icon} ${item.credits.toLocaleString()} Credits · ${visualLanguage.score.icon} ${item.score.toLocaleString()} Score`}${cooling ? ` · Replay in ${Math.ceil((item.cooldownUntil - now) / 60_000)} min` : ''}${unavailableReason ? ` · ${unavailableReason}` : ''}`,
        actions: [{
          label: item.retired ? 'RETIRED' : cooling ? 'COOLDOWN' : unavailableReason ? 'UNAVAILABLE' : item.completions ? 'REPLAY' : 'ACCEPT',
          disabled: item.retired || cooling || Boolean(unavailableReason),
          title: unavailableReason,
          run: () => data.missions.accept(item.id, false),
          intent: 'primary',
        }],
      });
      card.classList.add('pilot-menu-mission-card', 'pilot-menu-mission-option');
      card.dataset.missionId = item.id;
      this.addMissionTerritories(card, item, data.territories.entries);
      missions.append(card);
    }
    content.append(missions);
    }

    if (this.activeSection === 'MAP') {
      const map = section('MAP');
      map.classList.add('pilot-menu-map-section');
      const host = document.createElement('div');
      host.className = 'pilot-menu-map-host';
      map.append(host);
      content.append(map);
      data.map.mount(host);
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
        player.altitudeMeters === undefined ? '' : `Altitude ${formatPilotAltitude(player.altitudeMeters)} ft`,
        `Live Score ${player.score}`,
        player.kills === undefined ? '' : `Kills ${player.kills}`,
        badges,
      ].filter(Boolean).join(' · ');
      const playerCard = this.createCard({
        name: `${player.name}${player.isLocal ? ' (You)' : ''} · ${player.aircraft}`,
        detail: meta,
        meta: player.isLocal
          ? 'Your plane.'
          : 'Another player. Set Waypoint marks where they are now.',
        actions: [
          ...(player.setWaypoint ? [{ label: 'Set Waypoint', run: player.setWaypoint }] : []),
          ...(player.challenge ? [{ label: 'Challenge', run: player.challenge }] : []),
          ...(player.sprint ? [{ label: 'Airport Sprint', run: player.sprint }] : []),
        ],
      });
      playerCard.querySelector<HTMLElement>('strong')!.style.color = player.isLocal ? 'var(--ui-text)' : visualLanguage.player.color;
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
        meta: 'Keep flying inside this territory to claim it. Parking does not count.',
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

    if (this.activeSection === 'REWARDS' && data.rewards) {
      const rewards = section('DAILY REWARDS');
      rewards.classList.add('pilot-rewards');
      rewards.append(
        textElement('p', 'Come back regularly and collect Credits.', 'pilot-menu-muted'),
        textElement('p', 'Miss a day? Your reward progress waits for you.', 'pilot-rewards-friendly'),
      );
      const state = data.rewards.state;
      const remaining = Math.max(0, state.nextEligibleAt - state.serverNow - Math.max(0, Date.now() - state.serverNow));
      const available = state.claimable || remaining === 0;
      const grid = document.createElement('div'); grid.className = 'pilot-rewards-grid';
      state.schedule.forEach((amount, index) => {
        const day = index + 1;
        const tile = document.createElement('div'); tile.className = 'pilot-reward-tile';
        const claimed = state.claimedDays.includes(day);
        tile.classList.toggle('is-claimed', claimed);
        tile.classList.toggle('is-available', day === state.nextDay && available);
        tile.classList.toggle('is-day-seven', day === 7);
        tile.append(
          textElement('span', `DAY ${day}`),
          textElement('strong', amount.toLocaleString()),
          textElement('small', claimed ? '✓ CLAIMED' : day === state.nextDay && available ? 'AVAILABLE' : 'CREDITS'),
        );
        grid.append(tile);
      });
      rewards.append(grid);
      const claimArea = document.createElement('div'); claimArea.className = 'pilot-reward-claim';
      claimArea.append(
        textElement('span', available ? "TODAY'S REWARD" : 'NEXT REWARD'),
        textElement('strong', `🪙 ${state.nextAmount.toLocaleString()} CREDITS`),
      );
      const minutes = Math.max(0, Math.ceil(remaining / 60_000));
      const status = textElement('p', data.rewards.notice ?? (available ? '' : `Next reward in ${Math.floor(minutes / 60)}h ${minutes % 60}m`), 'pilot-reward-status');
      const claim = actionButton({ label: `CLAIM ${state.nextAmount.toLocaleString()} CREDITS`, intent: 'primary', disabled: !available || !data.rewards.authenticated, run: () => undefined });
      claim.addEventListener('click', () => {
        if (claim.disabled) return;
        recordProductIntent('daily_reward_claim_clicked');
        claim.disabled = true;
        const label = claim.textContent;
        claim.textContent = 'CLAIMING…';
        void data.rewards!.claim().then((result) => {
          status.textContent = result.message;
          if (!result.ok) { claim.disabled = false; claim.textContent = label; }
        }).catch(() => {
          status.textContent = 'Unable to claim reward. Please try again.';
          claim.disabled = false;
          claim.textContent = label;
        });
      });
      claimArea.append(claim, status);
      rewards.append(claimArea);
      const rewardsLayout = document.createElement('div');
      rewardsLayout.className = 'pilot-rewards-layout';
      rewardsLayout.append(rewards);
      const watchData = data.rewards.watchAndEarn;
      let watchRemaining = Number.POSITIVE_INFINITY;
      if (watchData) {
        const watch = section('WATCH & EARN');
        watch.classList.add('pilot-watch-earn');
        const state = watchData.state;
        watchRemaining = state.windowEndsAt === undefined ? Number.POSITIVE_INFINITY
          : Math.max(0, state.windowEndsAt - state.serverNow - Math.max(0, Date.now() - state.serverNow));
        const availableCount = state.remaining <= 0 && watchRemaining === 0 ? state.maxRewards : state.remaining;
        const capped = availableCount <= 0 && watchRemaining > 0;
        const pending = watchData.phase === 'verifying' || state.activeAttempt?.status === 'PENDING_VERIFICATION';
        watch.append(
          textElement('strong', `🪙 ${state.rewardCredits.toLocaleString()} CREDITS`, 'pilot-watch-value'),
          textElement('p', 'Watch a short sponsored video and earn bonus Credits.', 'pilot-menu-muted'),
        );
        const availability = capped
          ? 'ALL VIDEO REWARDS CLAIMED'
          : `${availableCount} ${availableCount === 1 ? 'reward' : 'rewards'} available`;
        watch.append(textElement('p', availability, 'pilot-watch-availability'));
        if (capped) {
          const minutesUntilReset = Math.max(0, Math.ceil(watchRemaining / 60_000));
          watch.append(textElement('p', `More rewards available in ${Math.floor(minutesUntilReset / 60)}h ${minutesUntilReset % 60}m`, 'pilot-watch-status'));
        } else {
          const buttonLabel = watchData.phase === 'loading' ? 'FINDING VIDEO…'
            : pending ? 'VERIFYING REWARD…'
              : watchData.phase === 'playing' ? 'VIDEO PLAYING…' : 'WATCH VIDEO';
          const watchButton = actionButton({
            label: buttonLabel,
            intent: 'primary',
            disabled: watchData.phase !== 'idle' || Boolean(state.activeAttempt),
            run: () => { void watchData.watch(); },
          });
          watch.append(watchButton);
        }
        if (watchData.notice) watch.append(textElement('p', watchData.notice, 'pilot-watch-status'));
        rewardsLayout.append(watch);
      }
      const inviteData = data.rewards.invite;
      if (inviteData) {
        const invite = section('INVITE PILOTS');
        invite.classList.add('pilot-invite');
        invite.append(textElement('p', 'Invite a friend to fly Airport Chaos.', 'pilot-menu-muted'));
        const values = document.createElement('div'); values.className = 'pilot-invite-values';
        values.append(
          textElement('span', inviteData.inviterRewardsRemaining > 0 ? 'YOU GET 750 CREDITS' : 'YOUR REWARD LIMIT IS REACHED'),
          textElement('span', 'YOUR FRIEND GETS 500 CREDITS'),
        );
        invite.append(values, textElement('p', 'Rewards unlock after your friend creates a new account and flies for 60 seconds.', 'pilot-menu-muted'));
        const openInvite = actionButton({ label: this.inviteOpen ? 'HIDE INVITE' : 'INVITE FRIENDS', run: () => {
          this.inviteOpen = !this.inviteOpen;
          if (this.inviteOpen) recordProductIntent('referral_screen_viewed');
          this.inviteNotice = '';
          if (this.lastData) this.render(this.lastData);
        } });
        openInvite.setAttribute('aria-expanded', String(this.inviteOpen));
        invite.append(openInvite);
        if (this.inviteOpen) {
          const panel = document.createElement('div'); panel.className = 'pilot-invite-panel';
          panel.append(textElement('strong', 'INVITE A PILOT'));
          const counts = textElement('p', `Joined ${inviteData.joinedCount} · Qualified ${inviteData.qualifiedCount} · Earned ${inviteData.earnedCredits.toLocaleString()} Credits`, 'pilot-menu-muted');
          panel.append(counts);
          if (inviteData.inviterRewardsRemaining === 0) {
            const remaining = Math.max(0, (inviteData.nextInviterRewardAt ?? 0) - Date.now());
            const hours = Math.ceil(remaining / 3_600_000);
            panel.append(textElement('p', `Inviter reward limit reached. Your friends can still earn 500 Credits. Your next inviter reward is available in ${Math.floor(hours / 24)}d ${hours % 24}h.`, 'pilot-invite-cap'));
          } else {
            panel.append(textElement('p', `${inviteData.inviterRewardsRemaining} of 10 inviter rewards available this period.`, 'pilot-invite-cap'));
          }
          const link = textElement('input', '') as HTMLInputElement;
          link.value = inviteData.url; link.readOnly = true; link.setAttribute('aria-label', 'Invite link');
          link.addEventListener('focus', () => link.select());
          const actions = document.createElement('div'); actions.className = 'pilot-invite-actions';
          const notice = textElement('p', this.inviteNotice, 'pilot-invite-notice');
          const share = actionButton({ label: 'SHARE INVITE', intent: 'primary', run: () => {
            share.disabled = true;
            recordProductIntent('referral_share_started');
            void inviteData.share().then(result => { this.inviteNotice = result.message; notice.textContent = result.message; })
              .catch(() => { this.inviteNotice = 'Unable to share invite. Please try again.'; notice.textContent = this.inviteNotice; })
              .finally(() => { share.disabled = false; });
          } });
          const copy = actionButton({ label: 'COPY LINK', run: () => {
            copy.disabled = true;
            recordProductIntent('referral_link_copied');
            void inviteData.copy().then(result => { this.inviteNotice = result.message; notice.textContent = result.message; })
              .catch(() => { this.inviteNotice = 'Unable to copy link. Please try again.'; notice.textContent = this.inviteNotice; })
              .finally(() => { copy.disabled = false; });
          } });
          actions.append(share, copy);
          panel.append(link, actions, notice);
          invite.append(panel);
        }
        rewardsLayout.append(invite);
      }
      content.append(rewardsLayout);
      const nextRefresh = Math.min(available ? Number.POSITIVE_INFINITY : remaining, watchRemaining);
      if (Number.isFinite(nextRefresh)) {
        this.rewardsTimer = window.setTimeout(() => {
          if (this.openState && this.activeSection === 'REWARDS' && this.lastData) this.render(this.lastData);
        }, Math.min(nextRefresh, 60_000));
      }
    }

    if (this.activeSection === 'PROGRESS') {
    const progress = section('PROGRESS');
    const cards = document.createElement('div'); cards.className = 'pilot-progress-grid';
    const creditsCard = this.progressCard('credits', `${visualLanguage.credits.icon} CREDITS`, data.progression.credits.toLocaleString(), 'Use Credits to unlock aircraft.');
    creditsCard.querySelector('.pilot-progress-value')!.setAttribute('data-progress-slot', 'credits');
    const scoreCard = this.progressCard('score', `${visualLanguage.score.icon} SESSION SCORE`, data.progression.score.toLocaleString(), 'Earned this session. Resets when the session ends.');
    scoreCard.querySelector('.pilot-progress-value')!.setAttribute('data-progress-slot', 'score');
    cards.append(creditsCard, scoreCard);
    const pilot = data.progression.pilotProgress;
    const pilotCard = this.progressCard('pilot-level', '✦ PILOT LEVEL', `Level ${pilot.level} · ${pilot.title}`, `${pilot.xp.toLocaleString()} XP`);
    const pilotBar = document.createElement('progress'); pilotBar.max = Math.max(1, pilot.nextLevelXp); pilotBar.value = Math.min(pilot.xp, pilot.nextLevelXp); pilotCard.append(pilotBar); cards.append(pilotCard);
    const dailyPlan = this.progressCard('daily-plan', '☀ DAILY FLIGHT PLAN', `${data.objectives.daily.filter(item => item.completed).length} / ${data.objectives.daily.length} COMPLETE`, 'Finish today’s short flight goals. Resets at UTC midnight.');
    for (const item of data.objectives.daily) {
      const row = document.createElement('div'); row.className = 'pilot-progress-detail';
      row.append(textElement('span', `${item.completed ? '✓' : '○'} ${item.label} · ${Math.min(item.progress, item.target).toLocaleString()} / ${item.target.toLocaleString()} · +${item.reward} Credits`));
      const bar = document.createElement('progress'); bar.max = Math.max(1, item.target); bar.value = Math.min(item.target, item.progress); row.append(bar); dailyPlan.append(row);
    }
    cards.append(dailyPlan);
    const seasonState=data.progression.season;
    if(seasonState){
      const next=seasonState.rewards.find(item=>item.state!=='claimed');
      const days=Math.max(0,Math.ceil((seasonState.endsAt-Date.now())/86_400_000));
      const seasonCard=this.progressCard('season','✦ SEASON',`${seasonState.name} · ${seasonState.points.toLocaleString()} POINTS`,`${seasonState.theme} · ${days} days left${next?` · Next: ${next.label} at ${next.points}`:''}`);
      for(const mission of seasonState.missions){const row=document.createElement('div');row.className='pilot-progress-detail';row.append(textElement('span',`${mission.completed?'✓':'○'} ${mission.label} · ${mission.progress} / ${mission.target}`));const bar=document.createElement('progress');bar.max=mission.target;bar.value=mission.progress;row.append(bar);seasonCard.append(row);}
      for(const reward of seasonState.rewards){const row=textElement('div',`${reward.state==='claimed'?'✓':reward.state==='claimable'?'◆':'○'} ${reward.points.toLocaleString()} · ${reward.label}${reward.state==='claimable'?' · READY':''}`,'pilot-progress-detail');if(reward.state==='claimable'&&data.progression.claimSeasonReward)row.append(actionButton({label:'CLAIM',run:()=>data.progression.claimSeasonReward?.(reward.id)}));seasonCard.append(row);}
      cards.append(seasonCard);
      if(seasonState.weeklyEvent){const weekly=seasonState.weeklyEvent;const weeklyCard=this.progressCard('season-weekly','◷ WEEKLY EVENT',weekly.title,weekly.description);const row=document.createElement('div');row.className='pilot-progress-detail';row.append(textElement('span',`${weekly.completed?'✓':'○'} ${weekly.progress} / ${weekly.target}`));const bar=document.createElement('progress');bar.max=weekly.target;bar.value=weekly.progress;row.append(bar);weeklyCard.append(row);if(weekly.completed&&!weekly.rewarded&&data.progression.claimWeeklyEventReward)weeklyCard.append(actionButton({label:'CLAIM WEEKLY REWARD',run:()=>data.progression.claimWeeklyEventReward?.(weekly.weeklyEventId)}));cards.append(weeklyCard);}
    }
    const recordLabels: Record<string, string> = { top_speed: 'TOP SPEED', highest_altitude: 'HIGHEST ALTITUDE', longest_flight: 'LONGEST FLIGHT', best_landing: 'BEST LANDING', longest_kill: 'LONGEST KILL', most_territories: 'MOST TERRITORIES' };
    const recordsCard = this.progressCard('records', '★ PERSONAL RECORDS', Object.keys(data.progression.personalRecords).length ? '' : 'No records yet', 'Your best verified flights.');
    for (const [key, record] of Object.entries(data.progression.personalRecords)) recordsCard.append(textElement('div', `${recordLabels[key] ?? key.toUpperCase()} · ${Math.round(record.value).toLocaleString()}`, 'pilot-progress-detail'));
    cards.append(recordsCard);
    if (data.progression.pvpChallenge) cards.append(this.progressCard('pvp', '⚔ PvP CHALLENGE', data.progression.pvpChallenge.mode === 'dogfight' ? 'DOGFIGHT' : 'AIRPORT SPRINT', data.progression.pvpChallenge.status.toUpperCase()));
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
    if (this.sections.includes('MISSIONS')) missionCard.append(actionButton({ label: 'VIEW MISSIONS', run: () => this.switchTo('MISSIONS') }));
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
    const lastWeekly = data.progression.weeklyReward;
    const weekly = this.progressCard('weekly', '🏆 WEEKLY', weeklyBoard?.localRank ? `Your rank #${weeklyBoard.localRank}` : 'No rank yet', lastWeekly ? `Last week: #${lastWeekly.rank} ${lastWeekly.category} · +${lastWeekly.credits} Credits · ${lastWeekly.badge}` : 'Your rank this week.');
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
    aircraft.append(aircraftList, actionButton({ label: 'OPEN AIRCRAFTS', run: data.garage.open, disabled: !data.garage.available, title: data.garage.reason }));
    if (!data.garage.available) aircraft.append(textElement('small', 'Land and stop at an airport to open Aircrafts.', 'pilot-progress-detail'));
    cards.append(aircraft);
    progress.append(cards); content.append(progress);
    }

    if (this.activeSection === 'GARAGE') {
    const garageSection = section('Aircrafts');
    garageSection.append(textElement('p', 'Choose, compare and equip aircraft. Land at an airport and stop safely to change aircraft.', 'pilot-menu-muted'));
    garageSection.append(actionButton({ label: data.garage.available ? 'Open Aircrafts' : 'Aircrafts unavailable in flight', run: data.garage.open, disabled: !data.garage.available, title: data.garage.reason }));
    if (!data.garage.available) garageSection.append(actionButton({ label: 'Set Airport Waypoint', run: data.garage.setAirportWaypoint }));
    if (!data.garage.available && data.garage.reason) garageSection.append(textElement('small', data.garage.reason, 'pilot-menu-muted'));
    content.append(garageSection);
    if(data.intercity.routes.length){const routes=section('INTERCITY FLIGHTS');routes.append(textElement('p','Land and stop at the departure airport, then begin a city-to-city flight.','pilot-menu-muted'));for(const route of data.intercity.routes)routes.append(this.createCard({name:`FLY TO ${route.destination.toUpperCase()}`,detail:route.distanceLabel,meta:`Recommended: ${route.recommendedAircraft} · About ${route.estimatedFlightTime} sec`,actions:[{label:'START ROUTE',run:route.start,disabled:!route.available,title:route.reason}]}));content.append(routes);}
    }

    if (this.activeSection === 'CONTROLS') {
    const controls = section('CONTROLS');
    const selectRow=(label:string,value:string,values:readonly string[],change:(value:string)=>void)=>{const row=document.createElement('label');row.className='pilot-menu-audio-row';row.append(textElement('span',label));const select=document.createElement('select');for(const optionValue of values){const option=document.createElement('option');option.value=optionValue;option.textContent=optionValue.toUpperCase();option.selected=optionValue===value;select.append(option);}select.addEventListener('change',()=>{change(select.value);hapticsManager.emit('selection');});row.append(select);return row;};
    controls.append(
      textElement('p',data.flightPitch.touch
        ? 'NORMAL: joystick UP = + ALT and DOWN = − ALT. INVERTED: joystick DOWN = + ALT and UP = − ALT.'
        : `NORMAL: ${actionKeyLabel('pitchUp')} = + ALT and ${actionKeyLabel('pitchDown')} = − ALT. INVERTED: ${actionKeyLabel('pitchDown')} = + ALT and ${actionKeyLabel('pitchUp')} = − ALT.`,'pilot-menu-muted'),
      selectRow('FLIGHT PITCH',data.flightPitch.inverted?'inverted':'normal',['normal','inverted'],value=>data.flightPitch.setInverted(value==='inverted')),
    );
    if(data.preferences.touchLayout){
      const touchDescription=textElement('p','', 'pilot-menu-muted');touchDescription.textContent='The left stick controls turning and altitude. The right throttle lever holds your selected power; drag into its Boost Zone to use Boost.';
      controls.append(
        touchDescription,
        selectRow('TOUCH CONTROLS',data.preferences.touchMode,['auto','on','off'],value=>data.preferences.setTouchMode(value as 'auto'|'on'|'off')),
      );
      const labels:Record<MobileControlId,string>={stick:'DIRECTION STICK',throttle:'THROTTLE LEVER',fire:'FIRE'};
      for(const control of ['stick','throttle','fire'] as const){
        const editor=document.createElement('fieldset');editor.className='pilot-mobile-control-editor';const legend=document.createElement('legend');legend.textContent=labels[control];editor.append(legend);
        for(const [property,label] of [['x','Horizontal'],['y','Vertical'],['scale','Size']] as const){
          const {min,max,step}=mobileControlPlacementLimits[control][property];
          const row=document.createElement('label');const value=textElement('output',property==='scale'?`${Math.round(data.preferences.mobileLayout[control][property]*100)}%`:`${Math.round(data.preferences.mobileLayout[control][property])}%`);
          const slider=document.createElement('input');slider.type='range';slider.min=String(min);slider.max=String(max);slider.step=String(step);slider.value=String(data.preferences.mobileLayout[control][property]);
          slider.addEventListener('input',()=>{const next=Number(slider.value);value.textContent=property==='scale'?`${Math.round(next*100)}%`:`${Math.round(next)}%`;data.preferences.setMobileControl(control,{[property]:next});});
          slider.addEventListener('change', () => hapticsManager.emit('selection'));
          row.append(textElement('span',label),slider,value);editor.append(row);
        }
        controls.append(editor);
      }
      controls.append(actionButton({label:'RESET MOBILE CONTROLS',run:()=>{data.preferences.mobileLayout=data.preferences.resetMobileLayout();hapticsManager.emit('selection');this.render(data,true);}}));
    }else{
      controls.append(textElement('p','Keyboard and mouse reference for desktop flight.','pilot-menu-muted'));
      for(const group of controlGroups){
        const reference=document.createElement('div');reference.className='pilot-menu-control-group';reference.append(textElement('h3',group.label));
        for(const row of group.rows)reference.append(textElement('div',`${row.keyLabel ?? controlKeyLabel(row.actions)}   ${row.label}`,'pilot-menu-controls'));
        controls.append(reference);
      }
      const camera=document.createElement('div');camera.className='pilot-menu-control-group';camera.append(textElement('h3','CAMERA & GAME'));
      camera.append(
        textElement('div',`${cameraControlLabels.look}   Camera Look`,'pilot-menu-controls'),
        textElement('div',`${cameraControlLabels.zoom}   Camera Zoom`,'pilot-menu-controls'),
        textElement('div',`${menuKeyLabel('map')}   Map`,'pilot-menu-controls'),
        textElement('div',`${menuKeyLabel('menu')}   Menu`,'pilot-menu-controls'),
        textElement('div',`${menuKeyLabel('restart')}   Restart / Respawn`,'pilot-menu-controls'),
        textElement('div','H   Show / Hide Controls Help','pilot-menu-controls'),
      );
      controls.append(camera);
    }
    const navigation = section('NAVIGATION');
    navigation.append(actionButton({ label: data.navigation.enabled ? 'Nav Markers On' : 'Nav Markers Off', run: () => { data.navigation.toggle(); hapticsManager.emit('selection'); } }));
    const graphics = section('GRAPHICS');
    graphics.append(selectRow('GRAPHICS QUALITY',data.preferences.graphicsQuality,['auto','high','balanced','low'],value=>data.preferences.setGraphicsQuality(value as 'auto'|'high'|'balanced'|'low')),textElement('small','Graphics changes apply next time the city loads.','pilot-menu-muted'));
    content.append(controls,navigation,graphics);
    }

    if (this.activeSection === 'AUDIO') {
    const audio = section('Audio');
    audio.append(actionButton({ label: data.audio.muted ? 'Sound Off · Turn On' : 'Sound On · Turn Off', run: () => { data.audio.toggle(); hapticsManager.emit('selection'); } }));
    audio.append(actionButton({ label: data.haptics.available ? `HAPTICS: ${data.haptics.enabled ? 'ON' : 'OFF'}` : 'HAPTICS: UNAVAILABLE ON WEB', run: data.haptics.toggle, disabled: !data.haptics.available }));
    for (const category of ['master', 'music', 'engine', 'combat', 'ui'] as const) {
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
      slider.addEventListener('change', () => hapticsManager.emit('selection'));
      row.append(title, slider, value);
      audio.append(row);
    }
    content.append(audio);
    }

    if (this.activeSection === 'HELP') {
      const help = section('HELP');
      help.append(textElement('p', 'See the visual guide or open Controls for the current input reference.', 'pilot-menu-muted'));
      help.append(textElement('p', 'Day and Dusk change the view, not the pilots in your city.', 'pilot-menu-muted'));
      help.append(actionButton({ label: 'OPEN CONTROLS', run: () => this.switchTo('CONTROLS') }));
      if(data.guide.enabled){
        help.append(actionButton({ label: 'OPEN VISUAL GUIDE', run: data.guide.open }));
        help.append(actionButton({ label: 'REPLAY TUTORIAL FLIGHT', run: data.guide.replay }));
      }
      if(data.preferences.touchLayout){const touchHelp=textElement('p','', 'pilot-menu-controls');touchHelp.textContent='TOUCH: Left stick turns and changes altitude. The right lever holds throttle; drag above FAST and keep holding for Boost. Fire and the aim circle remain independent.';help.append(touchHelp);}
      else help.append(textElement('p','Open Controls for the full keyboard and mouse reference.','pilot-menu-controls'));
      const hints = section('HINTS');
      hints.append(
        textElement('p', 'Short one-time reminders appear when a system first becomes relevant. They never pause multiplayer flight.', 'pilot-menu-muted'),
        actionButton({ label: data.hints.enabled ? 'Hints On' : 'Hints Off', run: () => { data.hints.toggle(); hapticsManager.emit('selection'); } }),
      );
      content.append(help,hints);
    }

    if (this.activeSection === 'WORLD / CITIES') {
      const world = section('WORLD / CITIES');
      world.append(
        textElement('p', `Current city: ${data.city.name}`, 'pilot-menu-muted'),
        textElement('p', 'Choose an available destination and prepare your next flight.'),
        actionButton({ label: 'CHOOSE CITY', run: data.city.changeCity, intent: 'primary' }),
      );
      if (data.intercity.routes.length) {
        for (const route of data.intercity.routes) world.append(this.createCard({
          name: route.destination,
          detail: route.distanceLabel,
          meta: `Recommended: ${route.recommendedAircraft} · About ${route.estimatedFlightTime} sec`,
          actions: [{ label: 'START ROUTE', run: route.start, disabled: !route.available, title: route.reason }],
        }));
      }
      content.append(world);
    }

    if (this.activeSection === 'LEGAL / SUPPORT') {
      const legal = section('LEGAL / SUPPORT');
      const links = document.createElement('div'); links.className = 'pilot-menu-license-links';
      links.append(
        externalLink('Terms of Use', legalPolicyHref(legalConfig.policyRoutes.terms)),
        externalLink('Privacy Policy', legalPolicyHref(legalConfig.policyRoutes.privacy)),
        externalLink('Refund Policy', legalPolicyHref(legalConfig.policyRoutes.refund)),
        externalLink('Support', legalPolicyHref(legalConfig.policyRoutes.support)),
      );
      legal.append(textElement('p', 'Policies and help for Airport Chaos.', 'pilot-menu-muted'), links);
      const advertising = section('BUSINESS CONTACT');
      const sponsorInfo = document.createElement('div'); sponsorInfo.className = 'pilot-menu-sponsor-info';
      sponsorInfo.append(textElement('p', 'Interested in advertising in Airport Chaos?'),
        textElement('p', `Sponsor: ${sponsorLocations}`), textElement('p', companyContact.companyName));
      const sponsorLinks = document.createElement('div'); sponsorLinks.innerHTML = contactLinks(); sponsorInfo.append(sponsorLinks);
      sponsorInfo.hidden = !this.advertisingOpen;
      advertising.append(actionButton({ label: 'Advertise in Airport Chaos', run: () => {
        this.advertisingOpen = !this.advertisingOpen;
        sponsorInfo.hidden = !this.advertisingOpen;
      } }), sponsorInfo);
      content.append(legal,advertising);
    }

    if (this.activeSection === 'DATA LICENSES') {
      const licenses = section('DATA LICENSES');
      licenses.append(
        textElement('p', 'Airport Chaos uses OpenStreetMap-derived geographic data for Dallas and Milwaukee.'),
        textElement('p', 'OpenStreetMap data is licensed under the Open Database License (ODbL) 1.0.', 'pilot-menu-muted'),
      );
      const links = document.createElement('div');
      links.className = 'pilot-menu-license-links';
      links.append(
        externalLink('OpenStreetMap copyright', 'https://www.openstreetmap.org/copyright'),
        externalLink('ODbL 1.0 license', 'https://opendatacommons.org/licenses/odbl/1-0/'),
        externalLink('Data provenance and availability', '/osm-data-license.txt'),
      );
      licenses.append(links);
      content.append(licenses);
    }
    content.scrollTop = scrollTop;
  }

  close(notify = true): void {
    this.lastData?.map.unmount();
    if (this.rewardsTimer !== undefined) window.clearTimeout(this.rewardsTimer);
    this.rewardsTimer = undefined;
    this.openState = false;
    this.pointerActive = false;
    this.element.hidden = true;
    this.sectionHistory.length = 0;
    if (notify) this.options.onClose?.();
  }

  private backOrClose(): void {
    if (this.options.appShell) { this.close(); return; }
    const previous = this.sectionHistory.pop();
    if (!previous || !this.lastData) {
      this.close();
      return;
    }
    this.activeSection = previous;
    this.onSectionViewed?.(previous);
    this.render(this.lastData, true);
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
