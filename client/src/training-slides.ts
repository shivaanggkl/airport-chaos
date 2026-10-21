import { trainingSlideIds } from '../../shared/training-slides.mjs';
import { tutorialInstruction, type TutorialBindings, type TutorialInputMode, type TutorialLessonStep } from '../../shared/tutorial-flight-rules.mjs';
import './training-slides.css';

type SlideControls = { mode: TutorialInputMode; inverted: boolean; bindings: TutorialBindings };
type TrainingSlidesOptions = {
  host: HTMLElement;
  gameRoot: HTMLElement;
  controls: () => SlideControls;
  onAdvance: (index: number, step: TutorialLessonStep) => Promise<boolean>;
  onComplete: () => Promise<boolean>;
  onOpen: () => void;
  onClose: () => void;
};

const slideDetails: Record<TutorialLessonStep, string> = {
  throttle: 'The Bluejay starts on Milwaukee’s runway. The speed meter shows when it is ready to take off.',
  takeoff: 'At speed, raise the nose and watch the aircraft lift away from the runway.',
  turnLeft: 'Steer left to change your flight path.',
  turnRight: 'Steer right to correct your flight path.',
  climb: 'Gain altitude while watching the altitude meter in the flight HUD.',
  descend: 'Lower the aircraft carefully and keep an eye on your altitude.',
  cameraLook: 'Look around the live flight scene without changing your flight direction.',
  cameraZoom: 'Zoom the live view to see your aircraft and surroundings clearly.',
  approach: 'Follow the real objective marker and radar toward the marked aircraft.',
  targetLock: 'Keep the target inside the lock circle until the game confirms a lock.',
  fire: 'When the target is locked, fire and watch for the hit confirmation.',
  landing: 'Return to the runway, reduce speed, line up, and descend gently.',
};

/** A manual lesson slider over the actual Milwaukee flight scene and controls. */
export class TrainingSlides {
  private readonly root = document.createElement('section');
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly instruction: HTMLElement;
  private readonly count: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private index = 0;
  private busy = false;
  private swipeStart: { x: number; y: number } | undefined;

  constructor(private readonly options: TrainingSlidesOptions) {
    this.root.className = 'guided-tutorial-panel training-slides';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Milwaukee gameplay training slides');
    this.root.innerHTML = `
      <header><small>FLIGHT INSTRUCTOR · GUIDE</small><span data-slide-count></span><button type="button" data-slide-close aria-label="Close training guide">✕</button></header>
      <h2 data-slide-title tabindex="-1"></h2>
      <p data-slide-detail></p>
      <div class="tutorial-control-instruction" data-slide-instruction></div>
      <p class="training-slides-status" data-slide-status role="status" aria-live="polite"></p>
      <div class="training-slides-progress" data-slide-progress aria-label="Training slide progress"></div>
      <footer><button type="button" data-slide-previous>← BACK</button><button type="button" data-slide-next>NEXT →</button></footer>`;
    this.title = this.root.querySelector('[data-slide-title]')!;
    this.detail = this.root.querySelector('[data-slide-detail]')!;
    this.instruction = this.root.querySelector('[data-slide-instruction]')!;
    this.count = this.root.querySelector('[data-slide-count]')!;
    this.progress = this.root.querySelector('[data-slide-progress]')!;
    this.status = this.root.querySelector('[data-slide-status]')!;
    this.previous = this.root.querySelector('[data-slide-previous]')!;
    this.next = this.root.querySelector('[data-slide-next]')!;
    this.root.querySelector<HTMLButtonElement>('[data-slide-close]')!.addEventListener('click', () => this.close());
    this.previous.addEventListener('click', () => this.back());
    this.next.addEventListener('click', () => { void this.forward(); });
    this.root.addEventListener('pointerdown', event => { this.swipeStart = { x: event.clientX, y: event.clientY }; });
    this.root.addEventListener('pointerup', event => {
      const start = this.swipeStart;
      this.swipeStart = undefined;
      if (!start || this.busy) return;
      const dx = event.clientX - start.x;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(event.clientY - start.y) * 1.3) return;
      if (dx < 0) void this.forward(); else this.back();
    });
    document.addEventListener('keydown', event => {
      if (!this.isOpen()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    }, true);
    options.host.append(this.root);
  }

  isOpen(): boolean { return !this.root.hidden; }

  open(): void {
    this.index = 0;
    this.busy = false;
    this.root.hidden = false;
    this.options.gameRoot.classList.add('training-slides-active');
    this.options.onOpen();
    this.render();
    this.title.focus();
  }

  close(): void {
    if (!this.isOpen() || this.busy) return;
    this.root.hidden = true;
    this.options.gameRoot.classList.remove('training-slides-active');
    document.body.dataset.trainingSlideControl = '';
    this.options.onClose();
  }

  private back(): void {
    if (this.busy || this.index === 0) return;
    this.index -= 1;
    this.render();
  }

  private async forward(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.next.disabled = true;
    this.status.textContent = '';
    try {
      if (this.index === trainingSlideIds.length - 1) {
        if (await this.options.onComplete()) return;
      } else if (await this.options.onAdvance(this.index, trainingSlideIds[this.index]!)) {
        this.index += 1;
        this.render();
        return;
      }
      this.status.textContent = 'CONNECTION REQUIRED TO CONTINUE. TRY AGAIN.';
    } catch {
      this.status.textContent = 'CONNECTION REQUIRED TO CONTINUE. TRY AGAIN.';
    } finally {
      this.busy = false;
      this.next.disabled = false;
    }
  }

  private render(): void {
    const step = trainingSlideIds[this.index]!;
    const { mode, inverted, bindings } = this.options.controls();
    const guidance = tutorialInstruction(step, mode, inverted, bindings);
    this.title.textContent = guidance.title;
    this.detail.textContent = slideDetails[step];
    this.instruction.textContent = guidance.controlInstruction;
    this.count.textContent = `${this.index + 1} / ${trainingSlideIds.length}`;
    this.progress.replaceChildren(...trainingSlideIds.map((_, index) => {
      const dot = document.createElement('i');
      dot.classList.toggle('is-seen', index <= this.index);
      dot.setAttribute('aria-hidden', 'true');
      return dot;
    }));
    this.previous.disabled = this.index === 0;
    this.next.textContent = this.index === trainingSlideIds.length - 1 ? 'FINISH TRAINING' : 'NEXT →';
    this.status.textContent = '';
    document.body.dataset.trainingSlideControl = guidance.control;
  }
}
