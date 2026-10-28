import { competitiveModes } from '../../shared/competitive-modes.mjs';
import { dallasDisplayNames } from '../../shared/dallas-display-names.mjs';
import { AppShellHeader } from './app-shell';
import type { FlightLaunchAircraft } from './flight-launch-aircraft';
import { createRankHelmet, rankHelmetForLevel, rankHelmets } from './rank-helmets';

type DuelMessage = {
  type: string; elapsedMs?: number; fairWait?: boolean; reason?: string;
  matchId?: string; pilotA?: string; pilotB?: string; levelA?: number; levelB?: number;
  pilotAId?: string; pilotBId?: string; aircraftA?: string; aircraftB?: string;
  playerAId?: string; playerBId?: string;
  avatarA?: string; avatarB?: string;
  countdownEndsAt?: number; launchStartedAt?: number; launchCountdownAt?: number; launchEndsAt?: number;
  phase?: string; scoreA?: number; scoreB?: number; endsAt?: number; recovered?: boolean;
  outcome?: string; balanceA?: number; balanceB?: number; entry?: number; prize?: number;
  secondsLeft?: number; reconnectSeconds?: number; boundaryMeters?: number;
  protectedUntil?: number; practice?: boolean; aiOpponent?: boolean;
  opponentDisconnected?: boolean; pilotNameA?: string; pilotNameB?: string;
  rematchAvailable?: boolean; available?: boolean; readyA?: boolean; readyB?: boolean;
};

