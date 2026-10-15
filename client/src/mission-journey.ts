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
  { title: journeyDallas07.name, objective: 'Destroy the transport before it escapes!', facts: [{ icon: 'location', label: 'DFW RUNWAY' }, { icon: 'target', label: 'GIANT TRANSPORT' }, { icon: 'timer', label: `${Math.ceil(journeyDallas07.timeLimitMs / 1000)} SEC TO EXIT` }], reward: journeyDallas07.firstClearCredits },
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
const chapterRoute: readonly (readonly [number, number])[] = [[8, 72], [25, 62], [42, 52], [59, 42], [76, 32], [92, 22]];
const stagePositions: readonly (readonly [number, number])[] = Array.from({ length: 24 }, (_, index) => chapterRoute[index % 6]!);
const chapterNames = ['GOLDEN GATES', 'SKY SIEGE', 'HUNTER BATTLES', 'CITY DEFENDERS'] as const;

export const missionJourneyStages: readonly MissionJourneyStage[] = stagePositions.map(([x, y], index) => ({
  id: index < 24 ? `journey-dallas-${String(index + 1).padStart(2, '0')}` : `dallas-mission-${String(index + 1).padStart(2, '0')}`,
  number: index + 1,
  chapter: (Math.floor(index / 6) + 1) as ChapterNumber,
  implementation: index < 24 ? 'playable' : 'planned',
  x,
  y,
}));

export class MissionJourney {
  private readonly detail: HTMLElement;
  private readonly stageButtons: HTMLButtonElement[] = [];
  private readonly routeGradient: SVGStopElement;
  private readonly routeGradientEdge: SVGStopElement;
  private readonly chapterNumber: HTMLElement;
  private readonly chapterName: HTMLElement;
  private readonly chapterRange: HTMLElement;
  private readonly chapterCount: HTMLElement;
  private readonly chapterDots: HTMLButtonElement[] = [];
  private readonly previousChapter: HTMLButtonElement;
  private readonly nextChapter: HTMLButtonElement;
  private visibleChapter: ChapterNumber = 1;
  private currentMission = 0;
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

