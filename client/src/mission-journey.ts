import './mission-journey.css';
import { hapticsManager } from './haptics-manager';

type ChapterNumber = 1 | 2 | 3 | 4;
type StageImplementation = 'playable' | 'planned';

export type MissionJourneyStage = Readonly<{
  id: string;
  number: number;
  chapter: ChapterNumber;
  implementation: StageImplementation;
  x: number;
  y: number;
}>;

const chapterNames = ['TAKE OFF', 'CITY SKIES', 'HIGHER GROUND', 'FINAL APPROACH'] as const;
const stagePositions: readonly (readonly [number, number])[] = [
  [92, 239], [172, 247], [251, 267], [328, 297], [403, 320], [480, 325],
  [407, 100], [486, 100], [565, 108], [639, 120], [703, 128], [770, 136],
  [620, 258], [698, 258], [840, 204], [776, 264], [844, 279], [917, 282],
  [616, 367], [677, 398], [740, 409], [807, 423], [872, 432], [936, 432],
];

export const missionJourneyStages: readonly MissionJourneyStage[] = stagePositions.map(([x, y], index) => ({
  id: index < 4 ? `journey-dallas-0${index + 1}` : `dallas-mission-${String(index + 1).padStart(2, '0')}`,
  number: index + 1,
  chapter: (Math.floor(index / 6) + 1) as ChapterNumber,
  implementation: index < 4 ? 'playable' : 'planned',
  x,
  y,
}));