type PilotPresentation = { name: string; level: number; aircraft: string; avatar?: string; helmetVerified?: boolean; isAi?: boolean };
const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const entryCredits = competitiveModes.skyDuel.entryCredits;
const prizeCredits = competitiveModes.skyDuel.prizeCredits;
const creditCollectionDurationMs = 1_900;
const creditCollectionStaggerMs = 100;
const skyDuelHeaderTitle = 'DALLAS·SKYDUEL';
const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class SkyDuelUi {
  private readonly root: HTMLElement;
  private readonly headerElement: HTMLElement;
  private readonly header: AppShellHeader;
  private readonly panel: HTMLElement;
  private readonly summaryCard: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly copy: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly matchup: HTMLElement;
  private readonly matchupCenter: HTMLElement;
  private readonly localCard: HTMLElement;
  private readonly opponentCard: HTMLElement;
  private readonly pot: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly countdownNumber: HTMLElement;
  private readonly rematchButton: HTMLButtonElement;
  private readonly practiceBadge: HTMLElement;
  private readonly resultPilots: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly localHud: HTMLElement;
  private readonly opponentHud: HTMLElement;
  private readonly localScore: HTMLElement;
  private readonly opponentScore: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly runwayIntro: HTMLElement;
  private readonly runwayLocalName: HTMLElement;
  private readonly runwayOpponentName: HTMLElement;
  private readonly runwayLocalAirport: HTMLElement;
  private readonly runwayOpponentAirport: HTMLElement;
  private readonly runwayCountdown: HTMLElement;
  private localPilot: PilotPresentation = { name: 'PILOT', level: 1, aircraft: 'trainer' };
  private opponentPilot?: PilotPresentation;
  private balance = 0;
  private skyTokens = 0;
  private paidEnabled = false;
  private aiPracticeEnabled = false;
  private practiceMatch = false;
  private paidReservationConfirmed = false;
  private queuedAt = 0;
  private fairWait = false;
  private matchId = '';
  private resultMatchId = '';
  private localPilotId = '';
  private pilotAId = '';
  private playerAId = '';
  private playerBId = '';
  private scoreA = 0;
  private scoreB = 0;
  private endsAt = 0;
  private countdownEndsAt = 0;
  private launchStartedAt = 0;
  private launchCountdownAt = 0;
  private launchEndsAt = 0;
  private phase = 'connecting';
  private autoQueue = true;
  private abandonedSearch = false;
  private opponentDisconnected = false;
  private rotationIndex = -1;
  private rotationTimer?: number;
  private flipTimer?: number;
  private flipAnimation?: Animation;
  private stageTimer?: number;
  private coinTimer?: number;
  private resultPayoutPending = false;
  private rematchState?: Pick<DuelMessage, 'available' | 'readyA' | 'readyB' | 'reason'>;
  private readonly coinAnimations: Animation[] = [];
  private readonly coinElements: HTMLElement[] = [];
  private readonly seenMatches = new Set<string>();
  private presentationAckMatchId = '';
  private pendingState?: DuelMessage;
  private pendingResultAckMatchId = '';
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.leaveBackgroundedSearch();
    else {
      if (this.phase === 'searching' && this.localPilotId) this.startHelmetRotation();
      if (this.pendingResultAckMatchId && this.send('skyDuelResultSeen', this.pendingResultAckMatchId)) this.pendingResultAckMatchId = '';
    }
  };
  private readonly onPageHide = (): void => this.leaveBackgroundedSearch();
  private queueTimer?: number;
  private tickId: number;

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

  private renderHudIdentity(): void {
    for (const [side, element, pilot] of [['local', this.localHud, this.localPilot],
      ['opponent', this.opponentHud, this.opponentPilot]] as const) {
      element.querySelector<HTMLElement>('.sky-duel-hud-name')!.textContent = pilot?.name || (side === 'opponent' ? 'OPPONENT' : 'YOU');
      element.querySelector<HTMLElement>('.sky-duel-hud-level')!.textContent = pilot && !pilot.isAi && pilot.helmetVerified !== false ? `L${pilot.level}` : '';
      const helmet = element.querySelector<HTMLElement>('.sky-duel-hud-helmet')!;
      helmet.replaceChildren();
      if (pilot && pilot.helmetVerified !== false) helmet.append(createRankHelmet(rankHelmetForLevel(pilot.level), 'small'));
    }
  }

  opponentEntityId(): string {
    if (!this.matchId || !this.playerAId || !this.playerBId) return '';
    return this.localPilotId === this.pilotAId ? this.playerBId : this.playerAId;
  }

  runwayIntroProgress(): number | undefined {
    if (this.phase !== 'launch' || this.opponentDisconnected || !this.launchStartedAt ||
      Date.now() >= this.launchEndsAt) return undefined;
    return Math.max(0, Math.min(1, (Date.now() - this.launchStartedAt) /
      (this.launchCountdownAt - this.launchStartedAt)));
  }

  isRunwayLaunchActive(): boolean { return this.phase === 'launch'; }
  blocksFlightInput(): boolean {
    return Boolean(this.matchId) && (this.phase === 'found' || this.phase === 'collecting' ||
      this.phase === 'loading' || this.phase === 'countdown' || this.phase === 'launch');
  }

  setRunwayIntroVisible(visible: boolean): void {
    const remaining = this.launchEndsAt - Date.now();
    this.runwayCountdown.hidden = !visible || Date.now() < this.launchCountdownAt;
    if (!this.runwayCountdown.hidden) {
      const number = String(Math.max(1, Math.ceil(remaining / 1_000)));
      if (this.runwayCountdown.textContent !== number) this.runwayCountdown.textContent = number;
    }
    if (this.runwayIntro.hidden === !visible) return;
    this.runwayIntro.hidden = !visible;
    this.root.classList.toggle('is-runway-intro', visible);
    if (visible) {
      const localIsA = this.localPilotId === this.pilotAId;
      this.runwayLocalName.textContent = this.localPilot.name.toUpperCase();
      this.runwayOpponentName.textContent = (this.opponentPilot?.name || 'AI PLAYER').toUpperCase();
      this.runwayLocalAirport.textContent = `${localIsA ? dallasDisplayNames.dfw : dallasDisplayNames.love} · RUNWAY`;
      this.runwayOpponentAirport.textContent = `${localIsA ? dallasDisplayNames.love : dallasDisplayNames.dfw} · RUNWAY`;
    }
  }

  updateTelemetry(localHealth: number, localAltitudeFeet: number, opponentHealth?: number, opponentAltitudeFeet?: number): void {
    if (this.hud.hidden) return;
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

  constructor(host: HTMLElement, private readonly send: (type: string, matchId?: string) => boolean,
    private readonly back: () => void, private readonly earnCredits: () => void,
    private readonly notify: (message: string) => void,
    launchPilot: FlightLaunchAircraft | null = null) {
    this.root = document.createElement('section');
    this.root.className = 'sky-duel-ui is-presentation';
    this.root.setAttribute('aria-label', 'Sky Duel');
    this.headerElement = document.createElement('header');
    this.headerElement.className = 'app-shell-header';
    const noAction = () => undefined;
    this.header = new AppShellHeader(this.headerElement, {
      home: () => this.onBack(), back: () => this.onBack(), advertise: noAction,
      friends: noAction, garage: noAction, store: noAction, rewards: noAction, profile: noAction,
    });
    this.header.show({ active: undefined, hubActions: false, pageTitle: skyDuelHeaderTitle,
      advertiseVisible: false, pilotName: '', credits: 0, skyTokens: 0, storeHasOffers: false,
      rewardsAvailable: false, readOnlyWallet: true });
    if (launchPilot?.pilotPreview) {
      this.localPilotId = launchPilot.pilotId;
      this.localPilot = { name: launchPilot.pilotPreview.name, level: launchPilot.pilotPreview.level,
        aircraft: launchPilot.type };
      this.balance = launchPilot.pilotPreview.credits;
      this.skyTokens = launchPilot.pilotPreview.skyTokens;
      this.header.updateIdentity(this.localPilot.name, this.balance, this.skyTokens, this.localPilot.level);
    }
    this.headerElement.querySelector<HTMLElement>('.app-shell-wallet')!.hidden = !launchPilot?.pilotPreview;
    this.panel = document.createElement('div');
    this.panel.className = 'sky-duel-panel is-awaiting-welcome';
    this.heading = document.createElement('h2');
    this.heading.className = 'sky-duel-title';
    this.copy = document.createElement('p');
    this.actions = document.createElement('div');
    this.actions.className = 'sky-duel-actions';
    this.summaryCard = document.createElement('div');
    this.summaryCard.className = 'game-card-frame sky-duel-summary-card';
    this.summaryCard.hidden = true;
    this.resultPilots = document.createElement('div');
    this.resultPilots.className = 'sky-duel-result-pilots';
    this.resultPilots.hidden = true;
    this.matchup = document.createElement('div');
    this.matchup.className = 'sky-duel-matchup';
    this.localCard = this.pilotCard();
    this.opponentCard = this.pilotCard();
    const center = document.createElement('div');
    this.matchupCenter = center;
    center.className = 'sky-duel-matchup-center';
    const vs = document.createElement('strong'); vs.className = 'sky-duel-versus'; vs.textContent = 'VS';
    this.pot = document.createElement('div'); this.pot.className = 'sky-duel-pot'; this.pot.hidden = true;
    this.countdown = document.createElement('div'); this.countdown.className = 'sky-duel-countdown'; this.countdown.hidden = true;
    this.countdownNumber = document.createElement('strong'); this.countdownNumber.className = 'sky-duel-countdown-number';
    this.countdown.append(this.countdownNumber);
    this.rematchButton = this.button('PLAY AGAIN', () => {
      if (this.resultMatchId && this.send('skyDuelRematchReady', this.resultMatchId)) this.rematchButton.disabled = true;
    });
    this.rematchButton.classList.add('sky-duel-rematch-button');
    this.rematchButton.hidden = true;
    this.practiceBadge = document.createElement('div'); this.practiceBadge.className = 'sky-duel-practice'; this.practiceBadge.textContent = 'FREE PRACTICE'; this.practiceBadge.hidden = true;
    center.append(this.copy, this.pot, this.practiceBadge, vs, this.countdown, this.rematchButton);
    this.matchup.append(this.localCard, center, this.opponentCard);
    this.panel.append(this.heading, this.matchup, this.actions, this.summaryCard);
    this.hud = document.createElement('div');
    this.hud.className = 'sky-duel-hud';
    this.hud.setAttribute('aria-label', 'Sky Duel match status');
    this.localHud = this.hudPilot('local');
    this.opponentHud = this.hudPilot('opponent');
    const scoreboard = document.createElement('div'); scoreboard.className = 'sky-duel-hud-scoreboard';
    this.localScore = document.createElement('strong'); this.localScore.className = 'sky-duel-hud-score';
    this.clock = document.createElement('time'); this.clock.className = 'sky-duel-hud-clock';
    this.opponentScore = document.createElement('strong'); this.opponentScore.className = 'sky-duel-hud-score';
    scoreboard.append(this.localScore, this.clock, this.opponentScore);
    this.hud.append(this.localHud, scoreboard, this.opponentHud);
    this.hud.hidden = true;
    this.runwayIntro = document.createElement('div');
    this.runwayIntro.className = 'sky-duel-runway-intro';
    this.runwayIntro.hidden = true;
    const runwaySide = (side: 'local' | 'opponent'): [HTMLElement, HTMLElement, HTMLElement] => {
      const column = document.createElement('div');
      column.className = `sky-duel-runway-side sky-duel-runway-${side}`;
      const name = document.createElement('strong'); name.className = 'sky-duel-runway-name';
      const airport = document.createElement('span'); airport.className = 'sky-duel-runway-airport';
      column.append(name, airport);
      return [column, name, airport];
    };
    const [localSide, localName, localAirport] = runwaySide('local');
    const [opponentSide, opponentName, opponentAirport] = runwaySide('opponent');
    this.runwayLocalName = localName;
    this.runwayOpponentName = opponentName;
    this.runwayLocalAirport = localAirport;
    this.runwayOpponentAirport = opponentAirport;
    this.runwayCountdown = document.createElement('strong');
    this.runwayCountdown.className = 'sky-duel-runway-countdown';
    this.runwayIntro.append(localSide, opponentSide, this.runwayCountdown);
    this.root.append(this.headerElement, this.hud, this.panel, this.runwayIntro);
    host.append(this.root);
    for (const helmet of rankHelmets) { const image = new Image(); image.src = helmet.src; }
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
    this.tickId = window.setInterval(() => this.tick(), 250);
  }

  setWelcome(pilotId: string, credits: number, skyTokens: number, paidEnabled: boolean, aiPracticeEnabled: boolean,
    pilot: PilotPresentation): void {
    this.localPilotId = pilotId;
    this.balance = credits;
    this.skyTokens = skyTokens;
    this.paidEnabled = paidEnabled;
    this.aiPracticeEnabled = aiPracticeEnabled;
    this.localPilot = pilot;
    this.header.updateIdentity(pilot.name, credits, skyTokens, pilot.level);
    this.headerElement.querySelector<HTMLElement>('.app-shell-wallet')!.hidden = false;
    if (this.pendingResultAckMatchId && !document.hidden && this.send('skyDuelResultSeen', this.pendingResultAckMatchId))
      this.pendingResultAckMatchId = '';
    if (this.matchId || this.phase === 'active' || this.phase === 'overtime') return;
    if (document.hidden) this.leaveBackgroundedSearch();
    if (this.abandonedSearch) { this.send('skyDuelCancel'); this.showEntry(); return; }
    if (!paidEnabled) { this.autoQueue = false; this.showEntry(); return; }
    if (this.phase === 'searching') { this.renderSearching(); return; }
    if (this.phase === 'unavailable') { this.showEntry(); return; }
    if (this.autoQueue && this.phase === 'connecting') {
      this.renderSearching();
      window.clearTimeout(this.queueTimer);
      this.queueTimer = window.setTimeout(() => {
        if (this.autoQueue && !this.matchId && this.phase === 'connecting') this.startSearch();
      }, 300);
    }
  }

  setBalance(credits: number): void {
    if (this.resultPayoutPending && credits !== this.balance) {
      this.clearPresentationTimers();
      this.pot.textContent = '';
      if (this.rematchState) this.showRematchState(this.rematchState);
    }
    this.balance = credits;
    if (!this.resultPayoutPending) this.header.updateIdentity(this.localPilot.name, credits, this.skyTokens, this.localPilot.level);
    if (this.phase === 'entry') this.showEntry();
  }

  showServerUnavailable(): void {
    this.clearPresentationTimers();
    this.stopHelmetRotation();
    this.phase = 'unavailable';
    this.autoQueue = false;
    this.panel.hidden = false;
    this.hud.hidden = true;
    this.headerElement.hidden = false;
    this.setSummaryLayout(true);
    this.root.classList.add('is-presentation');
    this.root.classList.remove('is-searching');
    this.matchup.hidden = true;
    this.resultPilots.replaceChildren(this.pilotIdentity(this.localPilot, Boolean(this.localPilotId)));
    this.resultPilots.hidden = !this.localPilotId;
    this.heading.textContent = 'SKY DUEL';
    this.copy.textContent = 'The QA server needs the Sky Duel update.';
    this.actions.replaceChildren(this.button('BACK TO MULTIPLAYER', this.back, 'secondary'));
  }

  hasReservedMatch(): boolean { return Boolean(this.matchId) && !this.practiceMatch; }
  hasPracticeMatch(): boolean { return Boolean(this.matchId) && this.practiceMatch; }
  hasAbandonedSearch(): boolean { return this.abandonedSearch; }

  handle(message: DuelMessage): void {
    if (this.abandonedSearch) {
      if (message.type === 'skyDuelCancelled' || message.type === 'skyDuelResult') {
        this.abandonedSearch = false;
        this.showEntry();
      }
      return;
    }
    if (message.type === 'skyDuelWaiting') {
      if (this.matchId || this.phase === 'active' || this.phase === 'result') return;
      if (!this.queuedAt) this.queuedAt = Date.now() - (message.elapsedMs ?? 0);
      this.fairWait = message.fairWait === true;
      this.phase = 'searching';
      this.renderSearching();
    } else if (message.type === 'skyDuelCancelled') {
      if (this.matchId) return;
      this.queuedAt = 0;
      this.showEntry();
    } else if (message.type === 'skyDuelError') {
      if (this.matchId) return;
      if (this.phase === 'result') { this.copy.textContent = this.errorText(message.reason); return; }
      this.queuedAt = 0;
      this.showEntry(this.errorText(message.reason));
    } else if (message.type === 'skyDuelRematchState') {
      if (this.phase !== 'result' || message.matchId !== this.resultMatchId) return;
      this.showRematchState(message);
    } else if (message.type === 'skyDuelLoading' || message.type === 'skyDuelFound') {
      if (!message.matchId || this.matchId && this.matchId !== message.matchId ||
        this.phase === 'result' && message.matchId === this.resultMatchId) return;
      if (message.type === 'skyDuelLoading' && this.seenMatches.has(message.matchId) && !message.recovered) return;
      if (message.type === 'skyDuelFound' && !message.recovered &&
        (this.phase === 'countdown' || this.phase === 'launch' || this.phase === 'active' || this.phase === 'overtime')) return;
      this.queuedAt = 0;
      this.autoQueue = false;
      this.matchId = message.matchId;
      this.resultMatchId = '';
      this.rematchButton.hidden = true;
      this.copy.classList.remove('is-result');
      this.opponentDisconnected = message.opponentDisconnected === true;
      if (message.recovered && message.type === 'skyDuelLoading') this.presentationAckMatchId = '';
      this.practiceMatch = message.practice === true;
      this.paidReservationConfirmed = !this.practiceMatch && message.entry === entryCredits && message.prize === prizeCredits;
      this.pilotAId = message.pilotAId ?? '';
      this.playerAId = message.playerAId ?? '';
      this.playerBId = message.playerBId ?? '';
      this.stopHelmetRotation();
      this.clearPresentationTimers();
      this.hud.hidden = true;
      this.panel.hidden = false;
      this.headerElement.hidden = false;
      this.setSummaryLayout(false);
      this.root.classList.add('is-presentation');
      this.root.classList.remove('is-searching');
      this.heading.textContent = 'SKY DUEL';
      const localIsA = this.localPilotId === this.pilotAId;
      const local = localIsA
        ? { name: message.pilotA ?? this.localPilot.name, level: message.levelA ?? this.localPilot.level,
            aircraft: message.aircraftA ?? this.localPilot.aircraft, avatar: message.avatarA ?? this.localPilot.avatar, helmetVerified: true }
        : { name: message.pilotB ?? this.localPilot.name, level: message.levelB ?? this.localPilot.level,
            aircraft: message.aircraftB ?? this.localPilot.aircraft, avatar: message.avatarB ?? this.localPilot.avatar, helmetVerified: true };
      const opponent: PilotPresentation = localIsA
        ? { name: message.pilotB ?? '', level: message.levelB ?? 1, aircraft: message.aircraftB ?? 'trainer', avatar: message.avatarB, helmetVerified: Boolean(message.pilotB) && Number.isFinite(message.levelB) }
        : { name: message.pilotA ?? '', level: message.levelA ?? 1, aircraft: message.aircraftA ?? 'trainer', avatar: message.avatarA, helmetVerified: Boolean(message.pilotA) && Number.isFinite(message.levelA) };
      opponent.isAi = message.aiOpponent === true || this.practiceMatch;
      this.localPilot = local;
      this.opponentPilot = opponent;
      this.renderHudIdentity();
      this.renderPilot(this.localCard, local, 'YOU', this.paidReservationConfirmed);
      this.renderPilot(this.opponentCard, opponent, opponent.isAi ? 'AI PLAYER' : 'OPPONENT', this.paidReservationConfirmed);
      if (this.opponentDisconnected) this.setWaitingNote(this.opponentCard, 'WAITING FOR PILOT');
      this.matchup.hidden = false;
      this.practiceBadge.hidden = !this.practiceMatch;
      this.pot.hidden = !this.paidReservationConfirmed;
      this.pot.textContent = '';
      this.pot.classList.remove('is-filled');
      this.copy.textContent = '';
      this.countdown.hidden = true;
      this.actions.replaceChildren();
      if (message.type === 'skyDuelFound') {
        if (message.phase === 'launch') this.enterLaunch(message);
        else this.enterCountdown(message.countdownEndsAt ?? 0, message.phase);
      } else {
        this.seenMatches.add(message.matchId);
        this.phase = 'found';
        this.opponentCard.classList.add('is-revealing');
        if (message.recovered) this.finishCollection();
        else this.stageTimer = window.setTimeout(() => this.beginCollection(), 400);
      }
      if (this.pendingState?.matchId === message.matchId) {
        const state = this.pendingState;
        this.pendingState = undefined;
        this.handle(state);
      }
    } else if (message.type === 'skyDuelState') {
      if (!this.matchId && message.matchId) { this.pendingState = message; return; }
      if (message.matchId && this.matchId && message.matchId !== this.matchId || this.phase === 'result') return;
      this.phase = message.phase ?? this.phase;
      this.scoreA = message.scoreA ?? this.scoreA;
      this.scoreB = message.scoreB ?? this.scoreB;
      this.endsAt = message.endsAt ?? this.endsAt;
      this.panel.hidden = this.phase !== 'countdown' && !(this.phase === 'launch' && this.opponentDisconnected);
      this.root.classList.toggle('is-presentation', this.phase === 'countdown' || this.phase === 'launch');
      this.root.classList.remove('is-searching');
      this.hud.hidden = this.phase === 'countdown' || this.phase === 'launch';
      this.headerElement.hidden = this.phase !== 'countdown' && !(this.phase === 'launch' && this.opponentDisconnected);
      const localIsA = this.localPilotId === this.pilotAId;
      this.localScore.textContent = String(localIsA ? this.scoreA : this.scoreB);
      this.opponentScore.textContent = String(localIsA ? this.scoreB : this.scoreA);
      if (this.phase === 'countdown') this.enterCountdown(message.countdownEndsAt ?? this.countdownEndsAt);
      else if (this.phase === 'launch') this.enterLaunch(message);
      else this.clearPresentationTimers();
    } else if (message.type === 'skyDuelBoundary') {
      if (message.secondsLeft) this.notify(`RETURN TO BATTLE AREA · ${message.secondsLeft} SEC`);
      else if (message.boundaryMeters !== undefined) this.notify(`BATTLE EDGE · ${message.boundaryMeters} M`);
    } else if (message.type === 'skyDuelOpponentDisconnected') {
      this.notify(`OPPONENT RECONNECTING · ${message.reconnectSeconds ?? 15} SEC`);
      this.opponentDisconnected = true;
      this.setWaitingNote(this.opponentCard, 'WAITING FOR PILOT');
      if (this.phase === 'countdown') this.countdown.hidden = true;
      if (this.phase === 'launch') {
        this.panel.hidden = false;
        this.headerElement.hidden = false;
        this.copy.textContent = 'Waiting for pilot';
      }
      if (this.phase === 'found' || this.phase === 'collecting' || this.phase === 'loading') this.clearPresentationTimers();
    } else if (message.type === 'skyDuelOpponentReconnected') {
      this.opponentDisconnected = false;
      this.setWaitingNote(this.opponentCard, '');
      this.notify('OPPONENT RECONNECTED');
      if (this.phase === 'countdown') { this.countdown.hidden = false; this.renderCountdown(); }
      else if (this.phase === 'found' || this.phase === 'collecting' || this.phase === 'loading') this.finishCollection();
    } else if (message.type === 'skyDuelResult') {
      if (this.matchId && message.matchId && message.matchId !== this.matchId || this.phase === 'result') return;
      this.clearPresentationTimers();
      this.stopHelmetRotation();
      this.matchId = '';
      this.resultMatchId = message.matchId ?? '';
      this.pilotAId = message.pilotA ?? this.pilotAId;
      this.phase = 'result';
      this.queuedAt = 0;
      this.hud.hidden = true;
      this.panel.hidden = false;
      this.setSummaryLayout(false);
      this.root.classList.add('is-presentation');
      this.root.classList.remove('is-searching');
      this.headerElement.hidden = false;
      this.matchup.hidden = false;
      this.practiceMatch = message.practice === true;
      if (!this.opponentPilot && message.pilotA && message.pilotB) {
        const localIsA = this.localPilotId === message.pilotA;
        this.opponentPilot = {
          name: (localIsA ? message.pilotNameB : message.pilotNameA) ?? 'OPPONENT',
          level: (localIsA ? message.levelB : message.levelA) ?? 1,
          aircraft: 'trainer', isAi: message.aiOpponent === true,
        };
      }
      const isA = this.localPilotId === message.pilotA;
      const settledBalance = isA ? message.balanceA : message.balanceB;
      this.balance = settledBalance ?? this.balance;
      const won = isA ? message.outcome === 'WIN_A' : message.outcome === 'WIN_B';
      this.heading.textContent = 'SKY DUEL';
      this.copy.textContent = message.outcome === 'DRAW' ? 'DRAW' : message.outcome === 'CANCELLED' ? 'MATCH CANCELLED' : won ? 'VICTORY!' : 'DEFEAT';
      this.copy.classList.add('is-result');
      const paidPrize = !this.practiceMatch && (message.outcome === 'WIN_A' || message.outcome === 'WIN_B') &&
        message.entry === entryCredits && message.prize === prizeCredits;
      this.resultPayoutPending = paidPrize && won && typeof settledBalance === 'number' &&
        Number.isSafeInteger(settledBalance) && settledBalance >= prizeCredits &&
        !message.recovered && !document.hidden && !reducedMotion();
      this.header.updateIdentity(this.localPilot.name, this.resultPayoutPending ? this.balance - prizeCredits : this.balance,
        this.skyTokens, this.localPilot.level);
      this.renderPilot(this.localCard, this.localPilot, 'YOU', paidPrize);
      this.renderPilot(this.opponentCard, this.opponentPilot, this.opponentPilot?.isAi ? 'AI PLAYER' : 'OPPONENT',
        paidPrize);
      this.matchup.classList.toggle('has-payout-result', paidPrize);
      if (message.outcome === 'WIN_A' || message.outcome === 'WIN_B') {
        this.matchup.classList.add('has-winner');
        const winnerCard = won ? this.localCard : this.opponentCard;
        winnerCard.classList.add('is-winner');
        winnerCard.querySelector<HTMLElement>('.sky-duel-winner-label')!.textContent = 'WINNER';
        const shower = document.createElement('span');
        shower.className = 'sky-duel-star-shower';
        shower.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < 28; index += 1) {
          const star = document.createElement('span');
          star.textContent = index % 4 === 0 ? '★' : '✦';
          star.style.setProperty('--star-x', `${8 + (index * 37) % 84}%`);
          star.style.setProperty('--star-delay', `${(index * 0.27) % 1.8}s`);
          star.style.setProperty('--star-duration', `${2.1 + (index % 4) * 0.23}s`);
          star.style.setProperty('--star-sway', `${(index % 2 ? 1 : -1) * (12 + index % 5 * 4)}px`);
          star.style.setProperty('--star-size', `${19 + index % 4 * 4}px`);
          shower.append(star);
        }
        winnerCard.querySelector<HTMLElement>('.sky-duel-helmet-slot')!.append(shower);
      }
      this.pot.hidden = !paidPrize;
      this.pot.textContent = paidPrize ? `${prizeCredits.toLocaleString()} Credits` : '';
      this.pot.classList.toggle('is-filled', paidPrize);
      for (const card of [this.localCard, this.opponentCard])
        card.querySelector<HTMLElement>('.sky-duel-stake')!.classList.toggle('is-collected', paidPrize);
      this.countdown.hidden = true;
      this.practiceBadge.hidden = !this.practiceMatch;
      this.actions.replaceChildren();
      this.showRematchState({ available: message.rematchAvailable === true, readyA: false, readyB: false });
      if (paidPrize) {
        if (this.resultPayoutPending) this.stageTimer = window.setTimeout(() => this.beginResultPayout(), 400);
        else this.finishResultPayout();
      }
      this.pendingResultAckMatchId = message.matchId ?? '';
      if (!document.hidden && this.pendingResultAckMatchId && this.send('skyDuelResultSeen', this.pendingResultAckMatchId))
        this.pendingResultAckMatchId = '';
    } else if (message.type === 'skyDuelPractice') {
      this.clearPresentationTimers();
      this.stopHelmetRotation();
      this.matchId = '';
      this.playerAId = '';
      this.playerBId = '';
      this.phase = 'practice';
      this.queuedAt = 0;
      this.panel.hidden = true;
      this.root.classList.remove('is-presentation');
      this.headerElement.hidden = true;
      this.hud.hidden = false;
      this.localScore.textContent = '—';
      this.opponentScore.textContent = '—';
      this.clock.textContent = '—';
      this.opponentPilot = undefined;
      this.renderHudIdentity();
    }
  }

  private pilotCard(): HTMLElement {
    const card = document.createElement('article');
    card.className = 'sky-duel-pilot-card';
    const label = document.createElement('span'); label.className = 'sky-duel-side-label';
    const winnerLabel = document.createElement('span'); winnerLabel.className = 'sky-duel-winner-label';
    const helmet = document.createElement('div'); helmet.className = 'sky-duel-helmet-slot';
    const waiting = document.createElement('span'); waiting.className = 'sky-duel-waiting-note'; waiting.hidden = true;
    helmet.append(waiting);
    const name = document.createElement('strong'); name.className = 'sky-duel-pilot-name';
    const level = document.createElement('span'); level.className = 'sky-duel-level';
    const stake = document.createElement('div'); stake.className = 'sky-duel-stake';
    const rematchLine = document.createElement('span'); rematchLine.className = 'sky-duel-rematch-line'; rematchLine.hidden = true;
    const coin = document.createElement('img'); coin.src = '/media/hub/credits.avif'; coin.alt = '';
    const amount = document.createElement('span'); amount.textContent = `${entryCredits} Credits`;
    stake.append(coin, amount);
    card.append(winnerLabel, label, helmet, name, level, stake, rematchLine);
    return card;
  }

  private setWaitingNote(card: HTMLElement, text: string): void {
    const note = card.querySelector<HTMLElement>('.sky-duel-waiting-note')!;
    note.textContent = text;
    note.hidden = !text;
  }

  private showRematchState(message: Pick<DuelMessage, 'available' | 'readyA' | 'readyB' | 'reason'>): void {
    this.rematchState = message;
    const localIsA = this.localPilotId === this.pilotAId;
    const localReady = localIsA ? message.readyA : message.readyB;
    const opponentReady = localIsA ? message.readyB : message.readyA;
    for (const [card, ready] of [[this.localCard, localReady], [this.opponentCard, opponentReady]] as const) {
      const line = card.querySelector<HTMLElement>('.sky-duel-rematch-line')!;
      line.hidden = !ready;
      line.textContent = ready ? 'PLAY AGAIN' : '';
    }
    this.rematchButton.hidden = message.available !== true;
    const insufficient = !this.practiceMatch && this.balance < entryCredits;
    this.rematchButton.disabled = this.resultPayoutPending || Boolean(localReady) || insufficient;
    this.rematchButton.textContent = insufficient ? 'NEED 500 CREDITS'
      : localReady && opponentReady ? 'MATCH STARTING…' : localReady ? 'WAITING FOR OPPONENT…' : 'PLAY AGAIN';
    if (message.available === false && message.reason)
      this.copy.textContent = message.reason === 'OPPONENT_LEFT' ? 'OPPONENT LEFT'
        : message.reason === 'INSUFFICIENT_CREDITS' ? 'NOT ENOUGH CREDITS TO REMATCH' : 'REMATCH UNAVAILABLE';
  }

  private setSummaryLayout(summary: boolean): void {
    this.panel.classList.remove('is-awaiting-welcome');
    this.summaryCard.hidden = !summary;
    this.panel.classList.toggle('is-matchmaking', !summary);
    this.headerElement.querySelector<HTMLElement>('.app-shell-page-title')!.textContent = summary ? 'DALLAS' : skyDuelHeaderTitle;
    this.headerElement.querySelector<HTMLButtonElement>('.app-shell-page-back')!.hidden = Boolean(this.matchId);
    if (summary) this.summaryCard.append(this.heading, this.resultPilots, this.copy, this.actions);
    else {
      this.panel.prepend(this.heading);
      this.matchupCenter.prepend(this.copy);
      this.panel.append(this.actions);
    }
  }

  private renderPilot(card: HTMLElement, pilot: PilotPresentation | undefined, label: string, showStake: boolean): void {
    this.matchup.classList.remove('has-winner');
    this.matchup.classList.remove('has-payout-result');
    card.classList.remove('is-winner');
    card.querySelector<HTMLElement>('.sky-duel-winner-label')!.textContent = '';
    const rematchLine = card.querySelector<HTMLElement>('.sky-duel-rematch-line')!;
    rematchLine.hidden = true;
    rematchLine.textContent = '';
    const isLocal = card === this.localCard;
    const sideLabel = card.querySelector<HTMLElement>('.sky-duel-side-label')!;
    if (isLocal && pilot) {
      const pilotName = document.createElement('span');
      pilotName.className = 'sky-duel-side-label-name';
      pilotName.textContent = pilot.name;
      const you = document.createElement('span');
      you.textContent = '(YOU)';
      sideLabel.replaceChildren(pilotName, you);
    } else sideLabel.textContent = label;
    const name = card.querySelector<HTMLElement>('.sky-duel-pilot-name')!;
    const level = card.querySelector<HTMLElement>('.sky-duel-level')!;
    const stake = card.querySelector<HTMLElement>('.sky-duel-stake')!;
    stake.querySelector<HTMLElement>('span')!.textContent = `${entryCredits} Credits`;
    const helmet = card.querySelector<HTMLElement>('.sky-duel-helmet-slot')!;
    const waiting = helmet.querySelector<HTMLElement>('.sky-duel-waiting-note')!;
    name.textContent = isLocal ? '' : pilot?.name ?? '';
    name.hidden = isLocal;
    const rank = pilot && pilot.helmetVerified !== false ? rankHelmetForLevel(pilot.level) : undefined;
    level.textContent = rank && pilot && !pilot.isAi ? `Level ${pilot.level}` : '';
    if (rank && pilot && !pilot.isAi) level.dataset.rank = rank.id;
    else delete level.dataset.rank;
    helmet.replaceChildren();
    if (rank) helmet.append(createRankHelmet(rank, 'large'));
    waiting.hidden = true;
    waiting.textContent = '';
    helmet.append(waiting);
    stake.hidden = !showStake;
    stake.classList.remove('is-collected');
  }

  private renderResultPilots(): void {
    this.resultPilots.replaceChildren();
    for (const pilot of [this.localPilot, this.opponentPilot]) {
      if (!pilot) continue;
      this.resultPilots.append(this.pilotIdentity(pilot, !this.practiceMatch || pilot === this.localPilot));
    }
    this.resultPilots.hidden = this.resultPilots.childElementCount === 0;
  }

  private pilotIdentity(pilot: PilotPresentation, showHelmet: boolean): HTMLElement {
    const identity = document.createElement('div'); identity.className = 'sky-duel-result-pilot';
    if (showHelmet && pilot.helmetVerified !== false)
      identity.append(createRankHelmet(rankHelmetForLevel(pilot.level), 'medium'));
    const copy = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = pilot.name;
    copy.append(name);
    if (!pilot.isAi) {
      const level = document.createElement('span'); level.textContent = `Level ${pilot.level}`;
      copy.append(level);
    }
    identity.append(copy);
    return identity;
  }

  private renderSearching(): void {
    this.clearPresentationTimers();
    this.stopHelmetRotation();
    this.panel.hidden = false;
    this.hud.hidden = true;
    this.headerElement.hidden = false;
    this.setSummaryLayout(false);
    this.root.classList.add('is-presentation');
    this.root.classList.add('is-searching');
    this.heading.textContent = 'SKY DUEL';
    this.copy.classList.remove('is-result');
    this.rematchButton.hidden = true;
    if (!this.copy.querySelector('.sky-duel-search-dots')) {
      const dots = document.createElement('span');
      dots.className = 'sky-duel-search-dots';
      dots.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.textContent = '.';
        dots.append(dot);
      }
      this.copy.replaceChildren('Finding opponent', dots);
    }
    this.renderPilot(this.localCard, this.localPilotId ? this.localPilot : undefined, 'YOU', this.paidEnabled);
    this.renderPilot(this.opponentCard, undefined, 'SEARCHING…', false);
    this.pot.hidden = true;
    this.countdown.hidden = true;
    this.practiceBadge.hidden = true;
    this.matchup.hidden = false;
    this.actions.replaceChildren();
    this.startHelmetRotation();
  }

  private startSearch(): void {
    if (document.hidden || this.abandonedSearch) return;
    if (!this.paidEnabled || this.balance < competitiveModes.skyDuel.entryCredits ||
      this.balance + competitiveModes.skyDuel.entryCredits > 1_000_000) { this.showEntry(); return; }
    if (!this.send('skyDuelQueue')) { this.showEntry('Connection lost. Try again.'); return; }
    this.abandonedSearch = false;
    this.queuedAt = Date.now();
    this.fairWait = false;
    this.phase = 'searching';
    this.renderSearching();
  }

  private showEntry(error = ''): void {
    this.clearPresentationTimers();
    this.stopHelmetRotation();
    this.phase = 'entry';
    this.resultMatchId = '';
    this.rematchButton.hidden = true;
    this.copy.classList.remove('is-result');
    this.practiceMatch = false;
    this.paidReservationConfirmed = false;
    this.autoQueue = false;
    this.panel.hidden = false;
    this.hud.hidden = true;
    this.headerElement.hidden = false;
    this.setSummaryLayout(true);
    this.root.classList.add('is-presentation');
    this.root.classList.remove('is-searching');
    this.matchup.hidden = true;
    this.resultPilots.replaceChildren(this.pilotIdentity(this.localPilot, Boolean(this.localPilotId)));
    this.resultPilots.hidden = !this.localPilotId;
    this.heading.textContent = 'SKY DUEL';
    const reason = error || (!this.paidEnabled ? 'Paid matches are not available yet.'
      : this.balance < competitiveModes.skyDuel.entryCredits ? 'You need 500 Credits.'
        : this.balance + competitiveModes.skyDuel.entryCredits > 1_000_000 ? 'Wallet is too close to its limit.' : '');
    this.copy.textContent = this.paidEnabled
      ? `Battle a real pilot or AI PLAYER. First to 3 wins!\nEntry: 500 Credits · Prize: 1,000 Credits · Up to 4 minutes\nYour Credits: ${this.balance.toLocaleString()}${reason ? `\n${reason}` : ''}`
      : `FREE PRACTICE · NO CREDITS OR REWARDS${reason ? `\n${reason}` : ''}`;
    const play = this.button('PLAY SKY DUEL', () => this.startSearch());
    play.disabled = Boolean(reason) || this.abandonedSearch;
    const practice = this.button(this.aiPracticeEnabled ? 'PLAY AI PRACTICE' : 'FREE PRACTICE', () => {
        this.phase = 'loading'; this.heading.textContent = 'AI PRACTICE';
        this.copy.textContent = 'Loading free practice. No Credits or rating at stake.';
        this.actions.replaceChildren(); this.send('skyDuelPractice');
      }, this.paidEnabled ? 'secondary' : 'primary');
    practice.disabled = this.abandonedSearch;
    this.actions.replaceChildren(play, practice,
      ...(this.balance < competitiveModes.skyDuel.entryCredits ? [this.button('EARN CREDITS IN MISSIONS', this.earnCredits, 'secondary')] : []),
      this.button('BACK TO MULTIPLAYER', this.back, 'secondary'));
  }

  private leaveBackgroundedSearch(): void {
    this.stopHelmetRotation();
    if (this.matchId && ['found', 'collecting', 'loading', 'countdown', 'launch'].includes(this.phase)) {
      this.send('skyDuelBackgrounded');
      this.setWaitingNote(this.localCard, 'WAITING FOR YOU');
      this.countdown.hidden = true;
      return;
    }
    if (this.phase !== 'searching' && !(this.phase === 'connecting' && this.autoQueue)) return;
    this.abandonedSearch = true;
    this.autoQueue = false;
    window.clearTimeout(this.queueTimer);
    if (this.queuedAt || this.matchId) this.send('skyDuelCancel');
    this.queuedAt = 0;
    this.matchId = '';
    this.pendingState = undefined;
    if (this.localPilotId) this.showEntry();
  }

  private renderCountdown(): void {
    if (this.phase !== 'countdown' || !this.countdownEndsAt || this.opponentDisconnected) return;
    const remaining = this.countdownEndsAt - Date.now();
    const number = remaining <= 0 ? 'GO!' : String(Math.min(5, Math.ceil(remaining / 1_000)));
    if (this.countdownNumber.textContent !== number) {
      this.countdownNumber.textContent = number;
      if (!reducedMotion()) this.countdownNumber.animate([
        { transform: 'scale(.93)', opacity: .7 }, { transform: 'scale(1)', opacity: 1 },
      ], { duration: 420, easing: 'ease-out' });
    }
    this.countdown.style.setProperty('--countdown-progress', `${Math.max(0, Math.min(100, (1 - remaining / 5_000) * 100))}%`);
  }

  private onBack(): void {
    if (this.matchId && this.phase !== 'result' && this.phase !== 'practice') return;
    if (this.phase === 'result' && this.resultMatchId) this.send('skyDuelRematchLeave', this.resultMatchId);
    this.autoQueue = false;
    window.clearTimeout(this.queueTimer);
    if (this.queuedAt) this.send('skyDuelCancel');
    this.queuedAt = 0;
    this.back();
  }

  private startHelmetRotation(): void {
    if (this.rotationTimer !== undefined || document.hidden || this.matchId) return;
    const slot = this.opponentCard.querySelector<HTMLElement>('.sky-duel-helmet-slot')!;
    const next = (): void => {
      const offset = 1 + Math.floor(Math.random() * (rankHelmets.length - 1));
      const index = this.rotationIndex < 0 ? Math.floor(Math.random() * rankHelmets.length)
        : (this.rotationIndex + offset) % rankHelmets.length;
      this.rotationIndex = index;
      const replaceHelmet = (): void => {
        const helmet = createRankHelmet(rankHelmets[index], 'large');
        const current = slot.querySelector('.rank-helmet');
        if (current) current.replaceWith(helmet);
        else slot.prepend(helmet);
      };
      if (reducedMotion() || !slot.querySelector('.rank-helmet')) {
        replaceHelmet();
        return;
      }
      this.flipAnimation?.cancel();
      window.clearTimeout(this.flipTimer);
      this.flipAnimation = slot.animate([
        { transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' },
      ], { duration: 320, easing: 'ease-in-out' });
      this.flipTimer = window.setTimeout(replaceHelmet, 160);
    };
    next();
    this.rotationTimer = window.setInterval(next, 700);
  }

  private stopHelmetRotation(): void {
    window.clearInterval(this.rotationTimer);
    window.clearTimeout(this.flipTimer);
    this.rotationTimer = undefined;
    this.flipTimer = undefined;
    this.flipAnimation?.cancel();
    this.flipAnimation = undefined;
  }

  private beginResultPayout(): void {
    if (this.phase !== 'result' || !this.resultPayoutPending) return;
    const source = this.pot.getBoundingClientRect();
    this.pot.textContent = '';
    const duration = this.header.animateCreditsEarned(source, this.balance - prizeCredits, this.balance);
    if (duration) this.coinTimer = window.setTimeout(() => this.finishResultPayout(), duration);
    else this.finishResultPayout();
  }

  private finishResultPayout(): void {
    if (this.phase !== 'result') return;
    this.pot.textContent = '';
    this.resultPayoutPending = false;
    this.header.updateIdentity(this.localPilot.name, this.balance, this.skyTokens, this.localPilot.level);
    if (this.rematchState) this.showRematchState(this.rematchState);
  }

  private beginCollection(): void {
    if (this.phase !== 'found') return;
    this.opponentCard.classList.remove('is-revealing');
    if (!this.paidReservationConfirmed) { this.finishCollection(); return; }
    this.phase = 'collecting';
    this.pot.hidden = false;
    this.pot.textContent = '';
    if (!reducedMotion()) this.animateCoins();
    for (const card of [this.localCard, this.opponentCard])
      card.querySelector<HTMLElement>('.sky-duel-stake')!.classList.add('is-collected');
    this.coinTimer = window.setTimeout(() => this.finishCollection(), reducedMotion() ? 0 : creditCollectionDurationMs + creditCollectionStaggerMs * 2 + 50);
  }

  private animateCoins(): void {
    const destination = this.pot.getBoundingClientRect();
    const endX = destination.left + destination.width / 2;
    const endY = destination.top + destination.height / 2;
    for (const card of [this.localCard, this.opponentCard]) {
      const source = card.querySelector<HTMLElement>('.sky-duel-stake')!.getBoundingClientRect();
      const startX = source.left + source.width / 2;
      const startY = source.top + source.height / 2;
      for (let index = 0; index < 3; index += 1) {
        const coin = document.createElement('img');
        coin.className = 'sky-duel-flying-credit';
        coin.src = '/media/hub/credits.avif'; coin.alt = '';
        coin.style.left = `${startX}px`; coin.style.top = `${startY}px`;
        this.panel.append(coin);
        this.coinElements.push(coin);
        const timing = { duration: creditCollectionDurationMs, delay: index * creditCollectionStaggerMs, fill: 'forwards' as const };
        this.coinAnimations.push(coin.animate([
          { transform: 'translate(-50%, -50%) scale(1)' },
          { transform: `translate(calc(-50% + ${endX - startX}px), calc(-50% + ${endY - startY}px)) scale(.72)` },
        ], { ...timing, easing: 'cubic-bezier(.3, 0, .2, 1)' }));
        this.coinAnimations.push(coin.animate([
          { opacity: 0, offset: 0 }, { opacity: 1, offset: .08 },
          { opacity: 1, offset: .88 }, { opacity: 0, offset: 1 },
        ], timing));
      }
    }
  }

  private finishCollection(): void {
    if (this.phase === 'countdown' || this.phase === 'active' || this.phase === 'result') return;
    this.clearCoins();
    this.phase = 'loading';
    if (this.paidReservationConfirmed) {
      this.localCard.querySelector<HTMLElement>('.sky-duel-stake')!.classList.add('is-collected');
      this.opponentCard.querySelector<HTMLElement>('.sky-duel-stake')!.classList.add('is-collected');
      this.pot.textContent = `${prizeCredits.toLocaleString()} Credits`;
      this.pot.classList.add('is-filled');
    }
    if (this.matchId && this.presentationAckMatchId !== this.matchId && this.send('skyDuelPresentationReady'))
      this.presentationAckMatchId = this.matchId;
  }

  private enterCountdown(endsAt: number, serverPhase?: string): void {
    this.clearPresentationTimers();
    if (serverPhase === 'active' || serverPhase === 'overtime') {
      this.phase = serverPhase;
      this.panel.hidden = true;
      this.headerElement.hidden = true;
      this.hud.hidden = false;
      this.root.classList.remove('is-presentation');
      return;
    }
    if (!Number.isFinite(endsAt) || endsAt <= 0) { this.phase = 'loading'; this.finishCollection(); return; }
    this.countdownEndsAt = endsAt;
    this.phase = 'countdown';
    this.copy.textContent = '';
    if (this.paidReservationConfirmed) {
      this.pot.hidden = false;
      this.pot.textContent = `${prizeCredits.toLocaleString()} Credits`;
      this.pot.classList.add('is-filled');
      this.localCard.querySelector<HTMLElement>('.sky-duel-stake')!.classList.add('is-collected');
      this.opponentCard.querySelector<HTMLElement>('.sky-duel-stake')!.classList.add('is-collected');
    }
    this.countdown.hidden = this.opponentDisconnected;
    this.renderCountdown();
  }

  private enterLaunch(message: DuelMessage): void {
    if (!Number.isFinite(message.launchStartedAt) || !Number.isFinite(message.launchCountdownAt) ||
      !Number.isFinite(message.launchEndsAt) || !message.launchStartedAt || !message.launchCountdownAt ||
      !message.launchEndsAt) return;
    this.phase = 'launch';
    this.launchStartedAt = message.launchStartedAt;
    this.launchCountdownAt = message.launchCountdownAt;
    this.launchEndsAt = message.launchEndsAt;
    this.panel.hidden = !this.opponentDisconnected;
    this.headerElement.hidden = !this.opponentDisconnected;
    this.hud.hidden = true;
    this.root.classList.add('is-presentation');
    this.countdown.hidden = true;
    this.copy.textContent = this.opponentDisconnected ? 'Waiting for pilot' : '';
  }

  private clearCoins(): void {
    this.coinAnimations.splice(0).forEach(animation => animation.cancel());
    this.coinElements.splice(0).forEach(coin => coin.remove());
  }

  private clearPresentationTimers(): void {
    window.clearTimeout(this.stageTimer);
    window.clearTimeout(this.coinTimer);
    this.stageTimer = undefined;
    this.coinTimer = undefined;
    this.resultPayoutPending = false;
    this.clearCoins();
    this.opponentCard.classList.remove('is-revealing');
  }

  private errorText(reason?: string): string {
    if (reason === 'INSUFFICIENT_CREDITS') return 'You need 500 Credits.';
    if (reason === 'WALLET_CAP') return 'Wallet is too close to its limit.';
    if (reason === 'SIGN_IN_REQUIRED') return 'Sign in to play Sky Duel.';
    if (reason === 'ALREADY_ACTIVE') return 'You already have a search or match.';
    if (reason === 'PAID_MATCHES_UNAVAILABLE') return 'Paid matches are not available yet.';
    if (reason === 'RATE_LIMITED') return 'Too many searches. Try again in a minute.';
    return 'Sky Duel is unavailable. Try again.';
  }

  private button(label: string, action: () => void, kind: 'primary' | 'secondary' = 'primary'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `entry-button entry-button-${kind}`;
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  private tick(): void {
    if (this.phase === 'countdown') this.renderCountdown();
    else if (this.phase === 'active' || this.phase === 'overtime') {
      this.clock.textContent = this.endsAt > 0 ? formatTime(Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1_000))) : '—';
    }
  }

  dispose(): void {
    window.clearTimeout(this.queueTimer);
    window.clearInterval(this.tickId);
    this.stopHelmetRotation();
    this.clearPresentationTimers();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    this.header.dispose();
    this.root.remove();
  }
}
