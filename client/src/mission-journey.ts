import { observeMissionCopyFit } from './fit-mission-copy';
import './mission-journey.css';
import './context-page-shell.css';
import { hapticsManager } from './haptics-manager';
import { createLockIcon } from './lock-icon';
import { journeyDisplayGroups, journeySpecialPursuits, type JourneyCategory } from '../../shared/journey-categories.mjs';
import { missionJourneyStages, missionJourneyStatuses } from './mission-journey-model';
import { missionJourneyDetails } from './mission-journey-content';
export { missionJourneyStages } from './mission-journey-model';
export type { MissionJourneyStage } from './mission-journey-model';
type Progress = Readonly<Record<string, {
  eligible?: boolean;
  completed?: boolean;
  coinsCollected?: number;
}>>;
function categoryIcon(icon: string, key = icon): string {
  if (icon === 'plane') return '<img src="/media/hub/aircraft.png" alt="" aria-hidden="true" decoding="async">';
  const prefix = `journey-icon-${key}`;
  const art: Record<string, string> = {
    ring: '<g transform="rotate(36 32 32)"><ellipse cx="32" cy="33" rx="18" ry="25" fill="none" stroke="#8c4609" stroke-width="12"/><ellipse cx="32" cy="31" rx="18" ry="25" fill="none" stroke="url(#gold)" stroke-width="10"/><ellipse cx="32" cy="31" rx="14" ry="21" fill="none" stroke="#fff3a4" stroke-width="1.5"/><path d="M16 19c3-10 11-15 18-12" fill="none" stroke="#fffce4" stroke-width="3" stroke-linecap="round"/></g>',
    cargo: '<path d="m5 17 26-11 28 11v32L32 61 5 49Z" fill="url(#gold)" stroke="#92500f" stroke-width="2"/><path d="m5 17 27 12 27-12-28-11Z" fill="#ffe296"/><path d="M32 29v32l27-12V17Z" fill="#ba791c"/><path d="m18 11 28 12v15l-8 3V26L12 14M13 22v30l8 3V25" fill="url(#blue)" stroke="#99eafa" stroke-width="1"/><path d="m7 18 25 11 25-11M32 30v28" fill="none" stroke="#fff3bb" stroke-width="1.5"/><path d="m43 44 10-4v7l-10 4Z" fill="url(#steel)"/><path d="m9 17 22-8 10 4" fill="none" stroke="#fffbea" stroke-width="2"/>',
    target: '<circle cx="32" cy="32" r="28" fill="url(#steel)" stroke="#0b2944" stroke-width="2"/><circle cx="32" cy="32" r="24" fill="url(#red)"/><circle cx="32" cy="32" r="18" fill="url(#steel)"/><circle cx="32" cy="32" r="12" fill="url(#red)"/><circle cx="32" cy="32" r="5" fill="#fff3c8"/><path d="M2 32h14m32 0h14M32 2v14m0 32v14" stroke="#092b46" stroke-width="4"/><path d="M2 31h14m32 0h14M31 2v14m0 32v14" stroke="#b4eeff" stroke-width="1"/><path d="M13 19c5-8 13-12 22-11" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2" stroke-linecap="round"/>',
    giant: '<g transform="rotate(-25 32 32)"><path d="M29 3q3-3 6 0l3 22 24 12v8l-24-6-1 12 11 7v4H16v-4l11-7-1-12L2 45v-8l24-12Z" fill="url(#steel)" stroke="#477392" stroke-width="2"/><path d="m30 7-1 43 3 8 3-8-1-43" fill="url(#blue)"/><path d="m5 37 21-10m12 0 21 10" fill="none" stroke="#fffdf0" stroke-width="2"/><path d="M15 36v10m8-13v11m18-11v11m8-8v10" stroke="#e3ab35" stroke-width="6" stroke-linecap="round"/><path d="M15 41v5m8-7v5m18-5v5m8-3v5" stroke="#173146" stroke-width="3" stroke-linecap="round"/></g>',
    flag: '<path d="M11 61V6" stroke="#87520d" stroke-width="6" stroke-linecap="round"/><path d="M10 59V7" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/><circle cx="10" cy="5" r="4" fill="url(#gold)"/><path d="M13 10c15-11 25 9 46-1v31c-21 11-31-10-46 1Z" fill="url(#blue)" stroke="#f1c24c" stroke-width="2"/><path d="M34 12v31c8 3 16 3 25-3V9c-10 5-17 6-25 3Z" fill="#082f60" opacity=".6"/><path d="m30 18 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="url(#gold)"/><path d="M15 11c13-7 19 5 33 2" fill="none" stroke="#c6f2ff" stroke-opacity=".65" stroke-width="2"/>',
    gift: '<path d="M7 25h50v35H7Z" fill="url(#red)" stroke="#ffe66c" stroke-width="2"/><path d="M2 17h60v13H2ZM28 17h9v43h-9Z" fill="url(#gold)"/><path d="M32 18C3 17 13-9 32 13 51-9 61 17 32 18Z" fill="none" stroke="#ffdf3a" stroke-width="6"/>',
    boss: '<path d="M5 64v-9c0-17 54-17 54 0v9" fill="url(#blue)" stroke="#d3dbe5" stroke-width="2"/><path d="m19 46 13 12 13-12-5 18H24Z" fill="url(#steel)"/><path d="m30 54 4 0 3 10H27Z" fill="url(#red)"/><path d="M17 23c-4-24 38-24 32 0l-4 22-13 9-13-9Z" fill="#dca98d" stroke="#825c50" stroke-width="1.5"/><path d="m15 23 2-15L28 2l7 5 11-2 6 12-4 9-4-12-10 3-12-5-3 14Z" fill="url(#steel)" stroke="#697c91" stroke-width="1.5"/><path d="M15 25h16v12H16ZM35 25h16l-1 12H35Z" fill="#13253e" stroke="#e9b54c" stroke-width="2"/><path d="m18 27 8 0-7 6m19-6h8l-7 6" stroke="#7bd4f6" stroke-width="2"/><path d="M31 29h4M25 44h15" stroke="#533429" stroke-width="2"/>',
  };
  const body = (art[icon] ?? art.flag).replaceAll('url(#', `url(#${prefix}-`);
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs>
    <linearGradient id="${prefix}-gold" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff9cf"/><stop offset=".22" stop-color="#ffe36c"/><stop offset=".48" stop-color="#f3b01f"/><stop offset=".64" stop-color="#fff19a"/><stop offset="1" stop-color="#a85a08"/></linearGradient>
    <linearGradient id="${prefix}-steel" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#fffdf0"/><stop offset=".28" stop-color="#d8edfa"/><stop offset=".55" stop-color="#8da9c2"/><stop offset=".7" stop-color="#edfaff"/><stop offset="1" stop-color="#486783"/></linearGradient>
    <linearGradient id="${prefix}-blue" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#9beeff"/><stop offset=".3" stop-color="#2ba7ee"/><stop offset=".55" stop-color="#1263aa"/><stop offset="1" stop-color="#082744"/></linearGradient>
    <linearGradient id="${prefix}-red" x1="0" y1="0" x2=".6" y2="1"><stop stop-color="#ffb196"/><stop offset=".3" stop-color="#f64443"/><stop offset=".7" stop-color="#c6162e"/><stop offset="1" stop-color="#750b20"/></linearGradient>
  </defs>${body}</svg>`;
}
const bonusRibbonMarkup = '<span class="mission-journey-bonus" aria-hidden="true"><svg viewBox="0 0 140 48"><path d="M15 16 3 20 12 31 7 43 32 36H108L133 43 128 31 137 20 125 16Z" fill="#8c3bac" stroke="#ffdc78" stroke-width="2"/><path d="M14 9Q70-5 126 9L120 37Q70 24 20 37Z" fill="#68128c" stroke="#ffe58b" stroke-width="2"/><text x="70" y="27" text-anchor="middle" fill="#fff2a1">BONUS</text></svg></span>';
export class MissionJourney {
  readonly headerContent: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly scrollPosition: HTMLInputElement;
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
    element.innerHTML = `<div class="mission-journey-heading"><button type="button" data-journey-back class="mission-journey-special-back" hidden>‹ BACK TO JOURNEY</button></div><div class="mission-journey-viewport" tabindex="0" aria-label="Dallas mission categories, swipe or use arrow keys"><div class="mission-journey-track"></div></div><input type="range" class="mission-journey-scroll-position" aria-label="Scroll mission categories" min="0" max="1000" step="1" value="0">      <div class="mission-journey-detail" aria-label="Selected mission details" aria-live="polite">
    <div class="mission-journey-detail-copy"><span class="mission-journey-detail-heading"><span data-mission-index>MISSION 01</span><span data-mission-bonus hidden>${bonusRibbonMarkup}</span></span><strong data-mission-title></strong><p data-mission-objective></p></div>
    <div class="mission-journey-detail-facts">
     <div class="mission-journey-reward" data-mission-reward><img src="/media/hub/credits.avif" alt="" aria-hidden="true"><span data-mission-reward-label>REWARD</span><strong data-mission-reward-amount></strong></div>
     <div class="mission-journey-time" data-mission-time><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg><span>TIME LIMIT</span><strong data-mission-time-value></strong></div>
    </div>
    <button type="button" class="context-action context-action--gold mission-journey-play" data-mission-play disabled>PLAY MISSION ▶</button>
   </div>`;
    this.headerContent = document.createElement('span');
    this.headerContent.className = 'mission-journey-header-copy';
    this.headerContent.textContent = 'DALLAS·MISSION';
    this.detail = element.querySelector('.mission-journey-detail')!;
    this.viewport = element.querySelector('.mission-journey-viewport')!;
    this.scrollPosition = element.querySelector('.mission-journey-scroll-position')!;
    this.scrollPosition.addEventListener('input', () => {
      this.viewport.scrollLeft = Number(this.scrollPosition.value) / 1000 * Math.max(0, this.viewport.scrollWidth - this.viewport.clientWidth);
    });
    this.viewport.addEventListener('scroll', () => this.updateScrollPosition(), { passive: true });
    this.back = element.querySelector('[data-journey-back]')!;
    this.back.addEventListener('click', () => this.showSpecial(false));
    observeMissionCopyFit(this.detail.querySelector<HTMLElement>('.mission-journey-detail-copy')!, '[data-mission-title]', '[data-mission-objective]');
    const track = element.querySelector<HTMLElement>('.mission-journey-track')!;
    for (const group of [...journeyDisplayGroups, journeySpecialPursuits])
      this.renderGroup(track, group);
    const resize = new ResizeObserver(() => this.updateScrollPosition());
    resize.observe(this.viewport);
    resize.observe(track);
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
    const displayLabel = group.id.startsWith('bonus-') ? 'BONUS' : group.id === 'territory-missions' ? 'TERRITORY CAPTURE' : group.label;
    const section = document.createElement('section');
    section.className = 'mission-journey-category';
    section.dataset.category = group.id;
    section.style.setProperty('--category-color', group.color);
    section.setAttribute('aria-label', displayLabel);
    const stages = missionJourneyStages.filter(stage => stage.categoryId === group.id);
    const row = document.createElement('div');
    row.className = 'mission-journey-category-nodes';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', displayLabel);
    if (stages.length > 1 && group.id !== 'dr-boss') {
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
      button.style.left = stage.kind === 'boss'
        ? `calc(50% ${index === 0 ? '-' : '+'} var(--journey-boss-step) / 2)`
        : `${(stages.length === 1 ? 133 : 18 + index * 230 / (stages.length - 1)) / 266 * 100}%`;
      button.style.top = `calc(var(--journey-node-center) - ${stage.kind === 'boss' ? 8 : stages.length === 1 ? 10 : index * 15 / (stages.length - 1)}px)`;
      button.innerHTML = `<span class="mission-journey-number">${stage.kind === 'bonus' ? '<img class="mission-journey-credit-coin" src="/media/missions/credit-coin.webp" alt="" aria-hidden="true">' : stage.categoryNumber}</span><span class="mission-journey-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4.5 12 5 5 10-10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
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
    const icon = group.id === 'giant-battles' ? 'giant' : group.id === 'territory-missions' ? 'flag' : group.icon;
    label.innerHTML = `<span class="mission-journey-category-icon">${categoryIcon(icon, group.id)}</span><strong>${displayLabel}</strong>${group.id === 'plane-battles' ? '<button type="button" class="mission-journey-extra" data-extra-pursuits hidden>2 EXTRA</button>' : ''}`;
    section.classList.toggle('is-bonus-group', stages[0]?.kind === 'bonus');
    section.classList.toggle('is-boss-group', stages[0]?.kind === 'boss');
    label.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('button')) return;
      const stage = stages.find(stage => this.progress[stage.missionId]?.eligible && !this.progress[stage.missionId]?.completed) ?? stages[0];
      if (stage) this.select(stage.number, true);
    });
    section.append(label, row);
    track.append(section);
    this.groups.set(group.id, section);
  }
  private updateScrollPosition(): void {
    const width = this.viewport.scrollWidth;
    const visible = this.viewport.clientWidth;
    const overflow = Math.max(0, width - visible);
    this.scrollPosition.disabled = overflow === 0;
    this.scrollPosition.value = String(overflow ? Math.round(this.viewport.scrollLeft / overflow * 1000) : 0);
    this.scrollPosition.style.setProperty('--journey-scroll-thumb', `${width ? Math.max(8, Math.min(100, visible / width * 100)) : 100}%`);
  }
  get isOpen(): boolean { return !this.element.hidden; }
  get isPanelOpen(): boolean { return false; }
  get selectedMissionNumber(): number { return this.selectedStage; }
  get selectedMissionId(): string | undefined { return missionJourneyStages[this.selectedStage - 1]?.id; }
  setSignInRequired(required: boolean): void { this.signInRequired = required; this.renderProgress(); }
  setCityLocked(locked: boolean): void { this.cityLocked = locked; this.renderProgress(); }
  setProgress(progress: Progress): void { this.progress = progress; this.renderProgress(); }
  private completedStages(): readonly boolean[] { return missionJourneyStages.map(stage => !this.cityLocked && this.progress[stage.missionId]?.completed === true); }
  private renderProgress(): void {
    const completed = this.completedStages();
    const state = missionJourneyStatuses(completed, missionJourneyStages.map(stage => !this.cityLocked && this.progress[stage.missionId]?.eligible === true), !this.cityLocked && this.signInRequired);
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
      const label = stage.kind === 'bonus' ? 'BONUS' : [...journeyDisplayGroups, journeySpecialPursuits].find(group => group.id === stage.categoryId)!.label;
      button.setAttribute('aria-label', `${label}, ${stage.kind === 'bonus' ? 'bonus' : `mission ${stage.categoryNumber}`}, ${stage.implementation === 'placeholder' ? 'Coming Soon' : status === 'completed' ? 'completed, select to replay' : status === 'locked' ? 'locked, view details' : status}`);
    }
    for (const [id, group] of this.groups) {
      group.hidden = this.specialOpen ? id !== 'special-pursuits' : id === 'special-pursuits';
      group.classList.toggle('is-selected', selected.categoryId === id);
    }
    this.extrasLink.hidden = selected.categoryId !== 'plane-battles';
    this.back.hidden = !this.specialOpen;
    this.element.classList.toggle('is-special-view', this.specialOpen);
    this.renderDetails();
    this.updateScrollPosition();
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
    if (!stage || !this.progress[stage.missionId]?.completed || !this.isOpen)
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
        next.categoryNumber > stage.categoryNumber && this.progress[next.missionId]?.eligible && next.implementation === 'playable');
      if (next) {
        this.select(next.number);
        this.revealMission(next.number, true);
      }
      this.celebrationTimer = 0;
    }, Math.max(650, creditFlightMs));
  }

  private renderDetails(): void {
    const stage = missionJourneyStages[this.selectedStage - 1]!;
    const card = missionJourneyDetails.find(card => card.id === stage.missionId);
    const completed = !this.cityLocked && this.progress[stage.missionId]?.completed === true;
    const eligible = !this.cityLocked && this.progress[stage.missionId]?.eligible === true;
    const signInRequired = !this.cityLocked && this.signInRequired && stage.kind === 'main' && stage.categoryNumber === 1;
    const placeholder = stage.implementation === 'placeholder';
    this.detail.classList.remove('is-placeholder');
    this.detail.querySelector<HTMLElement>('[data-mission-bonus]')!.hidden = true;
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = stage.kind === 'bonus' ? 'BONUS' : `MISSION ${String(stage.categoryNumber).padStart(2, '0')}`;
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
    const coinHunt = stage.missionId === 'journey-dallas-coin-hunt-01';
    const collected = completed && coinHunt ? this.progress[stage.missionId]?.coinsCollected : undefined;
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