function routePath(stages: readonly MissionJourneyStage[]): string {
  const first = stages[0]!;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < stages.length - 1; index += 1) {
    if (index === 0 && first.number === 7) { path += ' C 349 78, 347 151, 421 133 C 454 121, 468 100, 486 100'; continue; }
    if (index === 0 && first.number === 13) { path += ' C 555 240, 546 305, 624 288 C 655 280, 672 258, 698 258'; continue; }
    if (index === 0 && first.number === 19) { path += ' C 555 347, 549 423, 618 416 C 646 413, 659 396, 677 398'; continue; }
    const previous = stages[Math.max(0, index - 1)]!;
    const current = stages[index]!;
    const next = stages[index + 1]!;
    const after = stages[Math.min(stages.length - 1, index + 2)]!;
    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = current.y + (next.y - previous.y) / 6;
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = next.y - (after.y - current.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`;
  }
  return path;
}

export class MissionJourney {
  private readonly board: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly detailCard: HTMLElement;
  private readonly stageButtons: HTMLButtonElement[] = [];
  private selectedStage = 1;
  private userSelectedStage = false;
  private panelOpen = false;
  private stageOneCompleted = false;
  private stageOneEligible = false;
  private stageTwoCompleted = false;
  private stageTwoEligible = false;
  private stageThreeCompleted = false;
  private stageThreeEligible = false;
  private stageFourCompleted = false;
  private stageFourEligible = false;

  constructor(private readonly element: HTMLElement, onCities: () => void, onFreeFlight: () => void, onPlayMission: () => void, private readonly onPanelOpen: () => void, onPanelClose: () => void) {
    element.classList.add('mission-journey');
    element.setAttribute('aria-label', 'Dallas Mission Journey');
    element.innerHTML = `
      <div class="mission-journey-airport-mark" aria-hidden="true"><strong>DFW</strong><span>DALLAS FORT WORTH<br>INTERNATIONAL AIRPORT</span></div>
      <div class="mission-journey-dallas-mark" aria-hidden="true"><span>✈</span><strong>DALLAS<small>BIG RUNWAYS. BIGGER ADVENTURES.</small></strong></div>
      <div class="mission-journey-topbar">
        <button type="button" class="mission-journey-back" data-mission-cities><span aria-hidden="true">‹</span> BACK TO CITIES</button>
        <div class="mission-journey-heading"><span>FLY · FIGHT · EXPLORE</span><h1>MISSION JOURNEY</h1><p>DALLAS — 24 MISSIONS ACROSS 4 CHAPTERS</p></div>
      </div>
      <div class="mission-journey-layout">
        <div class="mission-journey-board-scroll" tabindex="0" aria-label="Mission route. Scroll to explore all 24 stages.">
          <div class="mission-journey-board">
            <svg class="mission-journey-route" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="mission-journey-chapter mission-journey-chapter-1"><strong>CHAPTER 1</strong><span>TAKE OFF</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-2"><strong>CHAPTER 2</strong><span>CITY SKIES</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-3"><strong>CHAPTER 3</strong><span>HIGHER GROUND</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-4"><strong>CHAPTER 4</strong><span>FINAL APPROACH</span></div>
            <div class="mission-journey-nodes" aria-label="Dallas mission stages"></div>
          </div>
        </div>
        <aside class="mission-journey-detail" aria-label="Selected mission details" aria-hidden="true" aria-live="polite">
          <div class="mission-journey-detail-card">
            <div class="mission-journey-detail-top"><span data-mission-index>MISSION 01</span><span class="mission-journey-status" data-mission-status>COMING SOON</span><button type="button" class="mission-journey-detail-close" aria-label="Close mission details" data-mission-close>×</button></div>
            <h2 class="mission-journey-mission-title" data-mission-title></h2>
            <p class="mission-journey-type" data-mission-type>CHAPTER 1 · TAKE OFF</p>
            <figure class="mission-journey-preview"><div role="img" aria-label="Dallas city aviation preview"></div><figcaption data-mission-caption>DALLAS CITY PREVIEW</figcaption></figure>
            <p class="mission-journey-objective" data-mission-objective></p>
            <div class="mission-journey-facts" data-mission-facts hidden></div>
            <div class="mission-journey-detail-bottom"><button type="button" class="mission-journey-play" data-mission-play disabled>MISSION COMING SOON</button></div>
          </div>
        </aside>
      </div>
      <div class="mission-journey-free-dock">
        <button type="button" class="mission-journey-free" data-mission-free>
          <svg class="mission-journey-free-plane" viewBox="0 0 64 64" aria-hidden="true"><path d="M30 3c0-2 4-2 4 0l3 25 21 10c3 2 3 5 0 5L36 38l-1 15 7 5v3l-10-2-10 2v-3l7-5-1-15-22 5c-3 0-3-3 0-5l21-10z"/></svg>
          <span class="mission-journey-free-copy"><strong>FREE FLY DALLAS</strong><small>EXPLORE <span aria-hidden="true">•</span> PRACTICE <span aria-hidden="true">•</span> NO LIMITS</small></span>
          <svg class="mission-journey-free-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 8 8-8 8"/></svg>
        </button>
      </div>`;

    this.board = element.querySelector('.mission-journey-board-scroll')!;
    this.detail = element.querySelector('.mission-journey-detail')!;
    this.detailCard = element.querySelector('.mission-journey-detail-card')!;
    this.detail.inert = true;
    element.querySelectorAll<HTMLButtonElement>('[data-mission-cities]').forEach(button => button.addEventListener('click', onCities));
    element.querySelector<HTMLButtonElement>('[data-mission-free]')!.addEventListener('click', () => { hapticsManager.emit('confirmation'); onFreeFlight(); });
    element.querySelector<HTMLButtonElement>('[data-mission-play]')!.addEventListener('click', () => { hapticsManager.emit('confirmation'); onPlayMission(); });
    element.querySelector<HTMLButtonElement>('[data-mission-close]')!.addEventListener('click', () => { hapticsManager.emit('selection'); onPanelClose(); });
    this.detail.addEventListener('transitionend', event => {
      if (event.propertyName === 'width' && this.panelOpen) this.revealSelectedStage();
    });

    const route = element.querySelector<SVGSVGElement>('.mission-journey-route')!;
    const transition = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    transition.setAttribute('d', 'M 480 325 C 515 245, 395 205, 407 100 M 770 136 C 870 178, 842 239, 620 258 M 917 282 C 968 345, 791 352, 616 367');
    transition.setAttribute('class', 'mission-journey-route-transition');
    route.append(transition);
    const chapterRoutes = [0, 6, 12, 18].map(start => routePath(missionJourneyStages.slice(start, start + 6))).join(' ');
    for (const className of ['mission-journey-route-shell', 'mission-journey-route-halo', 'mission-journey-route-core', 'mission-journey-route-energy']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', chapterRoutes);
      path.setAttribute('class', className);
      route.append(path);
    }
    const completedRoute = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    completedRoute.setAttribute('d', routePath(missionJourneyStages.slice(0, 2)));
    completedRoute.setAttribute('class', 'mission-journey-route-completed');
    completedRoute.setAttribute('pathLength', '1');
    route.append(completedRoute);
    const secondCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    secondCompletedRoute.setAttribute('d', routePath(missionJourneyStages.slice(1, 3)));
    secondCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-two');
    route.append(secondCompletedRoute);
    const thirdCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    thirdCompletedRoute.setAttribute('d', routePath(missionJourneyStages.slice(2, 4)));
    thirdCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-three');
    route.append(thirdCompletedRoute);
    const fourthCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    fourthCompletedRoute.setAttribute('d', routePath(missionJourneyStages.slice(3, 5)));
    fourthCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-four');
    route.append(fourthCompletedRoute);
    const nodes = element.querySelector<HTMLElement>('.mission-journey-nodes')!;
    for (const stage of missionJourneyStages) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mission-journey-node is-locked';
      if (stage.number % 6 === 0) button.classList.add('is-finale');
      if (stage.number === 24) button.classList.add('is-final');
      button.style.left = `${stage.x / 10}%`;
      button.style.top = `${stage.y / 5.2}%`;
      button.setAttribute('aria-label', `Mission ${stage.number}, locked, select to preview`);
      button.dataset.stage = String(stage.number);
      const number = document.createElement('span');
      number.textContent = String(stage.number);
      const gloss = document.createElement('i');
      gloss.className = 'mission-journey-node-gloss';
      gloss.setAttribute('aria-hidden', 'true');
      const lock = document.createElement('small');
      lock.setAttribute('aria-hidden', 'true');
      button.append(gloss, number, lock);
      button.addEventListener('click', () => this.select(stage.number, true, true));
      nodes.append(button);
      this.stageButtons.push(button);
    }
    this.board.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const next = Math.min(24, Math.max(1, this.selectedStage + offset));
      this.select(next, true, true);
      this.stageButtons[next - 1]?.focus();
    });
    document.addEventListener('visibilitychange', () => {
      this.element.classList.toggle('is-paused', document.hidden);
    });
    this.select(1, false);
    this.setStageOneProgress(false, false);
  }

  get isOpen(): boolean { return !this.element.hidden; }
  get isPanelOpen(): boolean { return this.panelOpen; }
  get selectedMissionNumber(): number { return this.selectedStage; }

  setStageOneProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageOneCompleted;
    this.stageOneEligible = eligible;
    this.stageOneCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFourCompleted ? 5 : this.stageThreeCompleted ? 4 : this.stageTwoCompleted ? 3 : 2;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageTwoProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwoCompleted;
    this.stageTwoEligible = eligible;
    this.stageTwoCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFourCompleted ? 5 : this.stageThreeCompleted ? 4 : 3;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageThreeProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageThreeCompleted;
    this.stageThreeEligible = eligible;
    this.stageThreeCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFourCompleted ? 5 : 4;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageFourProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFourCompleted;
    this.stageFourEligible = eligible;
    this.stageFourCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 5;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  private renderProgress(): void {
    const completed = this.stageOneCompleted;
    this.element.classList.toggle('has-stage-one-complete', completed);
    this.element.classList.toggle('has-stage-two-complete', this.stageTwoCompleted);
    this.element.classList.toggle('has-stage-three-complete', this.stageThreeCompleted);
    this.element.classList.toggle('has-stage-four-complete', this.stageFourCompleted);
    this.stageButtons.forEach((button, index) => {
      const number = index + 1;
      const reached = number === 1 || number === 2 && completed || number === 3 && this.stageTwoCompleted || number === 4 && this.stageThreeCompleted || number === 5 && this.stageFourCompleted;
      button.classList.toggle('is-locked', !reached);
      button.classList.toggle('is-completed', number === 1 && completed || number === 2 && this.stageTwoCompleted || number === 3 && this.stageThreeCompleted || number === 4 && this.stageFourCompleted);
      button.classList.toggle('is-current', number === 1 && !completed);
      button.classList.toggle('is-next', number === 2 && completed && !this.stageTwoCompleted || number === 3 && this.stageTwoCompleted && !this.stageThreeCompleted || number === 4 && this.stageThreeCompleted && !this.stageFourCompleted || number === 5 && this.stageFourCompleted);
      button.classList.toggle('is-selected', number === this.selectedStage);
      button.setAttribute('aria-pressed', String(number === this.selectedStage));
      if (number === 1) button.dataset.progressLabel = this.stageOneEligible ? 'CURRENT MISSION' : 'START HERE';
      if (number === 2) button.dataset.progressLabel = 'CURRENT MISSION';
      if (number === 3) button.dataset.progressLabel = this.stageThreeCompleted ? 'COMPLETED' : 'CURRENT MISSION';
      if (number === 4) button.dataset.progressLabel = this.stageFourCompleted ? 'COMPLETED' : 'CURRENT MISSION';
      if (number === 5) button.dataset.progressLabel = 'NEXT · COMING SOON';
      button.setAttribute('aria-label', number === 1
        ? completed ? 'Mission 1, completed, select to replay or preview' : this.stageOneEligible ? 'Mission 1, current mission, select to preview' : 'Mission 1, starting preview, select for details'
        : number === 2 && reached ? this.stageTwoCompleted ? 'Mission 2, completed, select to replay or preview' : 'Mission 2, current mission, select to play'
          : number === 3 && reached ? this.stageThreeCompleted ? 'Mission 3, completed, select to replay or preview' : 'Mission 3, current mission, select to play'
            : number === 4 && reached ? this.stageFourCompleted ? 'Mission 4, completed, select to replay or preview' : 'Mission 4, current mission, select to play'
              : number === 5 && reached ? 'Mission 5, next mission preview, coming soon' : `Mission ${number}, locked, select to preview`);
      const lock = button.querySelector('small');
      if (lock) lock.hidden = reached;
    });
    this.renderDetails();
  }

  celebrateStageOne(): void {
    this.select(1, false);
    this.setPanelOpen(false);
    this.stageButtons[0]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[0]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(2);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageTwo(): void { this.select(2); }

  celebrateStageTwo(): void {
    this.select(2, false);
    this.setPanelOpen(false);
    this.stageButtons[1]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-two');
    window.setTimeout(() => {
      this.stageButtons[1]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-two');
      if (this.isOpen) this.select(3);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageThree(): void { this.select(3); }

  celebrateStageThree(): void {
    this.select(3, false);
    this.setPanelOpen(false);
    this.stageButtons[2]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-three');
    window.setTimeout(() => {
      this.stageButtons[2]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-three');
      if (this.isOpen) this.select(4);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageFour(): void { this.select(4); }

  celebrateStageFour(): void {
    this.select(4, false);
    this.setPanelOpen(false);
    this.stageButtons[3]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-four');
    window.setTimeout(() => {
      this.stageButtons[3]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-four');
      if (this.isOpen) this.select(5);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageFive(): void { this.select(5); }

  show(panelOpen = false): void {
    this.element.hidden = false;
    this.element.classList.toggle('is-paused', document.hidden);
    this.setPanelOpen(panelOpen);
    this.revealSelectedStage();
  }

  hide(): void {
    this.element.hidden = true;
    this.detailCard.getAnimations().forEach(animation => animation.cancel());
  }

  closePanel(): void {
    if (!this.panelOpen) return;
    this.setPanelOpen(false);
    this.stageButtons[this.selectedStage - 1]?.focus({ preventScroll: true });
  }

  private setPanelOpen(open: boolean): void {
    this.panelOpen = open;
    this.element.classList.toggle('is-panel-open', open);
    this.detail.inert = !open;
    this.detail.setAttribute('aria-hidden', String(!open));
  }

  private select(number: number, animate = true, userSelected = false): void {
    const stage = missionJourneyStages[number - 1];
    if (!stage) return;
    if (userSelected) { this.userSelectedStage = true; hapticsManager.emit('selection'); }
    this.selectedStage = number;
    this.stageButtons.forEach((button, index) => {
      const selected = index === number - 1;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    this.renderDetails();
    if (!this.panelOpen && animate) {
      this.setPanelOpen(true);
      this.onPanelOpen();
    } else if (animate && this.isOpen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.detailCard.getAnimations().forEach(animation => animation.cancel());
      this.detailCard.animate([{ opacity: .75, transform: 'translateX(7px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 220, easing: 'ease-out' });
    }
    if (animate && this.isOpen) this.revealSelectedStage();
  }

  private renderDetails(): void {
    const stage = missionJourneyStages[this.selectedStage - 1]!;
    const first = stage.number === 1;
    const second = stage.number === 2;
    const third = stage.number === 3;
    const fourth = stage.number === 4;
    const fifth = stage.number === 5;
    const locked = !first && !(second && this.stageOneCompleted) && !(third && this.stageTwoCompleted) && !(fourth && this.stageThreeCompleted) && !(fifth && this.stageFourCompleted);
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent =
      `MISSION ${String(stage.number).padStart(2, '0')}${stage.number <= 5 ? ' · ROOKIE LEAGUE' : ''}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = first ? 'DFW SKY RUSH' : second ? 'HUNTER SHOWDOWN' : third ? 'WHITE ROCK SKIMMER' : fourth ? 'CLAIM THE SKIES' : fifth ? 'DOWNTOWN NEEDLE' : '';
    const status = this.detail.querySelector<HTMLElement>('[data-mission-status]')!;
    status.textContent = first
      ? this.stageOneCompleted ? 'COMPLETED' : this.stageOneEligible ? 'CURRENT MISSION' : 'PREVIEW'
      : second ? this.stageTwoCompleted ? 'COMPLETED' : this.stageTwoEligible ? 'CURRENT MISSION' : 'LOCKED'
        : third ? this.stageThreeCompleted ? 'COMPLETED' : this.stageThreeEligible ? 'CURRENT MISSION' : 'LOCKED'
        : fourth ? this.stageFourCompleted ? 'COMPLETED' : this.stageFourEligible ? 'CURRENT MISSION' : 'LOCKED'
          : locked ? 'LOCKED' : 'COMING SOON';
    status.classList.toggle('is-locked', locked);
    this.detail.querySelector<HTMLElement>('[data-mission-type]')!.textContent = first ? 'SPEED CHALLENGE'
      : second ? 'AIR COMBAT' : third ? 'LOW-ALTITUDE CHALLENGE' : fourth ? 'TERRITORY CONTROL' : `CHAPTER ${stage.chapter} · ${chapterNames[stage.chapter - 1]}`;
    this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = first
      ? 'Take off from DFW and fly through all 4 glowing gates before time runs out!'
      : second ? 'Take off from DFW, find the marked AI Hunter, and defeat it in an aerial battle!'
        : third ? 'Take off from Love Field and fly through 4 glowing gates near White Rock Lake. Stay below the altitude limits and beat the clock!'
          : fourth ? 'Fly to White Rock, take control of its airspace, and defend it for 30 seconds!'
          : fifth && !locked ? 'Your next flight challenge is being prepared.'
        : locked ? 'Complete earlier missions to reach this stage. Mission details are coming soon.'
          : 'Your next flight challenge is being prepared.';
    const facts = this.detail.querySelector<HTMLElement>('[data-mission-facts]')!;
    facts.hidden = !(first || second || third || fourth);
    if (first) facts.innerHTML = '<span>START: DFW RUNWAY</span><span>CHECKPOINTS: 4 GATES</span><span>RACE TIME: 1:02</span><span>RECOMMENDED: BLUEJAY</span><span>FIRST-CLEAR REWARD: 250 CREDITS</span>';
    if (second) facts.innerHTML = `<span>START: DFW RUNWAY</span><span>TARGET: 1 AI HUNTER</span><span>ENEMY HEALTH: 200 HP</span><span>TIME LIMIT: NONE</span><span>RECOMMENDED AIRCRAFT: BLUEJAY</span><span>${this.stageTwoCompleted ? 'FIRST-CLEAR REWARD: CLAIMED' : 'FIRST-CLEAR REWARD: 350 CREDITS'}</span>`;
    if (third) facts.innerHTML = `<span>START: DALLAS LOVE FIELD</span><span>CHECKPOINTS: 4 GATES</span><span>TIME LIMIT: 1:04</span><span>AIRCRAFT: BLUEJAY RECOMMENDED</span><span>${this.stageThreeCompleted ? 'FIRST-CLEAR REWARD: CLAIMED' : 'FIRST-CLEAR REWARD: 450 CREDITS'}</span>`;
    if (fourth) facts.innerHTML = `<span>START: LOVE FIELD</span><span>TARGET: WHITE ROCK</span><span>OBJECTIVE: CAPTURE + HOLD</span><span>HOLD TIME: 30 SECONDS</span><span>TIME LIMIT: NONE</span><span>RECOMMENDED: BLUEJAY</span><span>${this.stageFourCompleted ? 'FIRST-CLEAR REWARD: CLAIMED' : 'FIRST-CLEAR REWARD: 500 CREDITS'}</span>`;
    this.detail.querySelector<HTMLElement>('[data-mission-caption]')!.textContent = fourth ? 'WHITE ROCK GAMEPLAY IMAGE PENDING' : first || second ? 'DFW GAMEPLAY PREVIEW' : 'DALLAS CITY PREVIEW';
    this.detail.querySelector<HTMLElement>('.mission-journey-preview > div')!.setAttribute('aria-label', fourth ? 'White Rock gameplay image pending' : first || second ? 'DFW gameplay preview' : 'Dallas city aviation preview');
    const preview = this.detail.querySelector<HTMLElement>('.mission-journey-preview')!;
    preview.classList.toggle('is-dfw-preview', first || second);
    preview.classList.toggle('is-territory-preview-pending', fourth);
    const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    play.disabled = first ? !this.stageOneEligible : second ? !this.stageTwoEligible : third ? !this.stageThreeEligible : fourth ? !this.stageFourEligible : true;
    play.textContent = first
      ? this.stageOneEligible ? this.stageOneCompleted ? 'REPLAY MISSION' : 'PLAY MISSION' : 'PLAY UNAVAILABLE'
      : second ? this.stageTwoEligible ? this.stageTwoCompleted ? 'REPLAY MISSION' : 'PLAY MISSION' : 'MISSION LOCKED'
        : third ? this.stageThreeEligible ? this.stageThreeCompleted ? 'REPLAY MISSION' : 'PLAY MISSION' : 'MISSION LOCKED'
        : fourth ? this.stageFourEligible ? this.stageFourCompleted ? 'REPLAY MISSION' : 'PLAY MISSION' : 'MISSION LOCKED'
          : locked ? 'MISSION LOCKED' : 'MISSION COMING SOON';
  }

  private revealSelectedStage(): void {
    if (this.board.scrollWidth <= this.board.clientWidth && this.board.scrollHeight <= this.board.clientHeight) return;
    const button = this.stageButtons[this.selectedStage - 1];
    if (!button) return;
    this.board.scrollTo({
      left: button.offsetLeft - this.board.clientWidth / 2,
      top: button.offsetTop - this.board.clientHeight / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
}
