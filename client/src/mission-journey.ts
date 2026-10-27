import './mission-journey.css';
import './context-page-shell.css';
import { hapticsManager } from './haptics-manager';
import { createLockIcon } from './lock-icon';
import { chapterNames, missionJourneyStages, missionJourneyStatuses } from './mission-journey-model';
import { missionJourneyDetails } from './mission-journey-content';
export { missionJourneyStages } from './mission-journey-model';
export type { MissionJourneyStage } from './mission-journey-model';

export class MissionJourney {
  private readonly detail: HTMLElement;
  private detailAnimation: Animation | null = null;
  private readonly stageButtons: HTMLButtonElement[] = [];
  private readonly routeSegments: SVGPathElement[] = [];
  private progressMarker: HTMLElement | null = null;
  private progressSegment: SVGPathElement | null = null;
  private progressAnimationFrame = 0;
  private progressStartTimer = 0;
  private unlockTimer = 0;
  private progressingFrom: number | null = null;
  private currentMission = 0;
  private selectedStage = 1;
  private userSelectedStage = false;
  private hasShown = false;
  private lastShownMission = 0;
  private dragPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartScroll = 0;
  private dragged = false;
  private suppressTap = false;
  private panelOpen = false;
  private stageOneCompleted = false;
  private stageOneEligible = false;
  private signInRequired = false;
  private cityLocked = false;
  private stageTwoCompleted = false;
  private stageTwoEligible = false;
  private stageThreeCompleted = false;
  private stageThreeEligible = false;
  private stageFourCompleted = false;
  private stageFourEligible = false;
  private stageFiveCompleted = false;
  private stageFiveEligible = false;
  private stageSixCompleted = false;
  private stageSixEligible = false;
  private stageSevenCompleted = false;
  private stageSevenEligible = false;
  private stageEightCompleted = false;
  private stageEightEligible = false;
  private stageNineCompleted = false;
  private stageNineEligible = false;
  private stageTenCompleted = false;
  private stageTenEligible = false;
  private stageElevenCompleted = false;
  private stageElevenEligible = false;
  private stageTwelveCompleted = false;
  private stageTwelveEligible = false;
  private stageThirteenCompleted = false;
  private stageThirteenEligible = false;
  private stageFourteenCompleted = false;
  private stageFourteenEligible = false;
  private stageFifteenCompleted = false;
  private stageFifteenEligible = false;
  private stageSixteenCompleted = false;
  private stageSixteenEligible = false;
  private stageSeventeenCompleted = false;
  private stageSeventeenEligible = false;
  private stageEighteenCompleted = false;
  private stageEighteenEligible = false;
  private stageNineteenCompleted = false;
  private stageNineteenEligible = false;
  private stageTwentyCompleted = false;
  private stageTwentyEligible = false;
  private stageTwentyOneCompleted = false;
  private stageTwentyOneEligible = false;
  private stageTwentyTwoCompleted = false;
  private stageTwentyTwoEligible = false;
  private stageTwentyThreeCompleted = false;
  private stageTwentyThreeEligible = false;
  private stageTwentyFourCompleted = false;
  private stageTwentyFourEligible = false;