  constructor(private readonly element: HTMLElement, onCities: () => void, onPlayMission: () => void, private readonly onPanelOpen: () => void, _onPanelClose: () => void) {
    element.classList.add('mission-journey');
    element.setAttribute('aria-label', 'Dallas Mission Journey');
    element.innerHTML = `
      <div class="mission-journey-topbar">
        <button type="button" class="context-back page-back mission-journey-back" data-mission-cities>BACK TO CITIES</button>
        <div class="mission-journey-heading"><h1>MISSION JOURNEY</h1><p>DALLAS • 24 MISSIONS</p></div>
      </div>
      <div class="mission-journey-board" aria-label="Dallas chapter missions">
        <div class="mission-journey-board-heading">
          <button type="button" class="mission-journey-chapter-arrow" data-chapter-previous aria-label="Previous chapter">‹</button>
          <div class="mission-journey-chapter-heading"><span data-chapter-number>CHAPTER 1</span><strong data-chapter-name>GOLDEN GATES</strong><span data-chapter-range>MISSIONS 1–6</span><small data-chapter-count>0 / 6 COMPLETE</small></div>
          <button type="button" class="mission-journey-chapter-arrow" data-chapter-next aria-label="Next chapter">›</button>
        </div>
        <div class="mission-journey-route-area">
          <svg class="mission-journey-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="mission-journey-route-color" x1="0" y1="0" x2="1" y2="0" objectBoundingBox="true"><stop data-route-stop-a offset="0%" stop-color="#6ae9ff"/><stop data-route-stop-b offset="0%" stop-color="#7289a7"/></linearGradient><marker id="mission-journey-route-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5Z" fill="#a7bfdb"/></marker></defs>
            <polyline points="8,72 25,62 42,52 59,42 76,32 92,22 97,19" fill="none" stroke="url(#mission-journey-route-color)" stroke-width="2" vector-effect="non-scaling-stroke" marker-end="url(#mission-journey-route-arrow)"/>
          </svg>
          <div class="mission-journey-nodes" aria-label="Chapter missions"></div>
        </div>
        <div class="mission-journey-detail" aria-label="Selected mission details" aria-live="polite">
          <div class="mission-journey-detail-copy"><strong><span data-mission-index>MISSION 01</span> · <span data-mission-title></span></strong><p data-mission-objective></p></div>
          <span class="mission-journey-reward" data-mission-reward></span>
          <button type="button" class="mission-journey-play" data-mission-play disabled>PLAY MISSION</button>
        </div>
      </div>
      <div class="mission-journey-pagination" aria-label="Chapters"></div>`;
    this.detail = element.querySelector('.mission-journey-detail')!;
    this.chapterNumber = element.querySelector('[data-chapter-number]')!;
    this.chapterName = element.querySelector('[data-chapter-name]')!;
    this.chapterRange = element.querySelector('[data-chapter-range]')!;
    this.chapterCount = element.querySelector('[data-chapter-count]')!;
    this.routeGradient = element.querySelector('[data-route-stop-a]')!;
    this.routeGradientEdge = element.querySelector('[data-route-stop-b]')!;
    this.previousChapter = element.querySelector('[data-chapter-previous]')!;
    this.nextChapter = element.querySelector('[data-chapter-next]')!;
    this.previousChapter.addEventListener('click', () => this.changeChapter(this.visibleChapter - 1));
    this.nextChapter.addEventListener('click', () => this.changeChapter(this.visibleChapter + 1));
    element.querySelector<HTMLButtonElement>('[data-mission-cities]')!.addEventListener('click', onCities);
    element.querySelector<HTMLButtonElement>('[data-mission-play]')!.addEventListener('click', () => { hapticsManager.emit('confirmation'); onPlayMission(); });
    const dots = element.querySelector<HTMLElement>('.mission-journey-pagination')!;
    for (let chapter = 1; chapter <= 4; chapter++) {
      const dot = document.createElement('button');
      dot.type = 'button'; dot.setAttribute('aria-label', `Chapter ${chapter}`);
      dot.addEventListener('click', () => this.changeChapter(chapter));
      dots.append(dot); this.chapterDots.push(dot);
    }
    const nodes = element.querySelector<HTMLElement>('.mission-journey-nodes')!;
    for (const stage of missionJourneyStages) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'mission-journey-node is-locked';
      button.dataset.stage = String(stage.number);
      button.style.left = `${stage.x}%`; button.style.top = `${stage.y}%`;
      button.innerHTML = `${stage.number % 6 === 0 ? '<em class="mission-journey-crown" aria-hidden="true"><svg viewBox="0 0 40 30"><path d="M3 8 11 16 20 3 29 16 37 8 34 25 6 25Z" fill="currentColor"/><path d="M7 28h26" fill="none" stroke="currentColor" stroke-width="3"/></svg></em>' : ''}<span class="mission-journey-check" aria-hidden="true">✓</span><span class="mission-journey-number">${stage.number}</span><small class="mission-journey-lock" aria-hidden="true"></small>`;
      button.addEventListener('click', () => this.select(stage.number, true, true));
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
    const completed = this.completedStages();
    const eligibleIndex = completed.findIndex((done, index) => !done && this.isStageEligible(index + 1));
    this.currentMission = eligibleIndex >= 0 ? eligibleIndex + 1 : this.signInRequired && !completed[0] ? 1 : 0;
    if (!this.userSelectedStage) this.selectedStage = this.currentMission || (completed.every(Boolean) ? 24 : 1);
    this.stageButtons.forEach((button, index) => {
      const number = index + 1, done = completed[index] === true;
      const locked = !done && !this.isStageEligible(number) && !(number === 1 && this.signInRequired);
      button.classList.toggle('is-locked', locked);
      button.classList.toggle('is-completed', done);
      button.classList.toggle('is-current', number === this.currentMission);
      button.classList.toggle('is-selected', number === this.selectedStage);
      button.disabled = locked;
      button.hidden = missionJourneyStages[index]!.chapter !== this.visibleChapter;
      button.setAttribute('aria-pressed', String(number === this.selectedStage));
      button.setAttribute('aria-label', `Mission ${number}, ${done ? 'completed, select to replay' : number === this.currentMission ? 'current mission' : locked ? 'locked' : 'available'}`);
    });
    this.renderChapter(completed);
    this.renderDetails();
  }

