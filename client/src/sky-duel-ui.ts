import { competitiveModes } from '../../shared/competitive-modes.mjs';
import { AppShellHeader } from './app-shell';
import { createRankHelmet, rankHelmetForLevel, rankHelmets } from './rank-helmets';

type DuelMessage = {
  type: string; elapsedMs?: number; fairWait?: boolean; reason?: string;
  matchId?: string; pilotA?: string; pilotB?: string; levelA?: number; levelB?: number;
  pilotAId?: string; pilotBId?: string; aircraftA?: string; aircraftB?: string;
  avatarA?: string; avatarB?: string;
  countdownEndsAt?: number; phase?: string; scoreA?: number; scoreB?: number; endsAt?: number; recovered?: boolean;
  outcome?: string; balanceA?: number; balanceB?: number; entry?: number; prize?: number;
  secondsLeft?: number; reconnectSeconds?: number; boundaryMeters?: number;
  protectedUntil?: number; practice?: boolean;
};

type PilotPresentation = { name: string; level: number; aircraft: string; avatar?: string; helmetVerified?: boolean };
const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const entryCredits = competitiveModes.skyDuel.entryCredits;
const prizeCredits = competitiveModes.skyDuel.prizeCredits;
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
  private readonly localCard: HTMLElement;
  private readonly opponentCard: HTMLElement;
  private readonly pot: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly countdownNumber: HTMLElement;
  private readonly practiceBadge: HTMLElement;
  private readonly resultPilots: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly score: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly notice: HTMLElement;
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
  private localPilotId = '';
  private pilotAId = '';
  private scoreA = 0;
  private scoreB = 0;
  private endsAt = 0;
  private countdownEndsAt = 0;
  private protectedUntil = 0;
  private boundaryNoticeUntil = 0;
  private phase = 'connecting';
  private autoQueue = true;
  private pendingBack = false;
  private opponentDisconnected = false;
  private rotationIndex = -1;
  private rotationTimer?: number;
  private flipTimer?: number;
  private flipAnimation?: Animation;
  private stageTimer?: number;
  private coinTimer?: number;
  private readonly coinAnimations: Animation[] = [];
  private readonly coinElements: HTMLElement[] = [];
  private readonly seenMatches = new Set<string>();
  private presentationAckMatchId = '';
  private pendingState?: DuelMessage;
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.stopHelmetRotation();
    else if (this.phase === 'searching' && this.localPilotId) this.startHelmetRotation();
  };
  private queueTimer?: number;
  private tickId: number;

  constructor(host: HTMLElement, private readonly send: (type: string) => boolean,
    private readonly back: () => void, private readonly earnCredits: () => void) {
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
    this.header.show({ active: undefined, hubActions: false, pageTitle: 'DALLAS',
      advertiseVisible: false, pilotName: '', credits: 0, skyTokens: 0, storeHasOffers: false,
      rewardsAvailable: false, readOnlyWallet: true });
    this.headerElement.querySelector<HTMLElement>('.app-shell-wallet')!.hidden = true;
    this.panel = document.createElement('div');
    this.panel.className = 'sky-duel-panel';
    this.heading = document.createElement('h2');
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
    center.className = 'sky-duel-matchup-center';
    const vs = document.createElement('strong'); vs.className = 'sky-duel-versus'; vs.textContent = 'VS';
    this.pot = document.createElement('div'); this.pot.className = 'sky-duel-pot'; this.pot.hidden = true;
    this.countdown = document.createElement('div'); this.countdown.className = 'sky-duel-countdown'; this.countdown.hidden = true;
    this.countdownNumber = document.createElement('strong'); this.countdownNumber.className = 'sky-duel-countdown-number';
    this.countdown.append(this.countdownNumber);
    this.practiceBadge = document.createElement('div'); this.practiceBadge.className = 'sky-duel-practice'; this.practiceBadge.textContent = 'FREE PRACTICE'; this.practiceBadge.hidden = true;
    center.append(vs, this.pot, this.practiceBadge, this.countdown);
    this.matchup.append(this.localCard, center, this.opponentCard);
    this.panel.append(this.heading, this.copy, this.matchup, this.actions, this.summaryCard);
    this.hud = document.createElement('div');
    this.hud.className = 'sky-duel-hud';
    this.score = document.createElement('strong');
    this.clock = document.createElement('span');
    this.notice = document.createElement('span');
    const forfeit = this.button('FORFEIT', () => {
      if (window.confirm(this.practiceMatch ? 'Leave AI practice? No Credits are at stake.' : this.phase === 'countdown'
        ? 'Leave before the match starts? Your entry will be refunded.'
        : 'Surrender this Sky Duel? You will lose the 500-Credit entry.'))
        this.send('skyDuelSurrender');
    }, 'secondary');
    forfeit.classList.add('sky-duel-forfeit');
    this.hud.append(this.score, this.clock, this.notice, forfeit);
    this.root.append(this.headerElement, this.hud, this.panel);
    host.append(this.root);
    for (const helmet of rankHelmets) { const image = new Image(); image.src = helmet.src; }
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.tickId = window.setInterval(() => this.tick(), 250);
    this.renderConnecting();
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
    if (this.matchId || this.phase === 'active' || this.phase === 'overtime') return;
    if (!paidEnabled) { this.autoQueue = false; this.showEntry(); return; }
    if (this.phase === 'searching') { this.renderSearching(); return; }
    if (this.phase === 'unavailable') { this.showEntry(); return; }
    if (this.autoQueue && this.phase === 'connecting') {
      window.clearTimeout(this.queueTimer);
      this.queueTimer = window.setTimeout(() => {
        if (this.autoQueue && !this.matchId && this.phase === 'connecting') this.startSearch();
      }, 300);
    }
  }

  setBalance(credits: number): void {
    this.balance = credits;
    this.header.updateIdentity(this.localPilot.name, credits, this.skyTokens, this.localPilot.level);
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

  handle(message: DuelMessage): void {
    if (message.type === 'skyDuelWaiting') {
      if (this.matchId || this.phase === 'active' || this.phase === 'result') return;
      if (!this.queuedAt) this.queuedAt = Date.now() - (message.elapsedMs ?? 0);
      this.fairWait = message.fairWait === true;
      this.phase = 'searching';
      if (this.localPilotId) this.renderSearching();
      else this.renderConnecting();
    } else if (message.type === 'skyDuelCancelled') {
      if (this.matchId) return;
      this.queuedAt = 0;
      this.showEntry();
    } else if (message.type === 'skyDuelError') {
      if (this.matchId) return;
      this.queuedAt = 0;
      this.showEntry(this.errorText(message.reason));
    } else if (message.type === 'skyDuelLoading' || message.type === 'skyDuelFound') {
      if (!message.matchId || this.matchId && this.matchId !== message.matchId || this.phase === 'result') return;
      if (message.type === 'skyDuelLoading' && this.seenMatches.has(message.matchId) && !message.recovered) return;
      if (message.type === 'skyDuelFound' && (this.phase === 'countdown' || this.phase === 'active' || this.phase === 'overtime')) return;
      this.queuedAt = 0;
      this.autoQueue = false;
      this.matchId = message.matchId;
      if (message.recovered && message.type === 'skyDuelLoading') this.presentationAckMatchId = '';
      this.practiceMatch = message.practice === true;
      this.paidReservationConfirmed = !this.practiceMatch && message.entry === entryCredits && message.prize === prizeCredits;
      this.pilotAId = message.pilotAId ?? '';
      this.protectedUntil = message.protectedUntil ?? this.protectedUntil;
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
      const opponent = localIsA
        ? { name: message.pilotB ?? '', level: message.levelB ?? 1, aircraft: message.aircraftB ?? 'trainer', avatar: message.avatarB, helmetVerified: Boolean(message.pilotB) && Number.isFinite(message.levelB) }
        : { name: message.pilotA ?? '', level: message.levelA ?? 1, aircraft: message.aircraftA ?? 'trainer', avatar: message.avatarA, helmetVerified: Boolean(message.pilotA) && Number.isFinite(message.levelA) };
      this.localPilot = local;
      this.opponentPilot = opponent;
      this.renderPilot(this.localCard, local, 'YOU', this.paidReservationConfirmed);
      this.renderPilot(this.opponentCard, opponent, 'OPPONENT', this.paidReservationConfirmed);
      this.matchup.hidden = false;
      this.practiceBadge.hidden = !this.practiceMatch;
      this.pot.hidden = !this.paidReservationConfirmed;
      this.pot.textContent = '';
      this.countdown.hidden = true;
      this.actions.replaceChildren();
      if (message.type === 'skyDuelFound') {
        this.enterCountdown(message.countdownEndsAt ?? 0, message.phase);
      } else {
        this.seenMatches.add(message.matchId);
        this.phase = 'found';
        this.copy.textContent = 'Opponent found!';
        this.opponentCard.classList.add('is-revealing');
        if (message.recovered) this.finishCollection();
        else this.stageTimer = window.setTimeout(() => this.beginCollection(), 400);
      }
      if (this.pendingState?.matchId === message.matchId) {
        const state = this.pendingState;
        this.pendingState = undefined;
        this.handle(state);
      }
    } else if (message.type === 'skyDuelSpawn') {
      this.protectedUntil = message.protectedUntil ?? 0;
    } else if (message.type === 'skyDuelState') {
      if (!this.matchId && message.matchId) { this.pendingState = message; return; }
      if (message.matchId && this.matchId && message.matchId !== this.matchId || this.phase === 'result') return;
      const phaseChanged = this.phase !== message.phase;
      this.phase = message.phase ?? this.phase;
      this.scoreA = message.scoreA ?? this.scoreA;
      this.scoreB = message.scoreB ?? this.scoreB;
      this.endsAt = message.endsAt ?? this.endsAt;
      this.panel.hidden = this.phase !== 'countdown';
      this.root.classList.toggle('is-presentation', this.phase === 'countdown');
      this.root.classList.remove('is-searching');
      this.hud.hidden = this.phase === 'countdown';
      this.headerElement.hidden = this.phase !== 'countdown';
      const localIsA = this.localPilotId === this.pilotAId;
      this.score.textContent = `YOU ${localIsA ? this.scoreA : this.scoreB}/3 · ${this.practiceMatch ? 'AI PILOT' : 'OPPONENT'} ${localIsA ? this.scoreB : this.scoreA}/3`;
      if (phaseChanged || !this.notice.textContent) this.notice.textContent = this.defaultNotice();
      if (this.phase === 'countdown') this.enterCountdown(message.countdownEndsAt ?? this.countdownEndsAt);
      else this.clearPresentationTimers();
    } else if (message.type === 'skyDuelBoundary') {
      this.boundaryNoticeUntil = message.secondsLeft || message.boundaryMeters !== undefined ? Date.now() + 1_500 : 0;
      this.notice.textContent = message.secondsLeft ? `RETURN TO BATTLE AREA · ${message.secondsLeft} SEC`
        : message.boundaryMeters !== undefined ? `BATTLE EDGE · ${message.boundaryMeters} M`
          : this.defaultNotice();
    } else if (message.type === 'skyDuelOpponentDisconnected') {
      this.boundaryNoticeUntil = 0;
      this.notice.textContent = `OPPONENT RECONNECTING · ${message.reconnectSeconds ?? 15} SEC`;
      this.opponentDisconnected = true;
      if (this.phase === 'countdown') this.countdown.hidden = true;
      if (this.phase === 'found' || this.phase === 'collecting' || this.phase === 'loading') this.clearPresentationTimers();
      if (this.phase === 'countdown' || this.phase === 'found' || this.phase === 'collecting' || this.phase === 'loading')
        this.copy.textContent = 'Opponent reconnecting…';
    } else if (message.type === 'skyDuelOpponentReconnected') {
      this.opponentDisconnected = false;
      this.notice.textContent = this.defaultNotice();
      if (this.phase === 'countdown') { this.copy.textContent = 'Match starting…'; this.countdown.hidden = false; this.renderCountdown(); }
      else if (this.phase === 'found' || this.phase === 'collecting' || this.phase === 'loading') this.finishCollection();
    } else if (message.type === 'skyDuelResult') {
      if (this.matchId && message.matchId && message.matchId !== this.matchId || this.phase === 'result') return;
      this.clearPresentationTimers();
      this.stopHelmetRotation();
      this.matchId = '';
      this.phase = 'result';
      this.protectedUntil = 0;
      this.boundaryNoticeUntil = 0;
      this.queuedAt = 0;
      this.hud.hidden = true;
      this.panel.hidden = false;
      this.setSummaryLayout(true);
      this.root.classList.add('is-presentation');
      this.root.classList.remove('is-searching');
      this.headerElement.hidden = false;
      this.matchup.hidden = true;
      this.practiceMatch = message.practice === true;
      this.renderResultPilots();
      const isA = this.localPilotId === message.pilotA;
      this.balance = (isA ? message.balanceA : message.balanceB) ?? this.balance;
      this.header.updateIdentity(this.localPilot.name, this.balance, this.skyTokens, this.localPilot.level);
      if (this.pendingBack) { this.pendingBack = false; this.back(); return; }
      const won = isA ? message.outcome === 'WIN_A' : message.outcome === 'WIN_B';
      this.heading.textContent = message.outcome === 'DRAW' ? 'DRAW' : message.outcome === 'CANCELLED' ? 'MATCH CANCELLED' : won ? 'VICTORY!' : 'DEFEAT';
      this.copy.textContent = this.practiceMatch ? `AI PRACTICE · NO REWARDS\nWallet: ${this.balance.toLocaleString()} Credits`
        : message.outcome === 'DRAW' || message.outcome === 'CANCELLED'
        ? `${competitiveModes.skyDuel.entryCredits} Credits refunded.\nWallet: ${this.balance.toLocaleString()} Credits`
        : won ? `Prize: ${(message.prize ?? 0).toLocaleString()} Credits\nNet won: +500 Credits\nWallet: ${this.balance.toLocaleString()} Credits`
          : `Entry lost: ${competitiveModes.skyDuel.entryCredits} Credits\nWallet: ${this.balance.toLocaleString()} Credits`;
      this.actions.replaceChildren(
        this.button('PLAY AGAIN', () => this.showEntry()),
        this.button('BACK TO MULTIPLAYER', this.back, 'secondary'),
      );
    } else if (message.type === 'skyDuelPractice') {
      this.clearPresentationTimers();
      this.stopHelmetRotation();
      this.matchId = '';
      this.phase = 'practice';
      this.queuedAt = 0;
      this.panel.hidden = true;
      this.root.classList.remove('is-presentation');
      this.headerElement.hidden = true;
      this.hud.hidden = false;
      this.score.textContent = 'FREE PRACTICE · NO REWARDS';
      this.clock.textContent = '';
      this.notice.textContent = '';
    }
  }

  private pilotCard(): HTMLElement {
    const card = document.createElement('article');
    card.className = 'sky-duel-pilot-card';
    const label = document.createElement('span'); label.className = 'sky-duel-side-label';
    const helmet = document.createElement('div'); helmet.className = 'sky-duel-helmet-slot';
    const name = document.createElement('strong'); name.className = 'sky-duel-pilot-name';
    const level = document.createElement('span'); level.className = 'sky-duel-level';
    const stake = document.createElement('div'); stake.className = 'sky-duel-stake';
    const coin = document.createElement('img'); coin.src = '/media/hub/credits.avif'; coin.alt = '';
    const amount = document.createElement('span'); amount.textContent = `${entryCredits} Credits`;
    stake.append(coin, amount);
    card.append(label, helmet, name, level, stake);
    return card;
  }

  private setSummaryLayout(summary: boolean): void {
    this.summaryCard.hidden = !summary;
    if (summary) this.summaryCard.append(this.heading, this.resultPilots, this.copy, this.actions);
    else {
      this.panel.prepend(this.heading, this.copy);
      this.panel.append(this.actions);
    }
  }

  private renderPilot(card: HTMLElement, pilot: PilotPresentation | undefined, label: string, showStake: boolean): void {
    card.querySelector<HTMLElement>('.sky-duel-side-label')!.textContent = label;
    const name = card.querySelector<HTMLElement>('.sky-duel-pilot-name')!;
    const level = card.querySelector<HTMLElement>('.sky-duel-level')!;
    const stake = card.querySelector<HTMLElement>('.sky-duel-stake')!;
    const helmet = card.querySelector<HTMLElement>('.sky-duel-helmet-slot')!;
    name.textContent = pilot?.name ?? '';
    level.textContent = pilot?.helmetVerified !== false && pilot ? `Level ${pilot.level}` : '';
    helmet.replaceChildren();
    if (pilot?.helmetVerified !== false && pilot) helmet.append(createRankHelmet(rankHelmetForLevel(pilot.level), 'large'));
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
    const level = document.createElement('span'); level.textContent = `Level ${pilot.level}`;
    copy.append(name, level);
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
    this.copy.textContent = 'Finding opponent…';
    this.renderPilot(this.localCard, this.localPilotId ? this.localPilot : undefined, 'YOU', this.paidEnabled);
    this.renderPilot(this.opponentCard, undefined, 'SEARCHING…', false);
    this.pot.hidden = true;
    this.countdown.hidden = true;
    this.practiceBadge.hidden = true;
    this.matchup.hidden = false;
    this.actions.replaceChildren(this.button('CANCEL', () => this.onBack(), 'secondary'));
    this.startHelmetRotation();
  }

  private renderConnecting(): void {
    this.panel.hidden = false;
    this.hud.hidden = true;
    this.headerElement.hidden = false;
    this.setSummaryLayout(true);
    this.root.classList.add('is-presentation');
    this.root.classList.remove('is-searching');
    this.heading.textContent = 'SKY DUEL';
    this.copy.textContent = 'Connecting…';
    this.matchup.hidden = true;
    this.resultPilots.hidden = true;
    this.actions.replaceChildren(this.button('BACK TO MULTIPLAYER', () => this.onBack(), 'secondary'));
  }

  private startSearch(): void {
    if (!this.paidEnabled || this.balance < competitiveModes.skyDuel.entryCredits ||
      this.balance + competitiveModes.skyDuel.entryCredits > 1_000_000) { this.showEntry(); return; }
    if (!this.send('skyDuelQueue')) { this.showEntry('Connection lost. Try again.'); return; }
    this.queuedAt = Date.now();
    this.fairWait = false;
    this.phase = 'searching';
    this.renderSearching();
  }

  private showEntry(error = ''): void {
    this.clearPresentationTimers();
    this.stopHelmetRotation();
    this.phase = 'entry';
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
    this.notice.textContent = '';
    this.heading.textContent = 'SKY DUEL';
    const reason = error || (!this.paidEnabled ? 'Paid matches are not available yet.'
      : this.balance < competitiveModes.skyDuel.entryCredits ? 'You need 500 Credits.'
        : this.balance + competitiveModes.skyDuel.entryCredits > 1_000_000 ? 'Wallet is too close to its limit.' : '');
    this.copy.textContent = this.paidEnabled
      ? `Battle one real pilot. First to 3 wins!\nEntry: 500 Credits · Prize: 1,000 Credits · Up to 4 minutes\nYour Credits: ${this.balance.toLocaleString()}${reason ? `\n${reason}` : ''}`
      : `FREE PRACTICE · NO CREDITS OR REWARDS${reason ? `\n${reason}` : ''}`;
    const play = this.button('PLAY SKY DUEL', () => this.startSearch());
    play.disabled = Boolean(reason);
    this.actions.replaceChildren(play,
      this.button(this.aiPracticeEnabled ? 'PLAY AI PRACTICE' : 'FREE PRACTICE', () => {
        this.phase = 'loading'; this.heading.textContent = 'AI PRACTICE';
        this.copy.textContent = 'Loading free practice. No Credits or rating at stake.';
        this.actions.replaceChildren(); this.send('skyDuelPractice');
      }, this.paidEnabled ? 'secondary' : 'primary'),
      ...(this.balance < competitiveModes.skyDuel.entryCredits ? [this.button('EARN CREDITS IN MISSIONS', this.earnCredits, 'secondary')] : []),
      this.button('BACK TO MULTIPLAYER', this.back, 'secondary'));
  }

  private renderCountdown(): void {
    if (this.phase !== 'countdown' || !this.countdownEndsAt || this.opponentDisconnected) return;
    const remaining = this.countdownEndsAt - Date.now();
    const number = remaining <= 0 ? 'GO!' : String(Math.min(5, Math.ceil(remaining / 1_000)));
    if (this.countdownNumber.textContent !== number) {
      this.countdownNumber.textContent = number;
      if (!reducedMotion()) this.countdownNumber.animate([
        { transform: 'scale(.84)', opacity: .5 }, { transform: 'scale(1)', opacity: 1 },
      ], { duration: 260, easing: 'ease-out' });
    }
    this.countdown.style.setProperty('--countdown-progress', `${Math.max(0, Math.min(100, (1 - (Math.max(0, remaining) % 1_000) / 1_000) * 100))}%`);
  }

  private onBack(): void {
    this.autoQueue = false;
    window.clearTimeout(this.queueTimer);
    if (this.matchId && this.phase !== 'result' && this.phase !== 'practice') {
      if (this.pendingBack) return;
      if (!this.send('skyDuelSurrender')) { this.copy.textContent = 'Connection lost. Reconnecting…'; return; }
      this.pendingBack = true;
      this.copy.textContent = 'Match cancelling…';
      return;
    }
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
      if (reducedMotion() || !slot.firstElementChild) {
        slot.replaceChildren(createRankHelmet(rankHelmets[index], 'large'));
        return;
      }
      this.flipAnimation?.cancel();
      window.clearTimeout(this.flipTimer);
      this.flipAnimation = slot.animate([
        { transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' },
      ], { duration: 320, easing: 'ease-in-out' });
      this.flipTimer = window.setTimeout(() => slot.replaceChildren(createRankHelmet(rankHelmets[index], 'large')), 160);
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

  private beginCollection(): void {
    if (this.phase !== 'found') return;
    this.opponentCard.classList.remove('is-revealing');
    if (!this.paidReservationConfirmed) { this.finishCollection(); return; }
    this.phase = 'collecting';
    this.copy.textContent = 'Collecting Credits…';
    this.pot.hidden = false;
    this.pot.textContent = '';
    if (!reducedMotion()) this.animateCoins();
    this.coinTimer = window.setTimeout(() => this.finishCollection(), reducedMotion() ? 0 : 800);
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
        this.coinAnimations.push(coin.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
          { transform: `translate(calc(-50% + ${endX - startX}px), calc(-50% + ${endY - startY}px)) scale(.7)`, opacity: 1, offset: .82 },
          { transform: `translate(calc(-50% + ${endX - startX}px), calc(-50% + ${endY - startY}px)) scale(.45)`, opacity: 0 },
        ], { duration: 680, delay: index * 60, easing: 'ease-in-out', fill: 'forwards' }));
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
    this.copy.textContent = 'Match starting…';
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
    this.copy.textContent = 'Match starting…';
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

  private clearCoins(): void {
    this.coinAnimations.splice(0).forEach(animation => animation.cancel());
    this.coinElements.splice(0).forEach(coin => coin.remove());
  }

  private clearPresentationTimers(): void {
    window.clearTimeout(this.stageTimer);
    window.clearTimeout(this.coinTimer);
    this.stageTimer = undefined;
    this.coinTimer = undefined;
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

  private defaultNotice(): string {
    return this.phase === 'overtime' ? 'SUDDEN DEATH · BATTLE AREA 12 KM' : 'BATTLE AREA · 12 KM';
  }

  private tick(): void {
    if (this.phase === 'countdown') this.renderCountdown();
    else if (this.phase === 'active' || this.phase === 'overtime') {
      this.clock.textContent = `${this.phase === 'overtime' ? 'OVERTIME ' : ''}${formatTime(Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1_000)))}`;
      if (this.boundaryNoticeUntil && Date.now() >= this.boundaryNoticeUntil) {
        this.boundaryNoticeUntil = 0;
        this.notice.textContent = this.defaultNotice();
      }
      if (this.protectedUntil > Date.now() && (!this.notice.textContent || this.notice.textContent.startsWith('SPAWN SHIELD')))
        this.notice.textContent = `SPAWN SHIELD · ${Math.ceil((this.protectedUntil - Date.now()) / 1_000)} SEC`;
      else if (this.notice.textContent.startsWith('SPAWN SHIELD'))
        this.notice.textContent = this.defaultNotice();
    }
  }

  dispose(): void {
    window.clearTimeout(this.queueTimer);
    window.clearInterval(this.tickId);
    this.stopHelmetRotation();
    this.clearPresentationTimers();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.header.dispose();
    this.root.remove();
  }
}
