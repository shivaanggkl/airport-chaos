import './mission-journey.css';

type ChapterNumber = 1 | 2 | 3 | 4;
type StageImplementation = 'planned';

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
  id: `dallas-mission-${String(index + 1).padStart(2, '0')}`,
  number: index + 1,
  chapter: (Math.floor(index / 6) + 1) as ChapterNumber,
  implementation: 'planned',
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
  private panelOpen = false;

  constructor(private readonly element: HTMLElement, onCities: () => void, onFreeFlight: () => void, private readonly onPanelOpen: () => void, onPanelClose: () => void) {
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
            <div class="mission-journey-detail-top"><span data-mission-index>MISSION 1</span><span class="mission-journey-status">COMING SOON</span><button type="button" class="mission-journey-detail-close" aria-label="Close mission details" data-mission-close>×</button></div>
            <p class="mission-journey-type" data-mission-type>CHAPTER 1 · TAKE OFF</p>
            <figure class="mission-journey-preview"><div role="img" aria-label="Dallas city aviation preview"></div><figcaption>DALLAS CITY PREVIEW</figcaption></figure>
            <p class="mission-journey-objective">Coming soon. Explore Dallas in Free Flight while this mission is developed.</p>
            <div class="mission-journey-detail-bottom"><button type="button" class="mission-journey-play" disabled>MISSION COMING SOON</button><button type="button" class="mission-journey-free" data-mission-free>FREE FLIGHT <span aria-hidden="true">›</span></button></div>
          </div>
        </aside>
      </div>`;

    this.board = element.querySelector('.mission-journey-board-scroll')!;
    this.detail = element.querySelector('.mission-journey-detail')!;
    this.detailCard = element.querySelector('.mission-journey-detail-card')!;
    this.detail.inert = true;
    element.querySelectorAll<HTMLButtonElement>('[data-mission-cities]').forEach(button => button.addEventListener('click', onCities));
    element.querySelector<HTMLButtonElement>('[data-mission-free]')!.addEventListener('click', onFreeFlight);
    element.querySelector<HTMLButtonElement>('[data-mission-close]')!.addEventListener('click', onPanelClose);
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
    const nodes = element.querySelector<HTMLElement>('.mission-journey-nodes')!;
    for (const stage of missionJourneyStages) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mission-journey-node';
      if (stage.number % 6 === 0) button.classList.add('is-finale');
      if (stage.number === 24) button.classList.add('is-final');
      button.style.left = `${stage.x / 10}%`;
      button.style.top = `${stage.y / 5.2}%`;
      button.setAttribute('aria-label', `Mission ${stage.number}, coming soon`);
      button.dataset.stage = String(stage.number);
      const number = document.createElement('span');
      number.textContent = String(stage.number);
      const gloss = document.createElement('i');
      gloss.className = 'mission-journey-node-gloss';
      gloss.setAttribute('aria-hidden', 'true');
      const lock = document.createElement('small');
      lock.setAttribute('aria-hidden', 'true');
      button.append(gloss, number, lock);
      button.addEventListener('click', () => this.select(stage.number));
      nodes.append(button);
      this.stageButtons.push(button);
    }
    this.board.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      this.select(Math.min(24, Math.max(1, this.selectedStage + offset)));
      this.stageButtons[this.selectedStage - 1]?.focus();
    });
    document.addEventListener('visibilitychange', () => {
      this.element.classList.toggle('is-paused', document.hidden);
    });
    this.select(1, false);
  }

  get isOpen(): boolean { return !this.element.hidden; }
  get isPanelOpen(): boolean { return this.panelOpen; }

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

  private select(number: number, animate = true): void {
    const stage = missionJourneyStages[number - 1];
    if (!stage) return;
    this.selectedStage = number;
    this.stageButtons.forEach((button, index) => {
      const selected = index === number - 1;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    this.detail.querySelector<HTMLElement>('[data-mission-index]')!.textContent = `MISSION ${number}`;
    this.detail.querySelector<HTMLElement>('[data-mission-type]')!.textContent = `CHAPTER ${stage.chapter} · ${chapterNames[stage.chapter - 1]}`;
    if (!this.panelOpen && animate) {
      this.setPanelOpen(true);
      this.onPanelOpen();
    } else if (animate && this.isOpen && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.detailCard.getAnimations().forEach(animation => animation.cancel());
      this.detailCard.animate([{ opacity: .75, transform: 'translateX(7px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 220, easing: 'ease-out' });
    }
    if (animate && this.isOpen) this.revealSelectedStage();
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
