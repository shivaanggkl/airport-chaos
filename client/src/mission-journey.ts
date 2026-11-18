import { observeMissionCopyFit } from './fit-mission-copy';
import './mission-journey.css';
import './context-page-shell.css';
import { hapticsManager } from './haptics-manager';
import { createLockIcon } from './lock-icon';
import { journeyDisplayGroups, journeySpecialPursuits, type JourneyCategory } from '../../shared/journey-categories.mjs';
import { missionJourneyStages, missionJourneyStatuses, journeyMainCompleted } from './mission-journey-model';
import { missionJourneyDetails } from './mission-journey-content';
export { missionJourneyStages } from './mission-journey-model';
export type { MissionJourneyStage } from './mission-journey-model';
type Progress = Readonly<Record<string, {
  eligible?: boolean;
  completed?: boolean;
  coinsCollected?: number;
}>>;
function categoryIcon(icon: string): string {
  const art: Record<string, string> = {
    ring: '<ellipse cx="32" cy="32" rx="18" ry="27" transform="rotate(40 32 32)" fill="none" stroke="#ffda47" stroke-width="8"/><ellipse cx="32" cy="32" rx="18" ry="27" transform="rotate(40 32 32)" fill="none" stroke="#fff7a3" stroke-width="2"/>',
    cargo: '<path d="m6 18 25-10 27 11v31L32 60 6 49Z" fill="#e5a214" stroke="#fff5a1" stroke-width="2"/><path d="m6 18 26 11 26-10M32 29v31M19 13l26 11v13" fill="none" stroke="#74dbff" stroke-width="6"/>',
    target: '<circle cx="32" cy="32" r="27" fill="#fff" stroke="#e22b33" stroke-width="5"/><circle cx="32" cy="32" r="16" fill="none" stroke="#e22b33" stroke-width="6"/><circle cx="32" cy="32" r="5" fill="#e22b33"/><path d="M0 32h64M32 0v64" stroke="#103451" stroke-width="2"/>',
    plane: '<path d="m29 5 8 0 0 20 24 15-2 8-22-8v13l9 6H18l10-6V40L6 48l-2-8 25-15Z" fill="#dcefff" stroke="#3a9ec8" stroke-width="2" transform="rotate(38 32 32)"/>',
    giant: '<path d="M28 3h8l5 23 22 12v7l-23-5-2 12 11 8H15l11-8-2-12L1 45v-7l22-12Z" fill="#f4e6ff" stroke="#9a6cbd" stroke-width="2" transform="rotate(72 32 32)"/>',
    territory: '<path d="m3 43 18-9 23 4 17-7v24l-17 7-23-5-18 6Z" fill="#71cc6c" stroke="#fff5ad" stroke-width="2"/><path d="m21 34 0 23M44 38v24" stroke="#e8f7c5" stroke-width="2"/><path d="M32 2c-12 0-19 8-19 18 0 14 19 29 19 29s19-15 19-29C51 10 44 2 32 2Z" fill="#f36143"/><circle cx="32" cy="20" r="7" fill="#274b57"/>',
    gift: '<path d="M7 25h50v35H7Z" fill="#f2232b" stroke="#ffe66c" stroke-width="3"/><path d="M2 17h60v13H2Z" fill="#ffd431"/><path d="M28 17h9v43h-9Z" fill="#ffdd43"/><path d="M32 18C3 17 13-9 32 13 51-9 61 17 32 18Z" fill="none" stroke="#ffdf3a" stroke-width="6"/>',
    boss: '<path d="M8 64v-9c0-15 48-15 48 0v9" fill="#dfeaff"/><path d="M17 23c-4-23 38-23 32 0l-4 25-13 8-13-8Z" fill="#e8b09c"/><path d="m16 20 7-15 12 4 12-4 4 15" fill="#d7e2f6" stroke="#fff" stroke-width="2"/><path d="M16 24h15v12H16ZM35 24h15v12H35ZM31 28h4M25 44h16" fill="#20324e" stroke="#111d36" stroke-width="3"/>',
  };
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${art[icon] ?? art.plane}</svg>`;
}
const bonusRibbonMarkup = '<span class="mission-journey-bonus" aria-hidden="true"><svg viewBox="0 0 140 48"><path d="M15 16 3 20 12 31 7 43 32 36H108L133 43 128 31 137 20 125 16Z" fill="#8c3bac" stroke="#ffdc78" stroke-width="2"/><path d="M14 9Q70-5 126 9L120 37Q70 24 20 37Z" fill="#68128c" stroke="#ffe58b" stroke-width="2"/><text x="70" y="27" text-anchor="middle" fill="#fff2a1">BONUS</text></svg></span>';
export class MissionJourney {
  private readonly detail: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly stageButtons = new Map<number, HTMLButtonElement>();
  private readonly groups = new Map<string, HTMLElement>();
  private readonly extrasLink: HTMLButtonElement;
  private readonly back: HTMLButtonElement;
  private progress: Progress = {};
  private selectedStage = 1;
  private currentMission = 1;
  private signInRequired = false;
  private cityLocked = false;
  private userSelected = false;
  private specialOpen = false;
  private mainSelection = 1;
  private mainScroll = 0;
  private drag: {
    id: number;
    x: number;
    scroll: number;
    moved: boolean;
  } | null = null;
  private suppressTap = false;
  private celebrationTimer = 0;
  constructor(private readonly element: HTMLElement, onPlayMission: () => void, _onPanelOpen: () => void, _onPanelClose: () => void) {
    element.classList.add('mission-journey');
    element.setAttribute('aria-label', 'Dallas Mission Journey');
    element.innerHTML = `<div class="mission-journey-heading"><button type="button" data-journey-back class="mission-journey-special-back" hidden>‹ BACK TO JOURNEY</button><div class="mission-journey-summary"><strong>DALLAS JOURNEY</strong><span data-journey-progress>0 OF 36 COMPLETED</span></div></div><div class="mission-journey-viewport" tabindex="0" aria-label="Dallas mission categories, swipe or use arrow keys"><div class="mission-journey-track"></div></div>      <div class="mission-journey-detail" aria-label="Selected mission details" aria-live="polite">
    <div class="mission-journey-detail-copy"><span class="mission-journey-detail-heading"><span data-mission-index>MISSION 01</span><span data-mission-bonus hidden>${bonusRibbonMarkup}</span></span><strong data-mission-title></strong><p data-mission-objective></p></div>
    <div class="mission-journey-detail-facts">
     <div class="mission-journey-reward" data-mission-reward><img src="/media/hub/credits.avif" alt="" aria-hidden="true"><span data-mission-reward-label>REWARD</span><strong data-mission-reward-amount></strong></div>
     <div class="mission-journey-time" data-mission-time><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg><span>TIME LIMIT</span><strong data-mission-time-value></strong></div>
    </div>
    <button type="button" class="context-action context-action--gold mission-journey-play" data-mission-play disabled>PLAY MISSION ▶</button>
   </div>`;
    this.detail = element.querySelector('.mission-journey-detail')!;
    this.viewport = element.querySelector('.mission-journey-viewport')!;
    this.back = element.querySelector('[data-journey-back]')!;
    this.back.addEventListener('click', () => this.showSpecial(false));
    observeMissionCopyFit(this.detail.querySelector<HTMLElement>('.mission-journey-detail-copy')!, '[data-mission-title]', '[data-mission-objective]');
    const track = element.querySelector<HTMLElement>('.mission-journey-track')!;
    for (const group of [...journeyDisplayGroups, journeySpecialPursuits])
      this.renderGroup(track, group);
    this.extrasLink = element.querySelector('[data-extra-pursuits]')!;
    this.extrasLink.addEventListener('click', () => this.showSpecial(true));
    this.viewport.addEventListener('wheel', event => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return;
      const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? this.viewport.clientWidth : 1;
      const before = this.viewport.scrollLeft;
      this.viewport.scrollLeft += event.deltaY * multiplier;
      if (this.viewport.scrollLeft !== before)
        event.preventDefault();
    }, { passive: false });
    this.viewport.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0)
        return;
      this.drag = { id: event.pointerId, x: event.clientX, scroll: this.viewport.scrollLeft, moved: false };
    });
    this.viewport.addEventListener('pointermove', event => {
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId)
        return;
      if (Math.abs(event.clientX - drag.x) > 8)
        drag.moved = true;
      if (drag.moved) {
        this.viewport.setPointerCapture(event.pointerId);
        this.viewport.scrollLeft = drag.scroll - (event.clientX - drag.x);
        event.preventDefault();
      }
    });
    this.viewport.addEventListener('pointerup', () => { this.suppressTap = Boolean(this.drag?.moved); this.drag = null; window.setTimeout(() => { this.suppressTap = false; }, 0); });
    this.viewport.addEventListener('pointercancel', () => { this.drag = null; });
    this.viewport.addEventListener('click', event => { if (this.suppressTap) {
      event.preventDefault();
      event.stopPropagation();
    } }, true);
    this.viewport.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.specialOpen) {
        event.preventDefault();
        this.showSpecial(false);
        return;
      }
      if (event.target === this.viewport)
        this.handleNodeKeydown(event, this.selectedStage);
    });
    element.querySelector<HTMLButtonElement>('[data-mission-play]')!.addEventListener('click', () => {
      const stage = missionJourneyStages[this.selectedStage - 1];
      if (element.querySelector<HTMLButtonElement>('[data-mission-play]')!.disabled || stage?.implementation !== 'playable')
        return;
      hapticsManager.emit('confirmation');
      onPlayMission();
    });
    this.renderProgress();
  }
  private renderGroup(track: HTMLElement, group: JourneyCategory): void {
    const section = document.createElement('section');
    section.className = 'mission-journey-category';
    section.dataset.category = group.id;
    section.style.setProperty('--category-color', group.color);
    section.setAttribute('aria-label', group.label);
    const stages = missionJourneyStages.filter(stage => stage.categoryId === group.id);
    const row = document.createElement('div');
    row.className = 'mission-journey-category-nodes';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', group.label);
    if (stages.length > 1) {
      const route = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      route.setAttribute('viewBox', '0 0 266 66');
      route.setAttribute('preserveAspectRatio', 'none');
      route.setAttribute('aria-hidden', 'true');
      route.classList.add('mission-journey-category-route');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('points', stages.map((_, index) => `${18 + index * 230 / (stages.length - 1)},${48 - index * 15 / (stages.length - 1)}`).join(' '));
      route.append(line);
      row.append(route);
    }
    for (const [index, stage] of stages.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mission-journey-node is-locked';
      button.dataset.stage = String(stage.number);
      button.dataset.missionId = stage.id;
      button.style.left = `${(stages.length === 1 ? 133 : 18 + index * 230 / (stages.length - 1)) / 266 * 100}%`;
      button.style.top = `${(stages.length === 1 ? 38 : 48 - index * 15 / (stages.length - 1)) / 66 * 100}%`;
      button.innerHTML = `<span class="mission-journey-number">${stage.kind === 'bonus' ? categoryIcon('gift') : stage.categoryNumber}</span><span class="mission-journey-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4.5 12 5 5 10-10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
      if (stage.kind === 'bonus')
        button.classList.add('is-bonus');
      const lock = document.createElement('span');
      lock.className = 'mission-journey-lock';
      lock.setAttribute('aria-hidden', 'true');
      lock.append(createLockIcon());
      button.append(lock);
      button.addEventListener('click', () => this.select(stage.number, true));
      button.addEventListener('keydown', event => this.handleNodeKeydown(event, stage.number));
      row.append(button);
      this.stageButtons.set(stage.number, button);
    }
    const label = document.createElement('div');
    label.className = 'mission-journey-category-label';
    label.innerHTML = `<span class="mission-journey-category-icon">${categoryIcon(group.icon)}</span><strong>${group.label}</strong>${group.id === 'plane-battles' ? '<button type="button" class="mission-journey-extra" data-extra-pursuits hidden>2 EXTRA</button>' : ''}`;
    section.classList.toggle('is-bonus-group', stages[0]?.kind === 'bonus');
    section.classList.toggle('is-boss-group', stages[0]?.kind === 'boss');
    label.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('button')) return;
      const stage = stages.find(stage => this.progress[stage.id]?.eligible && !this.progress[stage.id]?.completed) ?? stages[0];
      if (stage) this.select(stage.number, true);
    });
    section.append(row, label);
    track.append(section);
    this.groups.set(group.id, section);
  }
  get isOpen(): boolean { return !this.element.hidden; }
  get isPanelOpen(): boolean { return false; }
  get selectedMissionNumber(): number { return this.selectedStage; }
  get selectedMissionId(): string | undefined { return missionJourneyStages[this.selectedStage - 1]?.id; }
  setSignInRequired(required: boolean): void { this.signInRequired = required; this.renderProgress(); }
  setCityLocked(locked: boolean): void { this.cityLocked = locked; this.renderProgress(); }
  setProgress(progress: Progress): void { this.progress = progress; this.renderProgress(); }
  private completedStages(): readonly boolean[] { return missionJourneyStages.map(stage => !this.cityLocked && this.progress[stage.id]?.completed === true); }
  private renderProgress(): void {
    const completed = this.completedStages();
    const state = missionJourneyStatuses(completed, missionJourneyStages.map(stage => !this.cityLocked && this.progress[stage.id]?.eligible === true), !this.cityLocked && this.signInRequired);
    this.currentMission = state.currentMission;
    if (!this.userSelected)
      this.selectedStage = this.currentMission || 1;
    const selected = missionJourneyStages[this.selectedStage - 1]!;
    for (const stage of missionJourneyStages) {
      const button = this.stageButtons.get(stage.number)!;
      const status = state.statuses[stage.number - 1]!;
      for (const name of ['locked', 'completed', 'current', 'available'] as const)
        button.classList.toggle(`is-${name}`, status === name);
      button.classList.toggle('is-placeholder', stage.implementation === 'placeholder');
      button.classList.toggle('is-selected', stage.number === this.selectedStage);
      button.setAttribute('aria-pressed', String(stage.number === this.selectedStage));
      const label = [...journeyDisplayGroups, journeySpecialPursuits].find(group => group.id === stage.categoryId)!.label;
      button.setAttribute('aria-label', `${label}, ${stage.kind === 'bonus' ? 'bonus' : `mission ${stage.categoryNumber}`}, ${stage.implementation === 'placeholder' ? 'Coming Soon' : status === 'completed' ? 'completed, select to replay' : status === 'locked' ? 'locked, view details' : status}`);
    }
    for (const [id, group] of this.groups) {
      group.hidden = this.specialOpen ? id !== 'special-pursuits' : id === 'special-pursuits';
      group.classList.toggle('is-selected', selected.categoryId === id);
    }
    this.extrasLink.hidden = selected.categoryId !== 'plane-battles';
    this.back.hidden = !this.specialOpen;
    this.element.querySelector<HTMLElement>('[data-journey-progress]')!.textContent = `${journeyMainCompleted(this.progress)} OF 36 COMPLETED`;
    this.renderDetails();
  }
  private showSpecial(open: boolean): void {
    if (open) {
      this.mainSelection = this.selectedStage;
      this.mainScroll = this.viewport.scrollLeft;
      this.specialOpen = true;
      this.userSelected = true;
      this.selectedStage = missionJourneyStages.find(stage => stage.kind === 'special')!.number;
    }
    else {
      this.specialOpen = false;
      this.selectedStage = this.mainSelection;
    }
    this.renderProgress();
    this.viewport.scrollLeft = open ? 0 : this.mainScroll;
    this.stageButtons.get(this.selectedStage)?.focus({ preventScroll: true });
  }
  private handleNodeKeydown(event: KeyboardEvent, number: number): void {
    const visible = missionJourneyStages.filter(stage => this.specialOpen ? stage.kind === 'special' : stage.kind !== 'special');
    const index = visible.findIndex(stage => stage.number === number);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!direction && event.key !== 'Home' && event.key !== 'End')
      return;
    event.preventDefault();
    const next = event.key === 'Home' ? visible[0] : event.key === 'End' ? visible.at(-1) : visible[index + direction];
    if (next) {
      this.select(next.number, true);
      this.stageButtons.get(next.number)?.focus({ preventScroll: true });
    }
  }
  private revealMission(number: number, smooth: boolean): void {
    const button = this.stageButtons.get(number);
    if (!button)
      return;
    const target = button.getBoundingClientRect(), view = this.viewport.getBoundingClientRect();
    this.viewport.scrollTo({ left: this.viewport.scrollLeft + target.left - view.left - view.width * .5 + target.width * .5, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }
  private select(number: number, userSelected = false): void {
    if (!missionJourneyStages[number - 1])
      return;
    this.selectedStage = number;
    if (userSelected) {
      this.userSelected = true;
      hapticsManager.emit('selection');
    }
    this.renderProgress();
    if (userSelected)
      this.revealMission(number, true);
  }
  show(_panelOpen = false): void { this.element.hidden = false; this.renderProgress(); this.revealMission(this.selectedStage, false); }
  hide(): void {
    this.element.hidden = true;
    if (this.celebrationTimer) window.clearTimeout(this.celebrationTimer);
    this.celebrationTimer = 0;
    for (const button of this.stageButtons.values()) button.classList.remove('is-newly-completed');
  }
  closePanel(): void { }
  celebrateCompletion(number: number, collectCredits?: (source: DOMRect) => number): void {
    const stage = missionJourneyStages[number - 1];
    if (!stage || !this.progress[stage.id]?.completed || !this.isOpen)
      return;
    this.userSelected = true;
    this.specialOpen = stage.kind === 'special';
    this.selectedStage = number;
    this.renderProgress();
    this.revealMission(number, false);
    const creditFlightMs = collectCredits?.(this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.getBoundingClientRect()) ?? 0;
    const button = this.stageButtons.get(number)!;
    button.classList.add('is-newly-completed');
    if (this.celebrationTimer)
      window.clearTimeout(this.celebrationTimer);
    this.celebrationTimer = window.setTimeout(() => {
      button.classList.remove('is-newly-completed');
      const next = missionJourneyStages.find(next => next.categoryId === stage.categoryId &&
        next.categoryNumber > stage.categoryNumber && this.progress[next.id]?.eligible && next.implementation === 'playable');
      if (next) {
        this.select(next.number);
        this.revealMission(next.number, true);
      }
      this.celebrationTimer = 0;
    }, Math.max(650, creditFlightMs));
  }

  private renderDetails(): void {
    const stage = missionJourneyStages[this.selectedStage - 1]!;
    const label = [...journeyDisplayGroups, journeySpecialPursuits].find(group => group.id === stage.categoryId)!.label;
    const card = missionJourneyDetails.find(card => card.id === stage.id);
    const completed = !this.cityLocked && this.progress[stage.id]?.completed === true;
    const eligible = !this.cityLocked && this.progress[stage.id]?.eligible === true;
    const signInRequired = !this.cityLocked && this.signInRequired && stage.kind === 'main' && stage.categoryNumber === 1;
    const placeholder = stage.implementation === 'placeholder';
    this.detail.classList.remove('is-placeholder');
    this.detail.querySelector<HTMLElement>('[data-mission-bonus]')!.hidden = true;
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = stage.kind === 'bonus' ? label : `${label} – MISSION ${String(stage.categoryNumber).padStart(2, '0')}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = placeholder ? 'COMING SOON' : card!.title;
    const objective = this.detail.querySelector<HTMLElement>('[data-mission-objective]')!;
    objective.replaceChildren();
    if (card) {
      const list = document.createElement('span');
      list.className = 'mission-journey-instructions';
      list.setAttribute('role', 'list');
      for (const line of card.description.split('\n')) {
        const item = document.createElement('span');
        item.setAttribute('role', 'listitem');
        item.textContent = line;
        list.append(item);
      }
      objective.append(list);
    }
    this.detail.querySelector<HTMLElement>('.mission-journey-detail-facts')!.hidden = false;
    const reward = this.detail.querySelector<HTMLElement>('[data-mission-reward]')!;
    reward.hidden = false;
    this.detail.querySelector<HTMLElement>('[data-mission-time]')!.hidden = false;
    const coinHunt = stage.id === 'journey-dallas-coin-hunt-01';
    const collected = completed && coinHunt ? this.progress[stage.id]?.coinsCollected : undefined;
    const rewardLabel = placeholder ? 'REWARD' : coinHunt ? completed ? collected === undefined ? 'REPLAY REWARD' : 'CREDITS COLLECTED' : 'UP TO' : completed ? 'REWARD CLAIMED' : 'REWARD';
    const rewardAmount = placeholder ? '—' : (coinHunt && completed ? collected ?? 0 : card!.rewardCredits).toLocaleString();
    this.detail.querySelector<HTMLElement>('[data-mission-reward-label]')!.textContent = rewardLabel;
    this.detail.querySelector<HTMLElement>('[data-mission-reward-amount]')!.textContent = rewardAmount;
    reward.setAttribute('aria-label', placeholder ? 'Reward not announced' : `${rewardAmount} Credits${completed ? ', claimed; replay reward: 0 Credits' : ''}`);
    this.detail.querySelector<HTMLElement>('[data-mission-time-value]')!.textContent = placeholder ? '—' : card!.timeLimit;
    const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    play.disabled = placeholder || this.cityLocked || (!completed && !eligible && !signInRequired);
    play.hidden = false;
    play.textContent = placeholder ? 'COMING SOON' : completed ? 'REPLAY MISSION ▶' : signInRequired ? 'SIGN IN TO PLAY ▶' : 'PLAY MISSION ▶';
    this.detail.classList.toggle('is-locked', play.disabled && !placeholder);
  }
}
