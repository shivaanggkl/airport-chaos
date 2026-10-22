import './mission-journey.css';
import './context-page-shell.css';
import { hapticsManager } from './haptics-manager';
import { createLockIcon } from './lock-icon';
import { chapterNames, missionJourneyStages, missionJourneyStatuses } from './mission-journey-model';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';
export { missionJourneyStages } from './mission-journey-model';
export type { MissionJourneyStage } from './mission-journey-model';

type FactIcon = 'location' | 'gate' | 'timer' | 'target' | 'health' | 'capture' | 'landing';
type MissionFact = Readonly<{ icon: FactIcon; label: string }>;
type MissionCard = Readonly<{ title: string; objective: string; facts: readonly [MissionFact, MissionFact, MissionFact]; reward: number }>;
const seconds = (milliseconds: number): string => `${milliseconds / 1000} SEC`;
const missionCards: readonly MissionCard[] = [
  { title: journeyDallas01.name, objective: 'Fly through 10 gates before time runs out.', facts: [{ icon: 'location', label: 'LOVE FIELD / TRINITY' }, { icon: 'gate', label: `${journeyDallas01.gates.length} GATES` }, { icon: 'timer', label: '2:30 RACE' }], reward: journeyDallas01.firstClearCredits },
  { title: journeyDallas02.name, objective: 'Fly through 10 gates before time runs out.', facts: [{ icon: 'location', label: 'WHITE ROCK LAKE' }, { icon: 'gate', label: `${journeyDallas02.gates.length} GATES` }, { icon: 'timer', label: '2:30 RACE' }], reward: journeyDallas02.firstClearCredits },
  { title: journeyDallas03.name, objective: 'Fly through 10 gates before time runs out.', facts: [{ icon: 'location', label: 'DALLAS SKYLINE' }, { icon: 'gate', label: `${journeyDallas03.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas03.firstClearCredits },
  { title: journeyDallas04.name, objective: 'Fly through 10 gates before time runs out.', facts: [{ icon: 'location', label: 'DOWNTOWN' }, { icon: 'gate', label: `${journeyDallas04.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas04.firstClearCredits },
  { title: journeyDallas05.name, objective: 'Fly through 10 narrow gates before time runs out.', facts: [{ icon: 'location', label: 'TRINITY RIVER' }, { icon: 'gate', label: `${journeyDallas05.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas05.firstClearCredits },
  { title: journeyDallas06.name, objective: 'Fly through 10 gates before time runs out.', facts: [{ icon: 'location', label: 'CENTRAL DALLAS' }, { icon: 'gate', label: `${journeyDallas06.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas06.firstClearCredits },
  { title: journeyDallas07.name, objective: 'Shoot down the transport before it leaves Dallas.', facts: [{ icon: 'location', label: 'DFW RUNWAY' }, { icon: 'target', label: 'GIANT TRANSPORT' }, { icon: 'timer', label: `${Math.ceil(journeyDallas07.timeLimitMs / 1000)} SEC TO EXIT` }], reward: journeyDallas07.firstClearCredits },
  { title: journeyDallas08.name, objective: 'Destroy the transport before it escapes Dallas.', facts: [{ icon: 'location', label: 'DFW RUNWAY' }, { icon: 'target', label: '2 FIGHTER ESCORTS' }, { icon: 'timer', label: '5:00 TO ESCAPE' }], reward: journeyDallas08.firstClearCredits },
  { title: journeyDallas09.name, objective: 'Escape the Hunter and reach the Repair Heart.', facts: [{ icon: 'location', label: 'DFW' }, { icon: 'health', label: '60% HEALTH' }, { icon: 'target', label: 'REPAIR HEART' }], reward: journeyDallas09.firstClearCredits },
  { title: journeyDallas10.name, objective: 'Fly through 5 zigzag gates before time runs out.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '5 GATES' }, { icon: 'timer', label: seconds(journeyDallas10.timeLimitMs) }], reward: journeyDallas10.firstClearCredits },
  { title: journeyDallas11.name, objective: 'Dive through 4 gates, then climb through the last.', facts: [{ icon: 'location', label: 'HIGH-ALTITUDE START' }, { icon: 'gate', label: '5 GATES' }, { icon: 'timer', label: seconds(journeyDallas11.timeLimitMs) }], reward: journeyDallas11.firstClearCredits },
  { title: journeyDallas12.name, objective: 'Climb through 3 gates, then dive through 3.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '6 GATES' }, { icon: 'timer', label: seconds(journeyDallas12.timeLimitMs) }], reward: journeyDallas12.firstClearCredits },
  { title: journeyDallas13.name, objective: 'Fly through 5 speed gates before time runs out.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '5 SPEED GATES' }, { icon: 'timer', label: seconds(journeyDallas13.timeLimitMs) }], reward: journeyDallas13.firstClearCredits },
  { title: journeyDallas14.name, objective: 'Stay at least 450 m from the Hunter for 10 seconds.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'target', label: '450 M ESCAPE' }, { icon: 'timer', label: '10 SEC HOLD' }], reward: journeyDallas14.firstClearCredits },
  { title: journeyDallas15.name, objective: 'Shoot down the Ace.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'health', label: '300 HP BOSS' }, { icon: 'target', label: 'AIR COMBAT' }], reward: journeyDallas15.firstClearCredits },
  { title: journeyDallas16.name, objective: 'Fly through 5 gates while escaping two Hunters.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '5 GATES' }, { icon: 'target', label: '2 HUNTERS' }], reward: journeyDallas16.firstClearCredits },
  { title: journeyDallas17.name, objective: 'Repair your plane, then land at DFW with 780+ points.', facts: [{ icon: 'health', label: '45% HEALTH' }, { icon: 'target', label: 'REPAIR HEART' }, { icon: 'landing', label: 'LAND 780+' }], reward: journeyDallas17.firstClearCredits },
  { title: journeyDallas18.name, objective: 'Capture the area, then defend it for 40 seconds.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'capture', label: 'CAPTURE & DEFEND' }, { icon: 'timer', label: '40 SEC HOLD' }], reward: journeyDallas18.firstClearCredits },
  { title: journeyDallas19.name, objective: 'Destroy the monster before time runs out.', facts: [{ icon: 'location', label: 'AIRBORNE START' }, { icon: 'timer', label: '2:30 LIMIT' }, { icon: 'target', label: '1 MONSTER' }], reward: journeyDallas19.firstClearCredits },
  { title: journeyDallas20.name, objective: 'Fly through 6 high and low gates before time runs out.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '6 GATES' }, { icon: 'timer', label: seconds(journeyDallas20.timeLimitMs) }], reward: journeyDallas20.firstClearCredits },
  { title: journeyDallas21.name, objective: 'Capture both areas before time runs out.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'capture', label: '2 TERRITORIES' }, { icon: 'timer', label: '120 SEC TRANSFER' }], reward: journeyDallas21.firstClearCredits },
  { title: journeyDallas22.name, objective: 'Fly through 3 gates, then make a perfect landing.', facts: [{ icon: 'location', label: 'DFW APPROACH' }, { icon: 'gate', label: '3 GATES' }, { icon: 'landing', label: 'PERFECT LANDING' }], reward: journeyDallas22.firstClearCredits },
  { title: journeyDallas23.name, objective: 'Defeat two Hunters. Repair between fights.', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'target', label: '2 HUNTERS' }, { icon: 'health', label: 'REPAIR HEART' }], reward: journeyDallas23.firstClearCredits },
  { title: journeyDallas24.name, objective: 'Fly through 3 gates, defeat the Ace, and land perfectly.', facts: [{ icon: 'gate', label: '3 GATES' }, { icon: 'health', label: '300 HP ACE' }, { icon: 'landing', label: 'PERFECT LANDING' }], reward: journeyDallas24.firstClearCredits },
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
export class MissionJourney {
  private readonly detail: HTMLElement;
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
      <div class="mission-journey-map" aria-label="Dallas missions, four chapters">
        <svg class="mission-journey-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="mission-journey-chapters" aria-hidden="true"></div>
        <div class="mission-journey-nodes" aria-label="Choose a mission"></div>
      </div>
      <div class="mission-journey-detail" aria-label="Selected mission details" aria-live="polite">
        <img class="mission-journey-detail-image" src="/media/city-journey/mission-dallas-journey.avif" alt="Dallas mission artwork">
        <div class="mission-journey-detail-copy"><strong><span data-mission-index>MISSION 01</span> · <span data-mission-title></span></strong><p data-mission-objective></p></div>
        <span class="mission-journey-reward" data-mission-reward role="img"><img src="/media/hub/credits.avif" alt="" aria-hidden="true"><strong data-mission-reward-amount></strong><small data-mission-reward-claimed hidden aria-hidden="true">✓</small></span>
        <button type="button" class="mission-journey-play" data-mission-play disabled>PLAY MISSION ▶</button>
      </div>`;
    this.detail = element.querySelector('.mission-journey-detail')!;
    element.querySelector<HTMLButtonElement>('[data-mission-play]')!.addEventListener('click', () => {
      if (this.progressingFrom !== null) return;
      if (this.stageButtons[this.selectedStage - 1]?.disabled) return;
      hapticsManager.emit('confirmation'); onPlayMission();
    });
    const chapters = element.querySelector<HTMLElement>('.mission-journey-chapters')!;
    for (let chapter = 1; chapter <= 4; chapter++) {
      const heading = document.createElement('div');
      heading.className = 'mission-journey-chapter-heading';
      heading.dataset.chapter = String(chapter);
      heading.innerHTML = `<strong>CHAPTER ${chapter}</strong><span>${chapterNames[chapter - 1]}</span>`;
      chapters.append(heading);
    }
    const routes = element.querySelector<SVGSVGElement>('.mission-journey-route')!;
    // The row turn follows the outer edge so it never crosses mission nodes.
    const rowTurn = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rowTurn.setAttribute('d', 'M 94 35 C 102 35 102 47 102 60 L 102 90 Q 102 98 94 98 L 12 98 Q 1 98 7 84');
    rowTurn.classList.add('mission-journey-segment', 'is-transition');
    rowTurn.dataset.from = '12';
    routes.append(rowTurn); this.routeSegments.push(rowTurn);
    for (let number = 1; number < missionJourneyStages.length; number++) {
      if (number === 12) continue;
      const from = missionJourneyStages[number - 1]!;
      const to = missionJourneyStages[number]!;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - (number % 6 === 0 ? 3 : 1.5);
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
    else if (statuses[this.selectedStage - 1] === 'locked') {
      this.userSelectedStage = false;
      this.selectedStage = this.currentMission || 1;
    }
    this.stageButtons.forEach((button, index) => {
      const number = index + 1;
      const status = this.progressingFrom === number - 1 ? 'locked' : statuses[index]!;
      button.classList.toggle('is-locked', status === 'locked');
      button.classList.toggle('is-completed', status === 'completed');
      button.classList.toggle('is-current', status === 'current');
      button.classList.toggle('is-selected', number === this.selectedStage);
      button.disabled = this.cityLocked || status === 'locked';
      button.setAttribute('aria-pressed', String(number === this.selectedStage));
      button.setAttribute('aria-label', `Mission ${number}, ${status === 'completed' ? 'completed, select to replay' : status === 'current' ? 'current mission' : status}`);
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

  celebrateCompletion(number: number, collectCredits?: (source: DOMRect) => number): void {
    if (!this.isOpen || !this.completedStages()[number - 1]) return;
    this.cancelProgressAnimation();
    const next = number + 1;
    if (this.currentMission !== next || !this.stageButtons[next - 1] || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.userSelectedStage = false;
      this.select(number);
      if (collectCredits) collectCredits(this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.getBoundingClientRect());
      this.select(this.currentMission || number);
      return;
    }

    const segment = this.routeSegments.find(path => Number(path.dataset.from) === number);
    if (!segment) {
      this.select(number);
      if (collectCredits) collectCredits(this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.getBoundingClientRect());
      this.select(next);
      return;
    }
    const map = this.element.querySelector<HTMLElement>('.mission-journey-map')!;
    const marker = document.createElement('span');
    marker.className = 'mission-journey-progress-marker';
    marker.setAttribute('aria-hidden', 'true');
    map.append(marker);
    this.progressMarker = marker;
    this.progressingFrom = number;
    this.userSelectedStage = false;
    this.element.classList.add('is-advancing');
    this.stageButtons[number - 1]?.classList.add('is-newly-completed');
    this.renderProgress();
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
        window.setTimeout(() => unlocked.classList.remove('is-newly-unlocked'), 850);
      }, 360);
    };
    if (creditFlightMs > 0) {
      this.progressStartTimer = window.setTimeout(() => {
        this.progressStartTimer = 0;
        if (this.progressingFrom === number && this.isOpen) this.progressAnimationFrame = window.requestAnimationFrame(animate);
      }, creditFlightMs);
    } else this.progressAnimationFrame = window.requestAnimationFrame(animate);
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
    this.userSelectedStage = false;
    this.renderProgress();
    this.panelOpen = false;
  }

  hide(): void { this.cancelProgressAnimation(); this.element.hidden = true; }
  closePanel(): void { this.panelOpen = false; }

  private setPanelOpen(_open: boolean): void { this.panelOpen = false; }

  private select(number: number, _animate = true, userSelected = false): void {
    const stage = missionJourneyStages[number - 1];
    if (!stage || userSelected && this.stageButtons[number - 1]?.disabled || userSelected && this.progressingFrom !== null) return;
    if (userSelected) { this.userSelectedStage = true; hapticsManager.emit('selection'); }
    this.selectedStage = number;
    this.renderProgress();
  }

  private renderDetails(): void {
    const stage = missionJourneyStages[this.selectedStage - 1];
    if (!stage) {
      this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = 'MISSIONS LOCKED';
      this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = '';
      this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = 'Complete earlier missions to unlock.';
      this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.hidden = true;
      this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!.hidden = true;
      return;
    }
    const card = missionCards[stage.number - 1]!;
    const completed = !this.cityLocked && this.completedStages()[stage.number - 1] === true;
    const eligible = this.isStageEligible(stage.number);
    const signInRequired = this.signInRequired && stage.number === 1 && !completed;
    const locked = this.cityLocked || (!completed && !eligible && !signInRequired);
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${String(stage.number).padStart(2, '0')}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = card.title;
    this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = this.cityLocked ? 'Complete Milwaukee training to unlock Dallas missions.' : locked ? `Complete Mission ${stage.number - 1} to unlock.` : card.objective;
    this.detail.querySelector<HTMLImageElement>('.mission-journey-detail-image')!.alt = `Dallas Mission ${stage.number} artwork`;
    const reward = this.detail.querySelector<HTMLElement>('[data-mission-reward]')!;
    reward.hidden = false;
    reward.setAttribute('aria-label', `${card.reward.toLocaleString()} Credits${completed ? ', claimed' : ''}`);
    this.detail.querySelector<HTMLElement>('[data-mission-reward-amount]')!.textContent = card.reward.toLocaleString();
    this.detail.querySelector<HTMLElement>('[data-mission-reward-claimed]')!.hidden = !completed;
    const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    play.disabled = locked;
    play.hidden = locked;
    play.textContent = completed ? 'REPLAY MISSION ▶' : signInRequired ? 'SIGN IN TO PLAY ▶' : 'PLAY MISSION ▶';
    this.detail.classList.toggle('is-locked', locked);
  }
}
