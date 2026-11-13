import { observeMissionCopyFit } from './fit-mission-copy';
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
  private progress: Readonly<Record<string, { eligible?: boolean; completed?: boolean }>> = {};
  private signInRequired = false;
  private cityLocked = false;

  constructor(private readonly element: HTMLElement, onPlayMission: () => void, private readonly onPanelOpen: () => void, _onPanelClose: () => void) {
    element.classList.add('mission-journey');
    element.style.setProperty('--journey-stage-gaps', String(missionJourneyStages.length - 1));
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
    observeMissionCopyFit(this.detail.querySelector<HTMLElement>('.mission-journey-detail-copy')!,'[data-mission-title]','[data-mission-objective]');
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
      if (playButton.disabled || missionJourneyStages[this.selectedStage - 1]?.implementation !== 'playable') return;
      hapticsManager.emit('confirmation'); onPlayMission();
    });
    const chapters = element.querySelector<HTMLElement>('.mission-journey-chapters')!;
    for (let chapter = 1; chapter <= chapterNames.length; chapter++) {
      const heading = document.createElement('div');
      heading.className = 'mission-journey-chapter-heading';
      heading.dataset.chapter = String(chapter);
      const stages = missionJourneyStages.filter(stage => stage.chapter === chapter);
      const first = stages[0]!;
      const last = stages[stages.length - 1]!;
      heading.style.left = `${(first.x + last.x) / 2}%`;
      heading.style.top = `max(0px, calc(${(first.y + last.y) / 2}% - var(--chapter-heading-offset)))`;
      heading.innerHTML = `<strong>CHAPTER ${chapter}</strong><span>${chapterNames[chapter - 1]}</span>`;
      chapters.append(heading);
      if (chapter < chapterNames.length) {
        const next = missionJourneyStages[last.number]!;
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
      if (from.chapter !== to.chapter) path.classList.add('is-transition');
      routes.append(path); this.routeSegments.push(path);
    }
    const nodes = element.querySelector<HTMLElement>('.mission-journey-nodes')!;
    for (const stage of missionJourneyStages) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'mission-journey-node is-locked';
      button.dataset.stage = String(stage.number);
      button.style.left = `${stage.x}%`; button.style.top = `${stage.y}%`;
      button.innerHTML = `${stage.implementation === 'playable' && missionJourneyStages[stage.number]?.chapter !== stage.chapter ? '<em class="mission-journey-crown" aria-hidden="true"><svg viewBox="0 0 40 30"><path d="M3 8 11 16 20 3 29 16 37 8 34 25 6 25Z" fill="currentColor"/><path d="M7 28h26" fill="none" stroke="currentColor" stroke-width="3"/></svg></em>' : ''}<span class="mission-journey-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m4.5 12 5 5 10-10" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="mission-journey-number">${stage.number}</span>`;
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
    this.setProgress({});
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

  setProgress(progress: Readonly<Record<string, { eligible?: boolean; completed?: boolean }>>): void {
    this.progress = progress;
    this.renderProgress();
  }

  private isStageEligible(number: number): boolean {
    const stage = missionJourneyStages[number - 1];
    return stage?.implementation === 'playable' && this.progress[stage.id]?.eligible === true;
  }

  private completedStages(): readonly boolean[] {
    return missionJourneyStages.map(stage => stage.implementation === 'playable' && this.progress[stage.id]?.completed === true);
  }

  private renderProgress(): void {
    const completed = this.cityLocked ? missionJourneyStages.map(() => false) : this.completedStages();
    const { currentMission, statuses } = missionJourneyStatuses(completed, completed.map((_, index) => !this.cityLocked && this.isStageEligible(index + 1)), !this.cityLocked && this.signInRequired);
    this.currentMission = currentMission;
    if (this.progressingFrom !== null) this.selectedStage = this.progressingFrom;
    else if (!this.userSelectedStage) this.selectedStage = this.currentMission || (missionJourneyStages.every((stage, index) => stage.implementation === 'placeholder' || completed[index]) ? 30 : 1);
    this.stageButtons.forEach((button, index) => {
      const number = index + 1;
      const status = this.progressingFrom !== null && number === this.currentMission ? 'locked' : statuses[index]!;
      button.classList.toggle('is-locked', status === 'locked');
      button.classList.toggle('is-placeholder', missionJourneyStages[index]!.implementation === 'placeholder');
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
      const previous = missionJourneyStages.slice(0, from).reverse().find(stage => stage.implementation === 'playable');
      const next = missionJourneyStages.slice(from).find(stage => stage.implementation === 'playable');
      segment.classList.toggle('is-lit', this.progressingFrom === null && Boolean(previous && next &&
        completed[previous.number - 1] && (completed[next.number - 1] || this.currentMission === next.number)));
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
    const next = missionJourneyStages.find(stage => stage.number > number && stage.implementation === 'playable')?.number ?? 0;
    if (this.currentMission !== next || !this.stageButtons[next - 1] || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.userSelectedStage = false;
      this.select(number);
      this.revealMission(number, false);
      if (collectCredits) collectCredits(this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.getBoundingClientRect());
      this.select(this.currentMission || number);
      this.revealMission(this.currentMission || number, true);
      return;
    }

    const segments = this.routeSegments.filter(path => Number(path.dataset.from) >= number && Number(path.dataset.from) < next);
    const segment = segments[0];
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

      const lengths = segments.map(path => path.getTotalLength());
      const length = lengths.reduce((sum, value) => sum + value, 0);
      this.progressSegment = segment;
      segments.forEach((path, index) => {
        path.classList.add('is-advancing');
        path.style.strokeDasharray = String(lengths[index]!);
        path.style.strokeDashoffset = String(lengths[index]!);
      });
      const startPoint = segment.getPointAtLength(0);
      marker.style.left = `${startPoint.x}%`;
      marker.style.top = `${startPoint.y}%`;
      const duration = missionJourneyStages[number - 1]?.chapter !== missionJourneyStages[next - 1]?.chapter ? 1_900 : 1_250;
      let startedAt: number | null = null;
      const animate = (now: number): void => {
        if (this.progressingFrom !== number || !this.isOpen) return;
        startedAt ??= now;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        let distance = length * eased;
        let part = 0;
        while (part < lengths.length - 1 && distance > lengths[part]!) distance -= lengths[part++]!;
        const point = segments[part]!.getPointAtLength(distance);
        marker.style.left = `${point.x}%`;
        marker.style.top = `${point.y}%`;
        segments.forEach((path, index) => { path.style.strokeDashoffset = String(index < part ? 0 : index === part ? lengths[index]! - distance : lengths[index]!); });
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
    if (this.progressingFrom !== null) this.stageButtons.forEach(button => button.classList.remove('is-unlocking'));
    this.progressingFrom = null;
    this.progressMarker?.remove();
    this.progressMarker = null;
    for (const path of this.routeSegments) {
      path.classList.remove('is-advancing');
      path.style.removeProperty('stroke-dasharray');
      path.style.removeProperty('stroke-dashoffset');
    }
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
    const placeholder = stage.implementation === 'placeholder';
    this.detail.classList.toggle('is-placeholder', placeholder);
    this.detail.querySelector<HTMLElement>('.mission-journey-detail-facts')!.hidden = placeholder;
    if (placeholder) {
      this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${stage.number}`;
      this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = stage.title;
      this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = 'COMING SOON';
      const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
      play.hidden = false; play.disabled = true; play.textContent = 'COMING SOON';
      this.detail.classList.remove('is-locked');
      return;
    }
    const card = missionJourneyDetails.find(card => card.id === stage.id)!;
    const completed = !this.cityLocked && this.completedStages()[stage.number - 1] === true;
    const eligible = this.isStageEligible(stage.number);
    const signInRequired = this.signInRequired && stage.number === 1 && !completed;
    const locked = this.cityLocked || (!completed && !eligible && !signInRequired);
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${String(stage.number).padStart(2, '0')}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = card.title;
    const objective = this.detail.querySelector<HTMLElement>('[data-mission-objective]')!;
    objective.textContent = card.description;
    if (card.id === 'journey-dallas-capture-01') {
      const list = document.createElement('span');
      list.className = 'mission-journey-instructions';
      list.setAttribute('role', 'list');
      for (const line of card.description.split('\n')) {
        const item = document.createElement('span');
        item.setAttribute('role', 'listitem');
        item.textContent = line;
        list.append(item);
      }
      objective.replaceChildren(list);
    }
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