  constructor(private readonly element: HTMLElement, onPlayMission: () => void, private readonly onPanelOpen: () => void, _onPanelClose: () => void) {
    element.classList.add('mission-journey');
    element.setAttribute('aria-label', 'Dallas Mission Journey');
    element.innerHTML = `
      <div class="mission-journey-viewport" aria-label="Dallas missions, four chapters" tabindex="0">
        <div class="mission-journey-map">
          <svg class="mission-journey-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="mission-journey-chapters" aria-hidden="true"></div>
          <div class="mission-journey-nodes" aria-label="Choose a mission"></div>
        </div>
      </div>
      <div class="mission-journey-detail" aria-label="Selected mission details" aria-live="polite">
        <div class="mission-journey-detail-copy"><span data-mission-index>MISSION 01</span><strong data-mission-title></strong><p data-mission-objective></p></div>
        <div class="mission-journey-detail-facts">
          <div class="mission-journey-reward" data-mission-reward><img src="/media/hub/credits.avif" alt="" aria-hidden="true"><span data-mission-reward-label>REWARD</span><strong data-mission-reward-amount></strong></div>
          <div class="mission-journey-time" data-mission-time><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg><span>TIME LIMIT</span><strong data-mission-time-value></strong></div>
        </div>
        <button type="button" class="context-action context-action--gold mission-journey-play" data-mission-play disabled>PLAY MISSION ▶</button>
      </div>`;
    this.detail = element.querySelector('.mission-journey-detail')!;
    const viewport = element.querySelector<HTMLElement>('.mission-journey-viewport')!;
    viewport.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.dragPointerId = event.pointerId;
      this.dragStartX = event.clientX;
      this.dragStartScroll = viewport.scrollLeft;
      this.dragged = false;
    });
    viewport.addEventListener('pointermove', event => {
      if (this.dragPointerId !== event.pointerId) return;
      const distance = event.clientX - this.dragStartX;
      if (Math.abs(distance) > 8 && !this.dragged) {
        this.dragged = true;
        if (event.pointerType === 'mouse') viewport.setPointerCapture(event.pointerId);
      }
      if (this.dragged && event.pointerType === 'mouse') {
        viewport.scrollLeft = this.dragStartScroll - distance;
        event.preventDefault();
      }
    });
    viewport.addEventListener('pointerup', event => {
      if (this.dragPointerId !== event.pointerId) return;
      this.suppressTap = this.dragged;
      this.dragPointerId = null;
      window.setTimeout(() => { this.suppressTap = false; }, 350);
    });
    viewport.addEventListener('pointercancel', () => { this.dragPointerId = null; this.dragged = false; });
    viewport.addEventListener('click', event => {
      if (!this.suppressTap) return;
      event.preventDefault();
      event.stopPropagation();
      this.suppressTap = false;
    }, true);
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      this.handleNodeKeydown(event, this.selectedStage);
    });
    const playButton = element.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    playButton.addEventListener('click', () => {
      if (this.progressingFrom !== null) return;
      if (playButton.disabled) return;
      hapticsManager.emit('confirmation'); onPlayMission();
    });
    const chapters = element.querySelector<HTMLElement>('.mission-journey-chapters')!;
    for (let chapter = 1; chapter <= 4; chapter++) {
      const heading = document.createElement('div');
      heading.className = 'mission-journey-chapter-heading';
      heading.dataset.chapter = String(chapter);
      const first = missionJourneyStages[(chapter - 1) * 6]!;
      const last = missionJourneyStages[chapter * 6 - 1]!;
      heading.style.left = `${(first.x + last.x) / 2}%`;
      heading.style.top = `max(0px, calc(${(first.y + last.y) / 2}% - var(--chapter-heading-offset)))`;
      heading.innerHTML = `<strong>CHAPTER ${chapter}</strong><span>${chapterNames[chapter - 1]}</span>`;
      chapters.append(heading);
      if (chapter < 4) {
        const next = missionJourneyStages[chapter * 6]!;
        const divider = document.createElement('span');
        divider.className = 'mission-journey-chapter-divider';
        divider.style.left = `${(last.x + next.x) / 2}%`;
        divider.style.top = `${(last.y + next.y) / 2}%`;
        chapters.append(divider);
      }
    }
    const routes = element.querySelector<SVGSVGElement>('.mission-journey-route')!;
    for (let number = 1; number < missionJourneyStages.length; number++) {
      const from = missionJourneyStages[number - 1]!;
      const to = missionJourneyStages[number]!;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 1.2;
      path.setAttribute('d', `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`);
      path.classList.add('mission-journey-segment');
      path.dataset.from = String(number);
      if (number % 6 === 0) path.classList.add('is-transition');
      routes.append(path); this.routeSegments.push(path);
    }
    const nodes = element.querySelector<HTMLElement>('.mission-journey-nodes')!;
    for (const stage of missionJourneyStages) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'mission-journey-node is-locked';
      button.dataset.stage = String(stage.number);
      button.style.left = `${stage.x}%`; button.style.top = `${stage.y}%`;
      button.innerHTML = `${stage.number % 6 === 0 ? '<em class="mission-journey-crown" aria-hidden="true"><svg viewBox="0 0 40 30"><path d="M3 8 11 16 20 3 29 16 37 8 34 25 6 25Z" fill="currentColor"/><path d="M7 28h26" fill="none" stroke="currentColor" stroke-width="3"/></svg></em>' : ''}<span class="mission-journey-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m4.5 12 5 5 10-10" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="mission-journey-number">${stage.number}</span>`;
      const lock = document.createElement('span');
      lock.className = 'mission-journey-lock';
      lock.setAttribute('aria-hidden', 'true');
      lock.append(createLockIcon());
      button.append(lock);
      button.addEventListener('click', () => this.select(stage.number, true, true));
      button.addEventListener('keydown', event => this.handleNodeKeydown(event, stage.number));
      nodes.append(button); this.stageButtons.push(button);
    }
    this.select(1, false);
    this.setStageOneProgress(false, false);
  }

  get isOpen(): boolean { return !this.element.hidden; }
  get isPanelOpen(): boolean { return this.panelOpen; }
  get selectedMissionNumber(): number { return this.selectedStage; }

  setSignInRequired(required: boolean): void {
    this.signInRequired = required;
    this.renderProgress();
  }

  setCityLocked(locked: boolean): void {
    this.cityLocked = locked;
    this.renderProgress();
  }

  setStageOneProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageOneCompleted;
    this.stageOneEligible = eligible;
    this.stageOneCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : this.stageFourCompleted ? 5 : this.stageThreeCompleted ? 4 : this.stageTwoCompleted ? 3 : 2;
    this.renderProgress();
  }

  setStageTwoProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwoCompleted;
    this.stageTwoEligible = eligible;
    this.stageTwoCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : this.stageFourCompleted ? 5 : this.stageThreeCompleted ? 4 : 3;
    this.renderProgress();
  }

  setStageThreeProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageThreeCompleted;
    this.stageThreeEligible = eligible;
    this.stageThreeCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : this.stageFourCompleted ? 5 : 4;
    this.renderProgress();
  }

  setStageFourProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFourCompleted;
    this.stageFourEligible = eligible;
    this.stageFourCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : 5;
    this.renderProgress();
  }

  setStageFiveProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFiveCompleted;
    this.stageFiveEligible = eligible;
    this.stageFiveCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 6;
    this.renderProgress();
  }

  setStageSixProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSixCompleted;
    this.stageSixEligible = eligible;
    this.stageSixCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 7;
    this.renderProgress();
  }

  setStageSevenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSevenCompleted;
    this.stageSevenEligible = eligible;
    this.stageSevenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 8;
    this.renderProgress();
  }

  setStageEightProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageEightCompleted;
    this.stageEightEligible = eligible;
    this.stageEightCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 9;
    this.renderProgress();
  }

  setStageNineProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageNineCompleted;
    this.stageNineEligible = eligible;
    this.stageNineCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 10;
    this.renderProgress();
  }

  setStageTenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTenCompleted;
    this.stageTenEligible = eligible;
    this.stageTenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 11;
    this.renderProgress();
  }

  setStageElevenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageElevenCompleted;
    this.stageElevenEligible = eligible;
    this.stageElevenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 12;
    this.renderProgress();
  }

  setStageTwelveProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwelveCompleted;
    this.stageTwelveEligible = eligible;
    this.stageTwelveCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 13;
    this.renderProgress();
  }

  setStageThirteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageThirteenCompleted;
    this.stageThirteenEligible = eligible;
    this.stageThirteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 14;
    this.renderProgress();
  }

  setStageFourteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFourteenCompleted;
    this.stageFourteenEligible = eligible;
    this.stageFourteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 15;
    this.renderProgress();
  }

  setStageFifteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFifteenCompleted;
    this.stageFifteenEligible = eligible;
    this.stageFifteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 16;
    this.renderProgress();
  }

  setStageSixteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSixteenCompleted;
    this.stageSixteenEligible = eligible; this.stageSixteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 17;
    this.renderProgress();
  }

  setStageSeventeenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSeventeenCompleted;
    this.stageSeventeenEligible = eligible; this.stageSeventeenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 18;
    this.renderProgress();
  }

  setStageEighteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageEighteenCompleted;
    this.stageEighteenEligible = eligible; this.stageEighteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 19;
    this.renderProgress();
  }

  setStageNineteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageNineteenCompleted;
    this.stageNineteenEligible = eligible; this.stageNineteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 20;
    this.renderProgress();
  }

  setStageTwentyProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyCompleted;
    this.stageTwentyEligible = eligible; this.stageTwentyCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 21;
    this.renderProgress();
  }

  setStageTwentyOneProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyOneCompleted;
    this.stageTwentyOneEligible = eligible; this.stageTwentyOneCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 22;
    this.renderProgress();
  }

  setStageTwentyTwoProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyTwoCompleted;
    this.stageTwentyTwoEligible = eligible; this.stageTwentyTwoCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 23;
    this.renderProgress();
  }

  setStageTwentyThreeProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyThreeCompleted;
    this.stageTwentyThreeEligible = eligible; this.stageTwentyThreeCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 24;
    this.renderProgress();
  }

  setStageTwentyFourProgress(eligible: boolean, completed: boolean): void {
    this.stageTwentyFourEligible = eligible; this.stageTwentyFourCompleted = completed;
    this.renderProgress();
  }

  private isStageEligible(number: number): boolean {
    return [this.stageOneEligible, this.stageTwoEligible, this.stageThreeEligible, this.stageFourEligible, this.stageFiveEligible, this.stageSixEligible, this.stageSevenEligible, this.stageEightEligible, this.stageNineEligible, this.stageTenEligible, this.stageElevenEligible, this.stageTwelveEligible, this.stageThirteenEligible, this.stageFourteenEligible, this.stageFifteenEligible, this.stageSixteenEligible, this.stageSeventeenEligible, this.stageEighteenEligible, this.stageNineteenEligible, this.stageTwentyEligible, this.stageTwentyOneEligible, this.stageTwentyTwoEligible, this.stageTwentyThreeEligible, this.stageTwentyFourEligible][number - 1] === true;
  }

  private completedStages(): readonly boolean[] {
    return [this.stageOneCompleted, this.stageTwoCompleted, this.stageThreeCompleted, this.stageFourCompleted,
      this.stageFiveCompleted, this.stageSixCompleted, this.stageSevenCompleted, this.stageEightCompleted,
      this.stageNineCompleted, this.stageTenCompleted, this.stageElevenCompleted, this.stageTwelveCompleted,
      this.stageThirteenCompleted, this.stageFourteenCompleted, this.stageFifteenCompleted, this.stageSixteenCompleted,
      this.stageSeventeenCompleted, this.stageEighteenCompleted, this.stageNineteenCompleted, this.stageTwentyCompleted,
      this.stageTwentyOneCompleted, this.stageTwentyTwoCompleted, this.stageTwentyThreeCompleted, this.stageTwentyFourCompleted];
  }

  private renderProgress(): void {
    const completed = this.cityLocked ? missionJourneyStages.map(() => false) : this.completedStages();
    const { currentMission, statuses } = missionJourneyStatuses(completed, completed.map((_, index) => !this.cityLocked && this.isStageEligible(index + 1)), !this.cityLocked && this.signInRequired);
    this.currentMission = currentMission;
    if (this.progressingFrom !== null) this.selectedStage = this.progressingFrom;
    else if (!this.userSelectedStage) this.selectedStage = this.currentMission || (completed.every(Boolean) ? 24 : 1);
    this.stageButtons.forEach((button, index) => {
      const number = index + 1;
      const status = this.progressingFrom === number - 1 ? 'locked' : statuses[index]!;
      button.classList.toggle('is-locked', status === 'locked');
      button.classList.toggle('is-completed', status === 'completed');
      button.classList.toggle('is-current', status === 'current');
      button.classList.toggle('is-selected', number === this.selectedStage);
      button.setAttribute('aria-pressed', String(number === this.selectedStage));
      button.setAttribute('aria-label', `Mission ${number}, ${status === 'completed' ? 'completed, select to replay' : status === 'current' ? 'current mission' : 'locked, view details'}`);
    });
    this.element.querySelectorAll<HTMLElement>('.mission-journey-chapter-heading').forEach(heading => {
      heading.classList.toggle('is-selected', Number(heading.dataset.chapter) === missionJourneyStages[this.selectedStage - 1]?.chapter);
    });
    for (const segment of this.routeSegments) {
      const from = Number(segment.dataset.from);
      segment.classList.toggle('is-lit', from !== this.progressingFrom && completed[from - 1] === true && (completed[from] === true || this.currentMission === from + 1));
    }
    this.renderDetails();
  }

  private handleNodeKeydown(event: KeyboardEvent, number: number): void {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!direction && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? this.stageButtons.find(button => !button.disabled)
      : event.key === 'End' ? [...this.stageButtons].reverse().find(button => !button.disabled)
        : direction > 0 ? this.stageButtons.slice(number).find(button => !button.disabled)
          : this.stageButtons.slice(0, number - 1).reverse().find(button => !button.disabled);
    if (!next) return;
    next.focus();
    this.select(Number(next.dataset.stage), true, true);
  }

  private revealMission(number: number, smooth: boolean): void {
    const viewport = this.element.querySelector<HTMLElement>('.mission-journey-viewport')!;
    const button = this.stageButtons[number - 1];
    if (!button) return;
    const left = button.offsetLeft - viewport.clientWidth / 2;
    viewport.scrollTo({ left, behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }

  private revealTransition(from: number, to: number, ready: () => void): void {
    const viewport = this.element.querySelector<HTMLElement>('.mission-journey-viewport')!;
    const source = this.stageButtons[from - 1]!;
    const destination = this.stageButtons[to - 1]!;
    const padding = Math.min(24, viewport.clientWidth * .04);
    const leftEdge = source.offsetLeft - source.offsetWidth / 2;
    const rightEdge = destination.offsetLeft + destination.offsetWidth / 2;
    if (leftEdge >= viewport.scrollLeft + padding && rightEdge <= viewport.scrollLeft + viewport.clientWidth - padding) {
      ready();
      return;
    }
    const targetLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth,
      (source.offsetLeft + destination.offsetLeft) / 2 - viewport.clientWidth / 2));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      viewport.scrollLeft = targetLeft;
      ready();
      return;
    }
    const startLeft = viewport.scrollLeft;
    let startedAt: number | null = null;
    const move = (now: number): void => {
      if (this.progressingFrom !== from || !this.isOpen) return;
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / 500);
      const eased = progress * progress * (3 - 2 * progress);
      viewport.scrollLeft = startLeft + (targetLeft - startLeft) * eased;
      if (progress < 1) this.progressAnimationFrame = window.requestAnimationFrame(move);
      else { this.progressAnimationFrame = 0; ready(); }
    };
    this.progressAnimationFrame = window.requestAnimationFrame(move);
  }

  celebrateCompletion(number: number, collectCredits?: (source: DOMRect) => number): void {
    if (!this.isOpen || !this.completedStages()[number - 1]) return;
    this.cancelProgressAnimation();
    const next = number + 1;
    if (this.currentMission !== next || !this.stageButtons[next - 1] || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.userSelectedStage = false;
      this.select(number);
      this.revealMission(number, false);
      if (collectCredits) collectCredits(this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.getBoundingClientRect());
      this.select(this.currentMission || number);
      this.revealMission(this.currentMission || number, true);
      return;
    }

    const segment = this.routeSegments.find(path => Number(path.dataset.from) === number);
    if (!segment) {
      this.select(number);
      this.revealMission(number, false);
      if (collectCredits) collectCredits(this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.getBoundingClientRect());
      this.select(next);
      this.revealMission(next, true);
      return;
    }
    this.progressingFrom = number;
    this.userSelectedStage = false;
    this.element.classList.add('is-advancing');
    this.renderProgress();
    this.revealTransition(number, next, () => {
      if (this.progressingFrom !== number || !this.isOpen) return;
      const map = this.element.querySelector<HTMLElement>('.mission-journey-map')!;
      const marker = document.createElement('span');
      marker.className = 'mission-journey-progress-marker';
      marker.setAttribute('aria-hidden', 'true');
      map.append(marker);
      this.progressMarker = marker;
      this.stageButtons[number - 1]?.classList.add('is-newly-completed');
      const creditFlightMs = collectCredits?.(this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.getBoundingClientRect()) ?? 0;

      const length = segment.getTotalLength();
      this.progressSegment = segment;
      segment.classList.add('is-advancing');
      segment.style.strokeDasharray = String(length);
      segment.style.strokeDashoffset = String(length);
      const startPoint = segment.getPointAtLength(0);
      marker.style.left = `${startPoint.x}%`;
      marker.style.top = `${startPoint.y}%`;
      const duration = number === 12 ? 1_900 : 1_250;
      let startedAt: number | null = null;
      const animate = (now: number): void => {
        if (this.progressingFrom !== number || !this.isOpen) return;
        startedAt ??= now;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        const point = segment.getPointAtLength(length * eased);
        marker.style.left = `${point.x}%`;
        marker.style.top = `${point.y}%`;
        segment.style.strokeDashoffset = String(length * (1 - eased));
        if (progress < 1) {
          this.progressAnimationFrame = window.requestAnimationFrame(animate);
          return;
        }
        this.progressAnimationFrame = 0;
        const unlocked = this.stageButtons[next - 1]!;
        marker.remove();
        this.progressMarker = null;
        unlocked.classList.add('is-unlocking');
        this.unlockTimer = window.setTimeout(() => {
          this.unlockTimer = 0;
          this.cancelProgressAnimation();
          this.userSelectedStage = false;
          this.select(next);
          unlocked.classList.add('is-newly-unlocked');
          this.revealMission(next, true);
          window.setTimeout(() => unlocked.classList.remove('is-newly-unlocked'), 850);
        }, 360);
      };
      if (creditFlightMs > 0) {
        this.progressStartTimer = window.setTimeout(() => {
          this.progressStartTimer = 0;
          if (this.progressingFrom === number && this.isOpen) this.progressAnimationFrame = window.requestAnimationFrame(animate);
        }, creditFlightMs);
      } else this.progressAnimationFrame = window.requestAnimationFrame(animate);
    });
  }

  private cancelProgressAnimation(): void {
    if (this.progressStartTimer) window.clearTimeout(this.progressStartTimer);
    this.progressStartTimer = 0;
    if (this.progressAnimationFrame) window.cancelAnimationFrame(this.progressAnimationFrame);
    this.progressAnimationFrame = 0;
    if (this.unlockTimer) window.clearTimeout(this.unlockTimer);
    this.unlockTimer = 0;
    if (this.progressingFrom !== null) this.stageButtons[this.progressingFrom - 1]?.classList.remove('is-newly-completed');
    if (this.progressingFrom !== null) this.stageButtons[this.progressingFrom]?.classList.remove('is-unlocking');
    this.progressingFrom = null;
    this.progressMarker?.remove();
    this.progressMarker = null;
    this.progressSegment?.classList.remove('is-advancing');
    this.progressSegment?.style.removeProperty('stroke-dasharray');
    this.progressSegment?.style.removeProperty('stroke-dashoffset');
    this.progressSegment = null;
    this.element.classList.remove('is-advancing');
  }

  show(_panelOpen = false): void {
    this.cancelProgressAnimation();
    this.element.hidden = false;
    this.renderProgress();
    if (this.hasShown && this.lastShownMission !== this.currentMission) {
      this.userSelectedStage = false;
      this.renderProgress();
    }
    if (!this.hasShown || this.lastShownMission !== this.currentMission) {
      this.revealMission(this.currentMission || this.selectedStage, false);
    }
    this.hasShown = true;
    this.lastShownMission = this.currentMission;
    this.panelOpen = false;
  }

  hide(): void {
    this.cancelProgressAnimation();
    this.detailAnimation?.cancel();
    this.detailAnimation = null;
    this.element.hidden = true;
  }
  closePanel(): void { this.panelOpen = false; }

  private setPanelOpen(_open: boolean): void { this.panelOpen = false; }

  private select(number: number, _animate = true, userSelected = false): void {
    const stage = missionJourneyStages[number - 1];
    if (!stage || userSelected && this.progressingFrom !== null) return;
    const changed = number !== this.selectedStage;
    const chapterChanged = stage.chapter !== missionJourneyStages[this.selectedStage - 1]?.chapter;
    if (userSelected) { this.userSelectedStage = true; hapticsManager.emit('selection'); }
    this.selectedStage = number;
    this.renderProgress();
    if (userSelected && changed && this.isOpen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.detailAnimation?.cancel();
      const distance = window.innerHeight - this.detail.offsetTop + 12;
      const animation = this.detail.animate([
        { transform: `translateY(${distance}px)` },
        { transform: 'translateY(0)' },
      ], { duration: 360, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      this.detailAnimation = animation;
      animation.onfinish = () => { if (this.detailAnimation === animation) this.detailAnimation = null; };
    }
    if (userSelected) {
      const viewport = this.element.querySelector<HTMLElement>('.mission-journey-viewport')!;
      const button = this.stageButtons[number - 1]!;
      const edgePadding = 24;
      if (chapterChanged || button.offsetLeft < viewport.scrollLeft + button.offsetWidth / 2 + edgePadding || button.offsetLeft > viewport.scrollLeft + viewport.clientWidth - button.offsetWidth / 2 - edgePadding) {
        this.revealMission(number, true);
      }
    }
  }

  private renderDetails(): void {
    const stage = missionJourneyStages[this.selectedStage - 1];
    if (!stage) {
      this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = 'MISSIONS LOCKED';
      this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = '';
      this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = 'Complete earlier missions to unlock.';
      this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.hidden = true;
      this.detail.querySelector<HTMLElement>('[data-mission-time]')!.hidden = true;
      this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!.hidden = true;
      return;
    }
    const card = missionJourneyDetails[stage.number - 1]!;
    const completed = !this.cityLocked && this.completedStages()[stage.number - 1] === true;
    const eligible = this.isStageEligible(stage.number);
    const signInRequired = this.signInRequired && stage.number === 1 && !completed;
    const locked = this.cityLocked || (!completed && !eligible && !signInRequired);
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${String(stage.number).padStart(2, '0')}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = card.title;
    this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = card.description;
    const reward = this.detail.querySelector<HTMLElement>('[data-mission-reward]')!;
    reward.hidden = false;
    this.detail.querySelector<HTMLElement>('[data-mission-time]')!.hidden = false;
    reward.setAttribute('aria-label', `${card.rewardCredits.toLocaleString()} Credits${completed ? ', claimed' : ''}`);
    this.detail.querySelector<HTMLElement>('[data-mission-reward-label]')!.textContent = completed ? 'REWARD CLAIMED' : 'REWARD';
    this.detail.querySelector<HTMLElement>('[data-mission-reward-amount]')!.textContent = card.rewardCredits.toLocaleString();
    this.detail.querySelector<HTMLElement>('[data-mission-time-value]')!.textContent = card.timeLimit;
    const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    play.disabled = locked;
    play.hidden = false;
    play.textContent = completed ? 'REPLAY MISSION ▶' : signInRequired ? 'SIGN IN TO PLAY ▶' : 'PLAY MISSION ▶';
    this.detail.classList.toggle('is-locked', locked);
  }
}
