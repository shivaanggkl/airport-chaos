import { trainingSlideIds } from '../../shared/training-slides.mjs';
import type { TutorialLessonStep } from '../../shared/tutorial-flight-rules.mjs';
import './training-slides.css';

type Options = {
  host: HTMLElement;
  gameRoot: HTMLElement;
  onAdvance: (index: number, step: TutorialLessonStep) => Promise<boolean>;
  onComplete: () => Promise<boolean>;
  onStage: (step: TutorialLessonStep) => void;
  onStageEnd: (step: TutorialLessonStep) => void;
  onOpen: () => void;
  onClose: () => void;
  onFinished: () => void;
};

const scenes: Record<TutorialLessonStep, { title: string; detail: string; control: string; motion: string }> = {
  throttle: { title: 'BUILD SPEED', detail: 'Slide the speed lever up. Watch the Bluejay accelerate on the runway.', control: 'throttle', motion: 'up' },
  takeoff: { title: 'TAKE OFF', detail: 'Move the joystick up when you have speed. The aircraft lifts off.', control: 'stick', motion: 'up' },
  turnLeft: { title: 'TURN LEFT', detail: 'Move the joystick left to steer toward your route.', control: 'stick', motion: 'left' },
  turnRight: { title: 'TURN RIGHT', detail: 'Move the joystick right to correct your route.', control: 'stick', motion: 'right' },
  climb: { title: 'CLIMB', detail: 'Push the joystick up gently. Watch your altitude increase.', control: 'stick', motion: 'up' },
  descend: { title: 'DESCEND', detail: 'Pull the joystick down gently. Watch your altitude decrease.', control: 'stick', motion: 'down' },
  cameraLook: { title: 'LOOK AROUND', detail: 'Drag the view to look around without turning the aircraft.', control: 'view', motion: 'right' },
  cameraZoom: { title: 'ZOOM', detail: 'Pinch the view to see the aircraft at a different distance.', control: 'view', motion: 'pinch' },
  approach: { title: 'FOLLOW THE RADAR', detail: 'The radar and objective marker help you find your destination.', control: 'radar', motion: 'hold' },
  targetLock: { title: 'AIM', detail: 'Keep the target in the aiming circle until it locks.', control: 'aim', motion: 'hold' },
  fire: { title: 'FIRE', detail: 'When the target is lined up, tap FIRE.', control: 'fire', motion: 'tap' },
  landing: { title: 'LAND SAFELY', detail: 'Lower speed, line up with the runway, and descend gently.', control: 'throttle', motion: 'down' },
};

/** Automatic screenplay over the actual Milwaukee flight scene. */
export class TrainingSlides {
  private readonly root = document.createElement('section');
  private readonly hand = document.createElement('div');
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly count: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly status: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private index = 0;
  private timer: number | undefined;
  private actionTimer: number | undefined;
  private active = false;

  constructor(private readonly options: Options) {
    this.root.className = 'guided-tutorial-panel training-screenplay';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = '<header><small>FLIGHT INSTRUCTOR · MILWAUKEE</small><span data-scene-count></span></header><h2 data-scene-title></h2><p data-scene-detail></p><div class="training-screenplay-progress" data-scene-progress></div><p data-scene-status></p><button type="button" data-scene-retry hidden>RETRY CONNECTION</button>';
    this.title = this.root.querySelector('[data-scene-title]')!;
    this.detail = this.root.querySelector('[data-scene-detail]')!;
    this.count = this.root.querySelector('[data-scene-count]')!;
    this.progress = this.root.querySelector('[data-scene-progress]')!;
    this.status = this.root.querySelector('[data-scene-status]')!;
    this.retry = this.root.querySelector('[data-scene-retry]')!;
    this.retry.addEventListener('click', () => { void this.advance(); });
    this.hand.className = 'training-screenplay-hand';
    this.hand.setAttribute('aria-hidden', 'true');
    this.hand.textContent = '👆';
    this.hand.hidden = true;
    options.host.append(this.root);
    document.body.append(this.hand);
  }

  isOpen(): boolean { return this.active; }

  open(): void {
    if (this.active) return;
    this.active = true;
    this.index = 0;
    this.root.hidden = false;
    this.options.gameRoot.classList.add('training-screenplay-active');
    this.options.onOpen();
    this.showStage();
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.actionTimer);
    this.hand.hidden = true;
    this.root.hidden = true;
    this.options.gameRoot.classList.remove('training-screenplay-active');
    document.body.dataset.trainingSlideControl = '';
    this.options.onStageEnd(trainingSlideIds[this.index]!);
    this.options.onClose();
  }

  private showStage(): void {
    if (!this.active) return;
    const step = trainingSlideIds[this.index]!;
    const scene = scenes[step];
    this.title.textContent = scene.title;
    this.detail.textContent = scene.detail;
    this.count.textContent = String(this.index + 1) + ' / ' + String(trainingSlideIds.length);
    this.status.textContent = '';
    this.retry.hidden = true;
    this.progress.replaceChildren(...trainingSlideIds.map((_, index) => {
      const dot = document.createElement('i');
      dot.classList.toggle('is-seen', index <= this.index);
      dot.classList.toggle('is-current', index === this.index);
      return dot;
    }));
    document.body.dataset.trainingSlideControl = scene.control;
    this.positionHand(scene.control, scene.motion);
    this.actionTimer = window.setTimeout(() => { if (this.active) this.options.onStage(step); }, 800);
    this.timer = window.setTimeout(() => { void this.advance(); }, 10_000);
  }

  private positionHand(control: string, motion: string): void {
    const selector = control === 'view' ? '#game-root canvas'
      : control === 'radar' ? '#radar-panel'
      : control === 'aim' ? '#acquisition-circle'
      : '[data-touch-control="' + control + '"]';
    const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) { this.hand.hidden = true; return; }
    this.hand.hidden = false;
    this.hand.style.left = String(rect.left + rect.width * .5) + 'px';
    this.hand.style.top = String(rect.top + rect.height * .5) + 'px';
    this.hand.dataset.motion = motion;
  }

  private async advance(): Promise<void> {
    if (!this.active) return;
    const step = trainingSlideIds[this.index]!;
    window.clearTimeout(this.actionTimer);
    this.options.onStageEnd(step);
    this.hand.hidden = true;
    this.status.textContent = 'SAVING TRAINING PROGRESS…';
    this.retry.hidden = true;
    try {
      const success = this.index === trainingSlideIds.length - 1
        ? await this.options.onComplete()
        : await this.options.onAdvance(this.index, step);
      if (!this.active) return;
      if (success) {
        if (this.index === trainingSlideIds.length - 1) {
          this.close();
          this.options.onFinished();
        } else {
          this.index += 1;
          this.showStage();
        }
        return;
      }
    } catch { /* Show the retry control after a connection failure. */ }
    if (!this.active) return;
    this.status.textContent = 'CONNECTION LOST. TRAINING IS PAUSED.';
    this.retry.hidden = false;
  }
}
