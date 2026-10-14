import './mission-journey.css';
import { hapticsManager } from './haptics-manager';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';

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
  { title: journeyDallas01.name, objective: 'Fly through all 10 golden gates before time runs out!', facts: [{ icon: 'location', label: 'DFW AIRSPACE' }, { icon: 'gate', label: `${journeyDallas01.gates.length} GATES` }, { icon: 'timer', label: '2:30 RACE' }], reward: journeyDallas01.firstClearCredits },
  { title: journeyDallas02.name, objective: 'Fly through all 10 golden gates before time runs out!', facts: [{ icon: 'location', label: 'WHITE ROCK LAKE' }, { icon: 'gate', label: `${journeyDallas02.gates.length} GATES` }, { icon: 'timer', label: '2:30 RACE' }], reward: journeyDallas02.firstClearCredits },
  { title: journeyDallas03.name, objective: 'Fly through all 10 golden gates before time runs out!', facts: [{ icon: 'location', label: 'NORTH DALLAS' }, { icon: 'gate', label: `${journeyDallas03.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas03.firstClearCredits },
  { title: journeyDallas04.name, objective: 'Fly through all 10 golden gates before time runs out!', facts: [{ icon: 'location', label: 'DOWNTOWN' }, { icon: 'gate', label: `${journeyDallas04.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas04.firstClearCredits },
  { title: journeyDallas05.name, objective: 'Fly accurately through all 10 golden gates before time runs out!', facts: [{ icon: 'location', label: 'TRINITY RIVER' }, { icon: 'gate', label: `${journeyDallas05.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas05.firstClearCredits },
  { title: journeyDallas06.name, objective: 'Fly through all 10 golden gates before time runs out!', facts: [{ icon: 'location', label: 'TRINITY RIVER' }, { icon: 'gate', label: `${journeyDallas06.gates.length} GATES` }, { icon: 'timer', label: '2:40 RACE' }], reward: journeyDallas06.firstClearCredits },
  { title: journeyDallas07.name, objective: 'Destroy the transport before it escapes!', facts: [{ icon: 'location', label: 'DALLAS AIRSPACE' }, { icon: 'target', label: 'GIANT TRANSPORT' }, { icon: 'timer', label: '2:30 ESCAPE' }], reward: journeyDallas07.firstClearCredits },
  { title: journeyDallas08.name, objective: 'Get behind the AI aircraft and follow it for 15 seconds!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'target', label: 'FOLLOW AI' }, { icon: 'timer', label: seconds(journeyDallas08.followMs) }], reward: journeyDallas08.firstClearCredits },
  { title: journeyDallas09.name, objective: 'Escape the Hunter. Reach the glowing Repair Heart!', facts: [{ icon: 'location', label: 'DFW' }, { icon: 'health', label: '60% HEALTH' }, { icon: 'target', label: 'REPAIR HEART' }], reward: journeyDallas09.firstClearCredits },
  { title: journeyDallas10.name, objective: 'Fly through 5 zigzag gates. Keep your turns smooth and beat the clock!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '5 GATES' }, { icon: 'timer', label: seconds(journeyDallas10.timeLimitMs) }], reward: journeyDallas10.firstClearCredits },
  { title: journeyDallas11.name, objective: 'Dive through 4 gates. Pull up to reach the final gate!', facts: [{ icon: 'location', label: 'HIGH-ALTITUDE START' }, { icon: 'gate', label: '5 GATES' }, { icon: 'timer', label: seconds(journeyDallas11.timeLimitMs) }], reward: journeyDallas11.firstClearCredits },
  { title: journeyDallas12.name, objective: 'Climb through 3 gates, then dive through 3 more!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '6 GATES' }, { icon: 'timer', label: seconds(journeyDallas12.timeLimitMs) }], reward: journeyDallas12.firstClearCredits },
  { title: journeyDallas13.name, objective: 'Fly through 5 speed gates. Accelerate and keep your momentum!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '5 SPEED GATES' }, { icon: 'timer', label: seconds(journeyDallas13.timeLimitMs) }], reward: journeyDallas13.firstClearCredits },
  { title: journeyDallas14.name, objective: 'Outfly the Hunter. Stay 450 m away for 10 seconds!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'target', label: '450 M ESCAPE' }, { icon: 'timer', label: '10 SEC HOLD' }], reward: journeyDallas14.firstClearCredits },
  { title: journeyDallas15.name, objective: 'Chase the elite Ace. Land your shots and shoot it down!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'health', label: '300 HP BOSS' }, { icon: 'target', label: 'AIR COMBAT' }], reward: journeyDallas15.firstClearCredits },
  { title: journeyDallas16.name, objective: 'Fly through 5 escape gates while surviving two Hunters!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '5 GATES' }, { icon: 'target', label: '2 HUNTERS' }], reward: journeyDallas16.firstClearCredits },
  { title: journeyDallas17.name, objective: 'Repair your aircraft, then land at DFW with 780+ points!', facts: [{ icon: 'health', label: '45% HEALTH' }, { icon: 'target', label: 'REPAIR HEART' }, { icon: 'landing', label: 'LAND 780+' }], reward: journeyDallas17.firstClearCredits },
  { title: journeyDallas18.name, objective: 'Capture the territory. Defend it from the Hunter for 40 seconds!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'capture', label: 'CAPTURE & DEFEND' }, { icon: 'timer', label: '40 SEC HOLD' }], reward: journeyDallas18.firstClearCredits },
  { title: journeyDallas19.name, objective: 'Destroy the monster before time runs out.', facts: [{ icon: 'location', label: 'AIRBORNE START' }, { icon: 'timer', label: '2:30 LIMIT' }, { icon: 'target', label: '1 MONSTER' }], reward: journeyDallas19.firstClearCredits },
  { title: journeyDallas20.name, objective: 'Fly through 6 HIGH and LOW gates before time runs out!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'gate', label: '6 GATES' }, { icon: 'timer', label: seconds(journeyDallas20.timeLimitMs) }], reward: journeyDallas20.firstClearCredits },
  { title: journeyDallas21.name, objective: 'Capture two territories. Secure Bravo before the clock runs out!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'capture', label: '2 TERRITORIES' }, { icon: 'timer', label: '120 SEC TRANSFER' }], reward: journeyDallas21.firstClearCredits },
  { title: journeyDallas22.name, objective: 'Clear 3 approach gates, then make a PERFECT landing!', facts: [{ icon: 'location', label: 'DFW APPROACH' }, { icon: 'gate', label: '3 GATES' }, { icon: 'landing', label: 'PERFECT LANDING' }], reward: journeyDallas22.firstClearCredits },
  { title: journeyDallas23.name, objective: 'Defeat 2 Hunters. Repair your aircraft between fights!', facts: [{ icon: 'location', label: 'LOVE FIELD' }, { icon: 'target', label: '2 HUNTERS' }, { icon: 'health', label: 'REPAIR HEART' }], reward: journeyDallas23.firstClearCredits },
  { title: journeyDallas24.name, objective: 'Clear 3 gates, defeat the Legendary Ace, and land PERFECTLY!', facts: [{ icon: 'gate', label: '3 GATES' }, { icon: 'health', label: '300 HP ACE' }, { icon: 'landing', label: 'PERFECT LANDING' }], reward: journeyDallas24.firstClearCredits },
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
const stagePositions: readonly (readonly [number, number])[] = [85, 215, 345, 475].flatMap(y =>
  [465, 600, 735, 870, 1005, 1140].map(x => [x, y] as const));

export const missionJourneyStages: readonly MissionJourneyStage[] = stagePositions.map(([x, y], index) => ({
  id: index < 24 ? `journey-dallas-${String(index + 1).padStart(2, '0')}` : `dallas-mission-${String(index + 1).padStart(2, '0')}`,
  number: index + 1,
  chapter: (Math.floor(index / 6) + 1) as ChapterNumber,
  implementation: index < 24 ? 'playable' : 'planned',
  x,
  y,
}));

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
  private signInRequired = false;
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

  constructor(private readonly element: HTMLElement, onCities: () => void, onPlayMission: () => void, private readonly onPanelOpen: () => void, onPanelClose: () => void) {
    element.classList.add('mission-journey');
    element.setAttribute('aria-label', 'Dallas Mission Journey');
    element.innerHTML = `
      <div class="mission-journey-topbar">
        <button type="button" class="mission-journey-back" data-mission-cities><span aria-hidden="true">‹</span> BACK TO CITIES</button>
        <div class="mission-journey-heading"><h1>MISSION JOURNEY</h1><p>DALLAS • 24 MISSIONS</p></div>
      </div>
      <div class="mission-journey-layout">
        <div class="mission-journey-board-scroll" tabindex="0" aria-label="Mission route. Scroll to explore all 24 stages.">
          <div class="mission-journey-board">
            <svg class="mission-journey-route" viewBox="0 0 1400 560" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="mission-journey-chapter mission-journey-chapter-1"><strong>CHAPTER 1</strong><span>GOLDEN GATES</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-2"><strong>CHAPTER 2</strong><span>SKY SIEGE</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-3"><strong>CHAPTER 3</strong><span>HUNTER BATTLES</span></div>
            <div class="mission-journey-chapter mission-journey-chapter-4"><strong>CHAPTER 4</strong><span>CITY DEFENDERS</span></div>
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
      </div>`;

    this.board = element.querySelector('.mission-journey-board-scroll')!;
    this.detail = element.querySelector('.mission-journey-detail')!;
    this.detailCard = element.querySelector('.mission-journey-detail-card')!;
    this.detail.inert = true;
    element.querySelectorAll<HTMLButtonElement>('[data-mission-cities]').forEach(button => button.addEventListener('click', onCities));
    element.querySelector<HTMLButtonElement>('[data-mission-play]')!.addEventListener('click', () => { hapticsManager.emit('confirmation'); onPlayMission(); });
    element.querySelector<HTMLButtonElement>('[data-mission-close]')!.addEventListener('click', () => { hapticsManager.emit('selection'); onPanelClose(); });
    this.detail.addEventListener('transitionend', event => {
      if (event.propertyName === 'width' && this.panelOpen) this.revealSelectedStage();
    });

    const route = element.querySelector<SVGSVGElement>('.mission-journey-route')!;
    for (let chapter = 0; chapter < 4; chapter += 1) {
      const stages = missionJourneyStages.slice(chapter * 6, chapter * 6 + 6);
      const lead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      lead.setAttribute('d', `M 420 ${stages[0]!.y} L ${stages[0]!.x} ${stages[0]!.y}`);
      lead.setAttribute('class', 'mission-journey-route-lead');
      route.append(lead);
      for (let index = 0; index < 5; index += 1) {
        const from = stages[index]!;
        const to = stages[index + 1]!;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
        path.setAttribute('class', 'mission-journey-route-segment');
        path.dataset.routeEnd = String(to.number);
        route.append(path);
      }
      if (chapter < 3) {
        const last = stages[5]!;
        const nextRow = missionJourneyStages[(chapter + 1) * 6 + 5]!;
        const connector = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        connector.setAttribute('d', `M ${last.x} ${last.y} C 1205 ${last.y}, 1205 ${nextRow.y}, ${nextRow.x} ${nextRow.y}`);
        connector.setAttribute('class', 'mission-journey-route-connector');
        route.append(connector);
      }
    }
    const nodes = element.querySelector<HTMLElement>('.mission-journey-nodes')!;
    for (const stage of missionJourneyStages) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mission-journey-node is-locked';
      button.style.left = `${stage.x / 14}%`;
      button.style.top = `${stage.y / 5.6}%`;
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

  setSignInRequired(required: boolean): void {
    this.signInRequired = required;
    this.renderProgress();
  }

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

  setStageTenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTenCompleted;
    this.stageTenEligible = eligible;
    this.stageTenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 11;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageElevenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageElevenCompleted;
    this.stageElevenEligible = eligible;
    this.stageElevenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 12;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageTwelveProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwelveCompleted;
    this.stageTwelveEligible = eligible;
    this.stageTwelveCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 13;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageThirteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageThirteenCompleted;
    this.stageThirteenEligible = eligible;
    this.stageThirteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 14;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageFourteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFourteenCompleted;
    this.stageFourteenEligible = eligible;
    this.stageFourteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 15;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageFifteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageFifteenCompleted;
    this.stageFifteenEligible = eligible;
    this.stageFifteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 16;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageSixteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSixteenCompleted;
    this.stageSixteenEligible = eligible; this.stageSixteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 17;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageSeventeenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageSeventeenCompleted;
    this.stageSeventeenEligible = eligible; this.stageSeventeenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 18;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageEighteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageEighteenCompleted;
    this.stageEighteenEligible = eligible; this.stageEighteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 19;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageNineteenProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageNineteenCompleted;
    this.stageNineteenEligible = eligible; this.stageNineteenCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 20;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageTwentyProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyCompleted;
    this.stageTwentyEligible = eligible; this.stageTwentyCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 21;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageTwentyOneProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyOneCompleted;
    this.stageTwentyOneEligible = eligible; this.stageTwentyOneCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 22;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageTwentyTwoProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyTwoCompleted;
    this.stageTwentyTwoEligible = eligible; this.stageTwentyTwoCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 23;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
  }

  setStageTwentyThreeProgress(eligible: boolean, completed: boolean): void {
    const newlyCompleted = completed && !this.stageTwentyThreeCompleted;
    this.stageTwentyThreeEligible = eligible; this.stageTwentyThreeCompleted = completed;
    if (newlyCompleted && !this.userSelectedStage) this.selectedStage = 24;
    this.renderProgress();
    if (newlyCompleted && !this.userSelectedStage && this.isOpen) this.revealSelectedStage();
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
    const completed = this.completedStages();
    const currentIndex = completed.findIndex((done, index) => !done &&
      (index === 0 || completed[index - 1] || this.isStageEligible(index + 1)));
    if (!this.userSelectedStage) this.selectedStage = currentIndex >= 0 ? currentIndex + 1 : 24;
    this.stageButtons.forEach((button, index) => {
      const number = index + 1;
      const done = completed[index] === true;
      const locked = !done && number !== 1 && !completed[index - 1] && !this.isStageEligible(number);
      const current = index === currentIndex;
      button.classList.toggle('is-locked', locked);
      button.classList.toggle('is-completed', done);
      button.classList.toggle('is-current', current);
      button.classList.toggle('is-selected', number === this.selectedStage);
      button.setAttribute('aria-pressed', String(number === this.selectedStage));
      button.setAttribute('aria-label', `Mission ${number}, ${done ? 'completed, select to replay' : current ? 'current mission, select for details' : locked ? 'locked, select to see prerequisite' : 'available, select for details'}`);
      if (current) button.dataset.progressLabel = 'CURRENT MISSION';
      else delete button.dataset.progressLabel;
      const lock = button.querySelector('small');
      if (lock) lock.hidden = !locked;
    });
    this.element.querySelectorAll<SVGPathElement>('[data-route-end]').forEach(path => {
      const end = Number(path.dataset.routeEnd);
      path.classList.toggle('is-completed', completed[end - 2] === true && completed[end - 1] === true);
    });
    this.renderDetails();
    if (this.isOpen && !this.userSelectedStage) this.revealSelectedStage(false);
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

  celebrateStageTen(): void {
    this.select(10, false);
    this.setPanelOpen(false);
    this.stageButtons[9]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-ten');
    window.setTimeout(() => {
      this.stageButtons[9]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-ten');
      if (this.isOpen) this.select(11);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageEleven(): void { this.select(11); }

  celebrateStageEleven(): void {
    this.select(11, false);
    this.setPanelOpen(false);
    this.stageButtons[10]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-eleven');
    window.setTimeout(() => {
      this.stageButtons[10]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-eleven');
      if (this.isOpen) this.select(12);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageTwelve(): void { this.select(12); }

  celebrateStageTwelve(): void {
    this.select(12, false);
    this.setPanelOpen(false);
    this.stageButtons[11]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-twelve');
    window.setTimeout(() => {
      this.stageButtons[11]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-twelve');
      if (this.isOpen) this.select(13);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageThirteen(): void { this.select(13); }

  celebrateStageThirteen(): void {
    this.select(13, false);
    this.setPanelOpen(false);
    this.stageButtons[12]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-thirteen');
    window.setTimeout(() => {
      this.stageButtons[12]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-thirteen');
      if (this.isOpen) this.select(14);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageFourteen(): void { this.select(14); }

  celebrateStageFourteen(): void {
    this.select(14, false);
    this.setPanelOpen(false);
    this.stageButtons[13]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-fourteen');
    window.setTimeout(() => {
      this.stageButtons[13]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-fourteen');
      if (this.isOpen) this.select(15);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageFifteen(): void { this.select(15); }

  celebrateStageFifteen(): void {
    this.select(15, false);
    this.setPanelOpen(false);
    this.stageButtons[14]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing-fifteen');
    window.setTimeout(() => {
      this.stageButtons[14]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing-fifteen');
      if (this.isOpen) this.select(16);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageSixteen(): void { this.select(16); }
  celebrateStageSixteen(): void {
    this.select(16, false); this.setPanelOpen(false);
    this.stageButtons[15]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[15]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(17);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }
  advanceToStageSeventeen(): void { this.select(17); }
  celebrateStageSeventeen(): void {
    this.select(17, false); this.setPanelOpen(false);
    this.stageButtons[16]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[16]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(18);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }
  advanceToStageEighteen(): void { this.select(18); }
  celebrateStageEighteen(): void {
    this.select(18, false); this.setPanelOpen(false);
    this.stageButtons[17]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[17]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(19);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }
  advanceToStageNineteen(): void { this.select(19); }
  advanceToStageTwenty(): void { this.select(20); }
  celebrateStageNineteen(): void {
    this.select(19, false); this.setPanelOpen(false);
    this.stageButtons[18]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[18]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(20);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageTwentyOne(): void { this.select(21); }
  celebrateStageTwenty(): void {
    this.select(20, false); this.setPanelOpen(false);
    this.stageButtons[19]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[19]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(21);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageTwentyTwo(): void { this.select(22); }
  celebrateStageTwentyOne(): void {
    this.select(21, false); this.setPanelOpen(false);
    this.stageButtons[20]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[20]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(22);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageTwentyThree(): void { this.select(23); }
  celebrateStageTwentyTwo(): void {
    this.select(22, false); this.setPanelOpen(false);
    this.stageButtons[21]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[21]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(23);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  advanceToStageTwentyFour(): void { this.select(24); }
  celebrateStageTwentyThree(): void {
    this.select(23, false); this.setPanelOpen(false);
    this.stageButtons[22]?.classList.add('is-newly-completed');
    this.element.classList.add('is-progressing');
    window.setTimeout(() => {
      this.stageButtons[22]?.classList.remove('is-newly-completed');
      this.element.classList.remove('is-progressing');
      if (this.isOpen) this.select(24);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1_100);
  }

  celebrateStageTwentyFour(): void {
    this.select(24, false); this.setPanelOpen(false);
    this.stageButtons[23]?.classList.add('is-newly-completed');
    window.setTimeout(() => this.stageButtons[23]?.classList.remove('is-newly-completed'), 1_100);
  }

  show(panelOpen = false): void {
    this.element.hidden = false;
    this.element.classList.toggle('is-paused', document.hidden);
    if (!panelOpen) {
      this.userSelectedStage = false;
      this.renderProgress();
    }
    this.setPanelOpen(panelOpen);
    this.revealSelectedStage(false);
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
    const completed = this.completedStages()[stage.number - 1] === true;
    const eligible = this.isStageEligible(stage.number);
    const reached = stage.number === 24 && (this.stageTwentyFourEligible || this.stageTwentyFourCompleted);
    const locked = (!card && !reached) || (!!card && !eligible && !completed);
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${String(stage.number).padStart(2, '0')}${stage.number === 6 ? ' · CHAPTER 1 FINALE' : stage.number === 12 ? ' · CHAPTER 2 FINALE' : stage.number >= 7 && stage.number <= 11 ? ' · CHAPTER 2' : stage.number === 18 ? ' · CHAPTER 3 FINALE' : stage.number >= 13 && stage.number <= 17 ? ' · CHAPTER 3' : stage.number >= 19 ? ' · CHAPTER 4' : ''}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = card?.title ?? (stage.number === 24 ? 'LEGENDARY CHAMPIONSHIP' : 'MISSION COMING SOON');
    const status = this.detail.querySelector<HTMLElement>('[data-mission-status]')!;
    const signInRequired = this.signInRequired && stage.number === 1 && !completed;
    status.textContent = completed ? 'COMPLETED' : signInRequired ? 'SIGN IN REQUIRED' : locked ? 'LOCKED' : card ? 'AVAILABLE' : 'COMING SOON';
    status.classList.toggle('is-locked', locked && !signInRequired);
    this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = locked
      ? `Complete Mission ${stage.number - 1} to unlock this mission.`
      : card?.objective ?? 'Your next challenge is being prepared.';
    const facts = this.detail.querySelector<HTMLElement>('[data-mission-facts]')!;
    facts.hidden = !card;
    facts.replaceChildren();
    for (const fact of card?.facts ?? []) {
      const item = document.createElement('div');
      item.className = 'mission-journey-fact';
      if (stage.number === 11 && fact.label === 'HIGH-ALTITUDE START' || stage.number === 13 && fact.label === '5 SPEED GATES' || stage.number === 18 && fact.label === 'CAPTURE & DEFEND' || stage.number === 19 && fact.label === 'AIRBORNE START' || stage.number === 21 && fact.label === '120 SEC TRANSFER' || stage.number === 22 && fact.label === 'PERFECT LANDING' || stage.number === 23 && fact.label === 'REPAIR HEART') item.classList.add('is-long');
      item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${factIcons[fact.icon]}</svg>`;
      const label = document.createElement('span');
      label.textContent = fact.label;
      item.append(label);
      facts.append(item);
    }
    const reward = this.detail.querySelector<HTMLElement>('[data-mission-reward]')!;
    reward.hidden = !card;
    reward.textContent = card ? `${card.reward} CREDITS${completed ? ' · CLAIMED' : ''}${stage.number === 24 ? ' · LEGENDARY PILOT' : ''}` : '';
    const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    play.disabled = !card || (!eligible && !completed && !signInRequired);
    play.textContent = !card ? locked ? 'LOCKED' : 'COMING SOON' : completed ? 'REPLAY MISSION' : signInRequired ? 'SIGN IN TO PLAY' : !eligible ? 'LOCKED' : 'PLAY MISSION';
  }

  private revealSelectedStage(animate = true): void {
    if (this.board.scrollWidth <= this.board.clientWidth && this.board.scrollHeight <= this.board.clientHeight) return;
    const button = this.stageButtons[this.selectedStage - 1];
    if (!button) return;
    this.board.scrollTo({
      left: button.offsetLeft - this.board.clientWidth / 2,
      top: button.offsetTop - this.board.clientHeight / 2,
      behavior: !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
}
