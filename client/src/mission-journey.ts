import './mission-journey.css';
import { hapticsManager } from './haptics-manager';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09 } from '../../shared/journey-mission.mjs';

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

type FactIcon = 'location' | 'gate' | 'timer' | 'target' | 'health' | 'capture' | 'landing';
type MissionFact = Readonly<{ icon: FactIcon; label: string }>;
type MissionCard = Readonly<{ title: string; objective: string; facts: readonly [MissionFact, MissionFact, MissionFact]; reward: number }>;
const seconds = (milliseconds: number): string => `${milliseconds / 1000} SEC`;
const missionCards: readonly MissionCard[] = [
  { title: journeyDallas01.name, objective: 'Take off. Fly through 4 glowing gates. Beat the clock!', facts: [{ icon: 'location', label: 'DFW' }, { icon: 'gate', label: `${journeyDallas01.gates.length} GATES` }, { icon: 'timer', label: seconds(journeyDallas01.timeLimitMs) }], reward: journeyDallas01.firstClearCredits },
  { title: journeyDallas02.name, objective: 'Find the marked AI Hunter and defeat it!', facts: [{ icon: 'location', label: 'DFW' }, { icon: 'target', label: '1 HUNTER' }, { icon: 'health', label: `${journeyDallas02.targetHealth} HP` }], reward: journeyDallas02.firstClearCredits },
  { title: journeyDallas03.name, objective: 'Fly through 4 low-altitude gates before time runs out!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: `${journeyDallas03.gates.length} GATES` }, { icon: 'timer', label: seconds(journeyDallas03.timeLimitMs) }], reward: journeyDallas03.firstClearCredits },
  { title: journeyDallas04.name, objective: 'Capture White Rock and hold control for 30 seconds!', facts: [{ icon: 'location', label: 'WHITE ROCK' }, { icon: 'capture', label: 'CAPTURE' }, { icon: 'timer', label: `HOLD ${seconds(journeyDallas04.holdMs)}` }], reward: journeyDallas04.firstClearCredits },
  { title: journeyDallas05.name, objective: 'Fly accurately through 4 narrow downtown gates!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: `${journeyDallas05.gates.length} GATES` }, { icon: 'timer', label: seconds(journeyDallas05.timeLimitMs) }], reward: journeyDallas05.firstClearCredits },
  { title: journeyDallas06.name, objective: 'Fly through 6 glowing gates, then make a smooth landing!', facts: [{ icon: 'gate', label: `${journeyDallas06.gates.length} GATES` }, { icon: 'timer', label: '2:00 RACE' }, { icon: 'landing', label: 'SMOOTH LANDING' }], reward: journeyDallas06.firstClearCredits },
  { title: journeyDallas07.name, objective: 'Climb through 4 glowing gates. Reach the highest gate before time runs out!', facts: [{ icon: 'location', label: 'ADDISON' }, { icon: 'gate', label: `${journeyDallas07.gates.length} GATES` }, { icon: 'timer', label: seconds(journeyDallas07.timeLimitMs) }], reward: journeyDallas07.firstClearCredits },
  { title: journeyDallas08.name, objective: 'Get behind the AI aircraft and follow it for 15 seconds!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'target', label: 'FOLLOW AI' }, { icon: 'timer', label: seconds(journeyDallas08.followMs) }], reward: journeyDallas08.firstClearCredits },
  { title: journeyDallas09.name, objective: 'Your aircraft is damaged! Escape the Hunter and reach the glowing Repair Heart!', facts: [{ icon: 'location', label: 'DFW' }, { icon: 'health', label: '60% HEALTH' }, { icon: 'target', label: 'REPAIR HEART' }], reward: journeyDallas09.firstClearCredits },
];
const factIcons: Readonly<Record<FactIcon, string>> = {
  location: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  gate: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  health: '<path d="M12 22s-8-4.6-8-11V5l8-3 8 3v6c0 6.4-8 11-8 11Z"/><path d="M8 12h8m-4-4v8"/>',
  capture: '<path d="M5 22V3m0 1c5-3 9 3 15 0v11c-6 3-10-3-15 0"/>',
  landing: '<path d="M2 19h20M5 15l7 3 7-3M12 3v13m-3-3 3 3 3-3"/>',
};
const stagePositions: readonly (readonly [number, number])[] = [
  [92, 239], [172, 247], [251, 267], [328, 297], [403, 320], [480, 325],
  [407, 100], [486, 100], [565, 108], [639, 120], [703, 128], [770, 136],
  [620, 258], [698, 258], [840, 204], [776, 264], [844, 279], [917, 282],
  [616, 367], [677, 398], [740, 409], [807, 423], [872, 432], [936, 432],
];

export const missionJourneyStages: readonly MissionJourneyStage[] = stagePositions.map(([x, y], index) => ({
  id: index < 9 ? `journey-dallas-0${index + 1}` : `dallas-mission-${String(index + 1).padStart(2, '0')}`,
  number: index + 1,
  chapter: (Math.floor(index / 6) + 1) as ChapterNumber,
  implementation: index < 9 ? 'playable' : 'planned',
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
            <div class="mission-journey-chapter mission-journey-chapter-2"><strong>CHAPTER 2</strong><span>SKY ADVENTURES</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-3"><strong>CHAPTER 3</strong><span>HIGHER GROUND</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-4"><strong>CHAPTER 4</strong><span>FINAL APPROACH</span></div>
            <div class="mission-journey-nodes" aria-label="Dallas mission stages"></div>
          </div>
        </div>
        <aside class="mission-journey-detail" aria-label="Selected mission details" aria-hidden="true" aria-live="polite">
          <div class="mission-journey-detail-card">
            <div class="mission-journey-detail-top"><span data-mission-index>MISSION 01</span><span class="mission-journey-status" data-mission-status>COMING SOON</span><button type="button" class="mission-journey-detail-close" aria-label="Close mission details" data-mission-close>×</button></div>
            <h2 class="mission-journey-mission-title" data-mission-title></h2>
            <p class="mission-journey-objective" data-mission-objective></p>
            <div class="mission-journey-facts" data-mission-facts hidden></div>
            <p class="mission-journey-reward" data-mission-reward hidden></p>
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
    const fifthCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    fifthCompletedRoute.setAttribute('d', routePath(missionJourneyStages.slice(4, 6)));
    fifthCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-five');
    route.append(fifthCompletedRoute);
    const sixthCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    sixthCompletedRoute.setAttribute('d', 'M 480 325 C 515 245, 395 205, 407 100');
    sixthCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-six');
    route.append(sixthCompletedRoute);
    const seventhCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    seventhCompletedRoute.setAttribute('d', routePath(missionJourneyStages.slice(6, 8)));
    seventhCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-seven');
    route.append(seventhCompletedRoute);
    const eighthCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    eighthCompletedRoute.setAttribute('d', routePath(missionJourneyStages.slice(7, 9)));
    eighthCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-eight');
    route.append(eighthCompletedRoute);
    const ninthCompletedRoute = completedRoute.cloneNode() as SVGPathElement;
    ninthCompletedRoute.setAttribute('d', routePath(missionJourneyStages.slice(8, 10)));
    ninthCompletedRoute.setAttribute('class', 'mission-journey-route-completed mission-journey-route-completed-nine');
    route.append(ninthCompletedRoute);
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
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : this.stageFourCompleted ? 5 : this.stageThreeCompleted ? 4 : this.stageTwoCompleted ? 3 : 2;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageTwoProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwoCompleted;
    this.stageTwoEligible = eligible;
    this.stageTwoCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : this.stageFourCompleted ? 5 : this.stageThreeCompleted ? 4 : 3;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageThreeProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageThreeCompleted;
    this.stageThreeEligible = eligible;
    this.stageThreeCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : this.stageFourCompleted ? 5 : 4;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageFourProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFourCompleted;
    this.stageFourEligible = eligible;
    this.stageFourCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = this.stageFiveCompleted ? 6 : 5;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageFiveProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFiveCompleted;
    this.stageFiveEligible = eligible;
    this.stageFiveCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 6;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageSixProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSixCompleted;
    this.stageSixEligible = eligible;
    this.stageSixCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 7;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageSevenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSevenCompleted;
    this.stageSevenEligible = eligible;
    this.stageSevenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 8;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageEightProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageEightCompleted;
    this.stageEightEligible = eligible;
    this.stageEightCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 9;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageNineProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageNineCompleted;
    this.stageNineEligible = eligible;
    this.stageNineCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 10;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  private renderProgress(): void {
    const completed = this.stageOneCompleted;
    this.element.classList.toggle('has-stage-one-complete', completed);
    this.element.classList.toggle('has-stage-two-complete', this.stageTwoCompleted);
    this.element.classList.toggle('has-stage-three-complete', this.stageThreeCompleted);
    this.element.classList.toggle('has-stage-four-complete', this.stageFourCompleted);
    this.element.classList.toggle('has-stage-five-complete', this.stageFiveCompleted);
    this.element.classList.toggle('has-stage-six-complete', this.stageSixCompleted);
    this.element.classList.toggle('has-stage-seven-complete', this.stageSevenCompleted);
    this.element.classList.toggle('has-stage-eight-complete', this.stageEightCompleted);
    this.element.classList.toggle('has-stage-nine-complete', this.stageNineCompleted);
    this.stageButtons.forEach((button, index) => {
      const number = index + 1;
      const reached = number === 1 || number === 2 && completed || number === 3 && this.stageTwoCompleted || number === 4 && this.stageThreeCompleted || number === 5 && this.stageFourCompleted || number === 6 && this.stageFiveCompleted || number === 7 && this.stageSixCompleted || number === 8 && this.stageSevenCompleted || number === 9 && this.stageEightCompleted || number === 10 && this.stageNineCompleted;
      button.classList.toggle('is-locked', !reached);
      button.classList.toggle('is-completed', number === 1 && completed || number === 2 && this.stageTwoCompleted || number === 3 && this.stageThreeCompleted || number === 4 && this.stageFourCompleted || number === 5 && this.stageFiveCompleted || number === 6 && this.stageSixCompleted || number === 7 && this.stageSevenCompleted || number === 8 && this.stageEightCompleted || number === 9 && this.stageNineCompleted);
      button.classList.toggle('is-current', number === 1 && !completed);
      button.classList.toggle('is-next', number === 2 && completed && !this.stageTwoCompleted || number === 3 && this.stageTwoCompleted && !this.stageThreeCompleted || number === 4 && this.stageThreeCompleted && !this.stageFourCompleted || number === 5 && this.stageFourCompleted && !this.stageFiveCompleted || number === 6 && this.stageFiveCompleted && !this.stageSixCompleted || number === 7 && this.stageSixCompleted && !this.stageSevenCompleted || number === 8 && this.stageSevenCompleted && !this.stageEightCompleted || number === 9 && this.stageEightCompleted && !this.stageNineCompleted || number === 10 && this.stageNineCompleted);
      button.classList.toggle('is-selected', number === this.selectedStage);
      button.setAttribute('aria-pressed', String(number === this.selectedStage));
      if (number === 1) button.dataset.progressLabel = this.stageOneEligible ? 'CURRENT MISSION' : 'START HERE';
      if (number === 2) button.dataset.progressLabel = 'CURRENT MISSION';
      if (number === 3) button.dataset.progressLabel = this.stageThreeCompleted ? 'COMPLETED' : 'CURRENT MISSION';
      if (number === 4) button.dataset.progressLabel = this.stageFourCompleted ? 'COMPLETED' : 'CURRENT MISSION';
      if (number === 5) button.dataset.progressLabel = this.stageFiveCompleted ? 'COMPLETED' : 'CURRENT MISSION';
      if (number === 6) button.dataset.progressLabel = this.stageSixCompleted ? 'COMPLETED' : 'CURRENT MISSION';
      if (number === 7) button.dataset.progressLabel = this.stageSevenCompleted ? 'COMPLETED' : this.stageSevenEligible ? 'CURRENT MISSION' : 'LOCKED';
      if (number === 8) button.dataset.progressLabel = this.stageEightCompleted ? 'COMPLETED' : this.stageEightEligible ? 'CURRENT MISSION' : 'LOCKED';
      if (number === 9) button.dataset.progressLabel = this.stageNineCompleted ? 'COMPLETED' : this.stageNineEligible ? 'CURRENT MISSION' : 'LOCKED';
      if (number === 10) button.dataset.progressLabel = this.stageNineCompleted ? 'NEXT · COMING SOON' : 'LOCKED';
      button.setAttribute('aria-label', number === 1
        ? completed ? 'Mission 1, completed, select to replay or preview' : this.stageOneEligible ? 'Mission 1, current mission, select to preview' : 'Mission 1, starting preview, select for details'
        : number === 2 && reached ? this.stageTwoCompleted ? 'Mission 2, completed, select to replay or preview' : 'Mission 2, current mission, select to play'
          : number === 3 && reached ? this.stageThreeCompleted ? 'Mission 3, completed, select to replay or preview' : 'Mission 3, current mission, select to play'
            : number === 4 && reached ? this.stageFourCompleted ? 'Mission 4, completed, select to replay or preview' : 'Mission 4, current mission, select to play'
              : number === 5 && reached ? this.stageFiveCompleted ? 'Mission 5, completed, select to replay or preview' : 'Mission 5, current mission, select to play'
                : number === 6 && reached ? this.stageSixCompleted ? 'Mission 6, completed, select to replay or preview' : 'Mission 6, current mission, select to play'
                  : number === 7 && reached ? this.stageSevenCompleted ? 'Mission 7, completed, select to replay or preview' : 'Mission 7, current mission, select to play'
                    : number === 8 && reached ? this.stageEightCompleted ? 'Mission 8, completed, select to replay or preview' : 'Mission 8, current mission, select to play'
                      : number === 9 && reached ? this.stageNineCompleted ? 'Mission 9, completed, select to replay or preview' : 'Mission 9, current mission, select to play'
                        : number === 10 && reached ? 'Mission 10, next mission preview, coming soon' : `Mission ${number}, locked, select to preview`);
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

  celebrateStageFive(): void {
    this.select(5, false);
    this.setPanelOpen(false);
    this.stageButtons[4]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-five');
    window.setTimeout(() => {
      this.stageButtons[4]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-five');
      if (this.isOpen) this.select(6);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageSix(): void { this.select(6); }

  celebrateStageSix(): void {
    this.select(6, false);
    this.setPanelOpen(false);
    this.stageButtons[5]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-six');
    window.setTimeout(() => {
      this.stageButtons[5]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-six');
      if (this.isOpen) this.select(7);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageSeven(): void { this.select(7); }

  celebrateStageSeven(): void {
    this.select(7, false);
    this.setPanelOpen(false);
    this.stageButtons[6]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-seven');
    window.setTimeout(() => {
      this.stageButtons[6]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-seven');
      if (this.isOpen) this.select(8);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageEight(): void { this.select(8); }

  celebrateStageEight(): void {
    this.select(8, false);
    this.setPanelOpen(false);
    this.stageButtons[7]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-eight');
    window.setTimeout(() => {
      this.stageButtons[7]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-eight');
      if (this.isOpen) this.select(9);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageNine(): void { this.select(9); }

  celebrateStageNine(): void {
    this.select(9, false);
    this.setPanelOpen(false);
    this.stageButtons[8]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-nine');
    window.setTimeout(() => {
      this.stageButtons[8]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-nine');
      if (this.isOpen) this.select(10);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageTen(): void { this.select(10); }

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
    const card = missionCards[stage.number - 1];
    const completed = [this.stageOneCompleted, this.stageTwoCompleted, this.stageThreeCompleted, this.stageFourCompleted, this.stageFiveCompleted, this.stageSixCompleted, this.stageSevenCompleted, this.stageEightCompleted, this.stageNineCompleted][stage.number - 1] === true;
    const eligible = [this.stageOneEligible, this.stageTwoEligible, this.stageThreeEligible, this.stageFourEligible, this.stageFiveEligible, this.stageSixEligible, this.stageSevenEligible, this.stageEightEligible, this.stageNineEligible][stage.number - 1] === true;
    const reached = stage.number === 10 && this.stageNineCompleted;
    const locked = (!card && !reached) || (!!card && !eligible && !completed);
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${String(stage.number).padStart(2, '0')}${stage.number === 6 ? ' · CHAPTER 1 FINALE' : stage.number >= 7 && stage.number <= 9 ? ' · CHAPTER 2' : ''}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = card?.title ?? (stage.number === 10 ? 'SKYLINE SLALOM' : 'MISSION COMING SOON');
    const status = this.detail.querySelector<HTMLElement>('[data-mission-status]')!;
    status.textContent = completed ? 'COMPLETED' : locked ? 'LOCKED' : card ? 'AVAILABLE' : 'COMING SOON';
    status.classList.toggle('is-locked', locked);
    this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = card?.objective ?? (locked ? 'Complete earlier missions to unlock this stage. Details are coming soon.' : 'Your next challenge is being prepared.');
    const facts = this.detail.querySelector<HTMLElement>('[data-mission-facts]')!;
    facts.hidden = !card;
    facts.replaceChildren();
    for (const fact of card?.facts ?? []) {
      const item = document.createElement('div');
      item.className = 'mission-journey-fact';
      item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${factIcons[fact.icon]}</svg>`;
      const label = document.createElement('span');
      label.textContent = fact.label;
      item.append(label);
      facts.append(item);
    }
    const reward = this.detail.querySelector<HTMLElement>('[data-mission-reward]')!;
    reward.hidden = !card;
    reward.textContent = card ? `${card.reward} CREDITS${completed ? ' · CLAIMED' : ''}` : '';
    const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    play.disabled = !card || !eligible;
    play.textContent = !card ? locked ? 'LOCKED' : 'COMING SOON' : completed ? 'REPLAY MISSION' : !eligible ? 'LOCKED' : 'PLAY MISSION';
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