  private renderChapter(completed = this.completedStages()): void {
    const chapter = this.visibleChapter;
    this.chapterNumber.textContent = `CHAPTER ${chapter}`;
    this.chapterName.textContent = chapterNames[chapter - 1];
    this.chapterRange.textContent = `MISSIONS ${(chapter - 1) * 6 + 1}–${chapter * 6}`;
    this.chapterCount.textContent = `${completed.slice((chapter - 1) * 6, chapter * 6).filter(Boolean).length} / 6 COMPLETE`;
    this.previousChapter.disabled = chapter === 1;
    this.nextChapter.disabled = chapter === 4;
    this.chapterDots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index + 1 === chapter);
      dot.setAttribute('aria-current', index + 1 === chapter ? 'step' : 'false');
    });
    const first = (chapter - 1) * 6;
    const lastLit = completed.slice(first, first + 6).findIndex((done, index) => !done && first + index + 1 === this.currentMission);
    const litPosition = lastLit >= 0 ? lastLit : completed.slice(first, first + 6).filter(Boolean).length - 1;
    const percent = litPosition < 0 ? 0 : [8, 25, 42, 59, 76, 92][litPosition]!;
    this.routeGradient.setAttribute('offset', `${percent}%`);
    this.routeGradientEdge.setAttribute('offset', `${percent}%`);
  }

  private changeChapter(value: number): void {
    if (value < 1 || value > 4 || value === this.visibleChapter) return;
    this.visibleChapter = value as ChapterNumber;
    const first = (value - 1) * 6 + 1;
    const selectable = missionJourneyStages.slice(first - 1, first + 5).find(stage => !this.stageButtons[stage.number - 1]!.disabled);
    this.selectedStage = selectable?.number ?? 0;
    this.userSelectedStage = true;
    this.renderProgress();
    hapticsManager.emit('selection');
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

  show(_panelOpen = false): void {
    this.element.hidden = false;
    this.userSelectedStage = false;
    this.renderProgress();
    this.visibleChapter = missionJourneyStages[this.selectedStage - 1]!.chapter;
    this.renderProgress();
    this.panelOpen = false;
  }

  hide(): void { this.element.hidden = true; }
  closePanel(): void { this.panelOpen = false; }

  private setPanelOpen(_open: boolean): void { this.panelOpen = false; }

  private select(number: number, _animate = true, userSelected = false): void {
    const stage = missionJourneyStages[number - 1];
    if (!stage || userSelected && this.stageButtons[number - 1]?.disabled) return;
    if (userSelected) { this.userSelectedStage = true; hapticsManager.emit('selection'); }
    this.visibleChapter = stage.chapter;
    this.selectedStage = number;
    this.renderProgress();
  }

  private renderDetails(): void {
    const stage = missionJourneyStages[this.selectedStage - 1];
    if (!stage) {
      this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = 'MISSIONS LOCKED';
      this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = '';
      this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = 'Complete earlier missions to unlock this chapter.';
      this.detail.querySelector<HTMLElement>('[data-mission-reward]')!.textContent = '';
      this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!.hidden = true;
      return;
    }
    const card = missionCards[stage.number - 1]!;
    const completed = this.completedStages()[stage.number - 1] === true;
    const eligible = this.isStageEligible(stage.number);
    const signInRequired = this.signInRequired && stage.number === 1 && !completed;
    const locked = !completed && !eligible && !signInRequired;
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${String(stage.number).padStart(2, '0')}`;
    this.detail.querySelector<HTMLElement>('[data-mission-title]')!.textContent = card.title;
    this.detail.querySelector<HTMLElement>('[data-mission-objective]')!.textContent = locked ? `Complete Mission ${stage.number - 1} to unlock this mission.` : card.objective;
    const reward = this.detail.querySelector<HTMLElement>('[data-mission-reward]')!;
    reward.textContent = `${card.reward} CREDITS${completed ? ' · CLAIMED' : ''}`;
    const play = this.detail.querySelector<HTMLButtonElement>('[data-mission-play]')!;
    play.disabled = locked;
    play.hidden = locked;
    play.textContent = completed ? 'REPLAY MISSION' : signInRequired ? 'SIGN IN TO PLAY' : 'PLAY MISSION';
    this.detail.classList.toggle('is-locked', locked);
  }
}
