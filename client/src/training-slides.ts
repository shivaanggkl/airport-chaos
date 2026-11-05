import { trainingSlideIds } from '../../shared/training-slides.mjs';
import type { TutorialLessonStep } from '../../shared/tutorial-flight-rules.mjs';
import './training-slides.css';
import {actionKeyLabel,desktopTurnKeyLabel,menuKeyLabel} from './flight-input';

type Options = {
  host: HTMLElement;
  gameRoot: HTMLElement;
  onAdvance: (index: number, step: TutorialLessonStep) => Promise<boolean>;
  onComplete: () => Promise<boolean>;
  onStage: (step: TutorialLessonStep) => void;
  onReady: (step: TutorialLessonStep) => void;
  onStageEnd: (step: TutorialLessonStep) => void;
  onOpen: () => void;
  onClose: () => void;
  onSkip: () => Promise<boolean>;
  onFinished: () => void;
};

const scenes: Record<(typeof trainingSlideIds)[number], { title: string; detail: string; after?: string; control: string; motion: string }> = {
  throttle: { title: 'BUILD SPEED', detail: 'Slide the speed lever up to ', control: 'throttle', motion: 'up' },
  takeoff: { title: 'TAKE OFF', detail: 'Push the joystick up to ', control: 'stick', motion: 'up' },
  turnLeft: { title: 'TURN LEFT', detail: 'Push the joystick to ', control: 'stick', motion: 'left' },
  turnRight: { title: 'TURN RIGHT', detail: 'Push the joystick to ', control: 'stick', motion: 'right' },
  climb: { title: 'CLIMB', detail: 'Push the joystick up to ', control: 'stick', motion: 'up' },
  descend: { title: 'DESCEND', detail: 'Pull the joystick down to ', control: 'stick', motion: 'down' },
  cameraLook: { title: 'LOOK AROUND', detail: 'Drag the view to ', control: 'view', motion: 'right' },
  cameraZoom: { title: 'ZOOM', detail: 'Pinch the view to ', control: 'view', motion: 'pinch' },
  approach: { title: 'CHECK YOUR ROUTE', detail: 'Tap the radar to ', after: ', then close the map.', control: 'radar', motion: 'tap' },
  fire: { title: 'HIT THE TARGET', detail: 'Hold FIRE to ', after: ' six times.', control: 'fire', motion: 'tap' },
  landing: { title: 'LAND SAFELY', detail: 'Line up, slow down and descend gently to ', control: 'landing', motion: 'down' },
};

const introduction = [
  {title:'WELCOME TO MILWAUKEE', detail:'Welcome, pilot! This is your safe place to learn to fly.',control:'',motion:''},
  {title:'YOUR FIRST FLIGHT',detail:'You will take off, fly, shoot a practice aircraft and land safely. We will guide you one step at a time.',control:'',motion:''},
  {title:'JOYSTICK · STEER',detail:'Move left or right to turn. Push up to climb. Pull down to descend. Release gently to steady the plane.',desktop:`${desktopTurnKeyLabel}: turn. ${actionKeyLabel('pitchUp')}: climb. ${actionKeyLabel('pitchDown')}: descend. Release gently to steady the plane.`,control:'stick',motion:'up'},
  {title:'SPEED LEVER · THROTTLE',detail:'Slide up to go faster. Slide down to slow down. Build speed on the runway before lifting off.',desktop:`${actionKeyLabel('throttleUp')}: faster. ${actionKeyLabel('throttleDown')}: slower. Build speed on the runway before lifting off.`,control:'throttle',motion:'up'},
  {title:'FIRE · PRACTICE SHOOTING',detail:'Point your plane at the practice aircraft. Keep it inside the aim circle, get close and hold FIRE.',desktop:`Point at the practice aircraft. Keep it inside the aim circle, get close and hold ${actionKeyLabel('fire')} to shoot.`,control:'fire',motion:'tap'},
  {title:'RADAR · FIND YOUR WAY',detail:'Radar shows nearby airports and your target. Tap the map icon to see the map and plan your route.',desktop:`Radar shows nearby airports and your target. Press ${menuKeyLabel('map')} to open the map and plan your route.`,control:'radar',motion:'tap'},
  {title:'LAND · SLOW AND GENTLE',detail:'Line up with the runway. Lower the speed lever, keep enough speed to fly and descend gently with the joystick. Level out just above the runway, touch down and slow to a stop.',desktop:`Line up with the runway. Use ${actionKeyLabel('throttleDown')} to slow down. Keep enough speed to fly and descend gently with ${actionKeyLabel('pitchDown')}. Level out just above the runway, touch down and slow to a stop.`,control:'landing',motion:'down'},
  {title:'FOLLOW THE TASK BOX',detail:'Your next task appears in this box below the plane. Read it, do what it says and wait for the next task. Ready to try?',control:'task',motion:'tap'},
] as const;

function needsHeldControl(step: TutorialLessonStep): boolean {
  return step === 'throttle' || step === 'takeoff' || step === 'turnLeft' ||
    step === 'turnRight' || step === 'climb' || step === 'descend';
}

/** Guided screenplay that advances only after the pilot performs each lesson. */
export class TrainingSlides {
  private readonly root = document.createElement('section');
  private readonly hand = document.createElement('div');
  private readonly skip = document.createElement('button');
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly tail: HTMLElement;
  private guidance = '';
  private readonly count: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly timeProgress: HTMLElement;
  private readonly timeFill: HTMLElement;
  private readonly status: HTMLElement;
  private index = 0;
  private introIndex: number | null = null;
  private introSeen = false;
  private readonly introActions=document.createElement('div');
  private readonly introBack=document.createElement('button');
  private readonly introNext=document.createElement('button');
  private completionTimer: number | undefined;
  private active = false;
  private ready = false;
  private playerActionStarted = false;
  private playerActionMs = 0;
  private progressPercent = -1;
  private actionObserved = false;
  private completing = false;
  private saving = false;
  private suspended = false;
  private saveRetries = 0;

  constructor(private readonly options: Options) {
    this.root.className = 'guided-tutorial-panel training-screenplay';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = '<header><small>FLIGHT INSTRUCTOR · MILWAUKEE</small><span data-scene-count></span></header><h2><span data-scene-detail></span><strong data-scene-title></strong><span data-scene-tail></span></h2><div class="training-screenplay-progress" data-scene-progress></div><p data-scene-status></p><div class="training-screenplay-time" data-scene-time role="progressbar" aria-label="Task progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><i data-scene-time-fill></i></div>';
    this.title = this.root.querySelector('[data-scene-title]')!;
    this.detail = this.root.querySelector('[data-scene-detail]')!;
    this.tail = this.root.querySelector('[data-scene-tail]')!;
    this.count = this.root.querySelector('[data-scene-count]')!;
    this.progress = this.root.querySelector('[data-scene-progress]')!;
    this.timeProgress = this.root.querySelector('[data-scene-time]')!;
    this.timeFill = this.root.querySelector('[data-scene-time-fill]')!;
    this.status = this.root.querySelector('[data-scene-status]')!;
    this.hand.className = 'training-screenplay-hand';
    this.hand.setAttribute('aria-hidden', 'true');
    this.hand.innerHTML = '<span>👆</span><span>👆</span>';
    this.hand.hidden = true;
    this.skip.type = 'button';
    this.skip.className = 'mission-intro-skip training-screenplay-skip';
    this.skip.textContent = 'SKIP TRAINING';
    this.skip.hidden = true;
    this.skip.addEventListener('click', async () => {
      if(this.introIndex!==null){this.finishIntroduction();return;}
      this.skip.disabled = true;
      const skipped = await this.options.onSkip();
      if (!skipped && this.active) {
        this.status.textContent = 'CONNECTION REQUIRED TO SKIP TRAINING.';
        this.skip.disabled = false;
      }
    });
    this.introActions.className='training-intro-actions';this.introActions.hidden=true;
    this.introBack.type='button';this.introBack.textContent='BACK';
    this.introNext.type='button';this.introNext.textContent='NEXT';
    this.introBack.addEventListener('click',()=>{if(this.introIndex!==null&&!this.suspended){this.introIndex=Math.max(0,this.introIndex-1);this.showIntroduction();}});
    this.introNext.addEventListener('click',()=>{if(this.introIndex===null||this.suspended)return;if(this.introIndex===introduction.length-1)this.finishIntroduction();else{this.introIndex++;this.showIntroduction();}});
    this.introActions.append(this.introBack,this.introNext);this.root.append(this.introActions);
    options.host.append(this.root);
    options.gameRoot.append(this.skip);
    document.body.append(this.hand);
  }

  isOpen(): boolean { return this.active; }
  retryPendingSave(): void {
    if (!this.active || !this.completing || this.saving || this.suspended || this.saveRetries === 0) return;
    window.clearTimeout(this.completionTimer);
    void this.advance();
  }
  currentIndex(): number { return this.index; }
  currentStep(): TutorialLessonStep | undefined { return this.active && this.introIndex===null ? trainingSlideIds[this.index] : undefined; }
  isPlayerTurn(step: TutorialLessonStep): boolean { return this.active && !this.suspended && this.ready && !this.saving && this.currentStep() === step; }
  acceptsInput(step: TutorialLessonStep): boolean { return this.active && !this.suspended && this.ready && !this.actionObserved && !this.saving && this.currentStep() === step; }

  suspend(): void {
    if (!this.active || this.suspended) return;
    this.suspended = true;
    window.clearTimeout(this.completionTimer);
    this.hand.hidden = true;
  }

  resume(index = this.index): void {
    if (!Number.isInteger(index) || index < 0 || index >= trainingSlideIds.length) index = this.index;
    if (!this.active) { this.open(index); return; }
    this.suspended = false;
    if(this.introIndex!==null){this.showIntroduction();return;}
    if (index !== this.index) {
      this.options.onStageEnd(trainingSlideIds[this.index]!);
      this.index = index;
      this.showStage();
      return;
    }
    if (this.saving) return;
    if (this.completing) {
      this.completionTimer = window.setTimeout(() => { void this.advance(); }, 850);
    } else if (this.ready) {
      if (!this.playerActionStarted) this.positionHand(scenes[trainingSlideIds[this.index]!].control, scenes[trainingSlideIds[this.index]!].motion);
    } else this.makeReady(trainingSlideIds[this.index]!);
  }

  beginAction(step: TutorialLessonStep): void {
    if (!this.isPlayerTurn(step) || this.playerActionStarted) return;
    this.playerActionStarted = true;
    this.hand.hidden = true;
  }

  updateProgress(step: TutorialLessonStep, deltaSeconds: number, controlActive = this.actionObserved): void {
    if (!this.isPlayerTurn(step) || !this.playerActionStarted || !controlActive || this.completing) return;
    this.playerActionMs = Math.min(3_000, this.playerActionMs + Math.max(0, deltaSeconds) * 1_000);
    if (this.playerActionMs >= 3_000 && this.actionObserved) this.completeStep();
    else this.renderProgress(Math.min(99, Math.floor(this.playerActionMs / 30)));
  }

  private renderProgress(percent: number): void {
    if (percent === this.progressPercent) return;
    this.progressPercent = percent;
    this.timeFill.style.width = `${percent}%`;
    this.timeProgress.setAttribute('aria-valuenow', String(percent));
  }

  setGuidance(detail: string): void {
    if (!this.active || this.introIndex!==null || this.completing || this.guidance === detail) return;
    this.guidance = detail;
    this.detail.textContent = '';
    this.title.textContent = detail;
    this.tail.textContent = '';
  }

  recordAction(step: TutorialLessonStep): void {
    if (!this.acceptsInput(step)) return;
    this.beginAction(step);
    this.actionObserved = true;
    this.status.textContent = needsHeldControl(step) ? 'NICE! KEEP HOLDING' : 'NICE!';
    if (this.playerActionMs >= 3_000) this.completeStep();
  }

  completeAction(step: TutorialLessonStep): void {
    if (!this.acceptsInput(step)) return;
    this.recordAction(step);
    this.completeStep();
  }

  private completeStep(): void {
    if (!this.active || this.completing) return;
    this.completing = true;
    this.renderProgress(100);
    this.status.innerHTML = 'NICE! <strong>✓ COMPLETED</strong>';
    this.status.classList.add('is-complete');
    this.completionTimer = window.setTimeout(() => { void this.advance(); }, 850);
  }

  restart(): void {
    if (!this.active) return;
    window.clearTimeout(this.completionTimer);
    this.options.onStageEnd(trainingSlideIds[this.index]!);
    this.index = 0;
    this.showStage();
  }

  retryStage(index = this.index): void {
    if (!this.active) return;
    if (!Number.isInteger(index) || index < 0 || index >= trainingSlideIds.length) return;
    window.clearTimeout(this.completionTimer);
    this.options.onStageEnd(trainingSlideIds[this.index]!);
    this.index = index;
    this.showStage();
  }

  open(index = 0): void {
    if (this.active) return;
    this.active = true;
    this.suspended = false;
    this.index = Number.isInteger(index) && index >= 0 && index < trainingSlideIds.length ? index : 0;
    this.root.hidden = false;
    this.skip.disabled = false;
    this.skip.hidden = false;
    this.options.gameRoot.classList.add('training-screenplay-active');
    this.options.onOpen();
    if(this.index===0&&!this.introSeen){this.introIndex=0;this.showIntroduction();}else this.showStage();
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.introIndex=null;this.introActions.hidden=true;
    this.root.classList.remove('is-introduction');
    this.suspended = false;
    this.ready = false;
    window.clearTimeout(this.completionTimer);
    this.hand.hidden = true;
    this.skip.hidden = true;
    this.root.hidden = true;
    this.options.gameRoot.classList.remove('training-screenplay-active');
    document.body.dataset.trainingSlideControl = '';
    this.options.onStageEnd(trainingSlideIds[this.index]!);
    this.options.onClose();
  }

  private showIntroduction():void {
    if(this.introIndex===null||!this.active||this.suspended)return;
    const scene=introduction[this.introIndex]!;
    this.ready=false;this.root.classList.add('is-introduction');this.introActions.hidden=false;
    this.title.textContent=scene.title;this.detail.textContent='';
    const touch=Boolean(document.querySelector('[data-touch-control="stick"]')?.getBoundingClientRect().width);
    this.tail.textContent=!touch&&'desktop' in scene?scene.desktop:scene.detail;
    this.count.textContent=`${this.introIndex+1} / ${introduction.length}`;
    this.status.textContent='INTRODUCTION · WATCH FIRST';this.status.classList.remove('is-complete');
    this.timeProgress.hidden=true;this.progress.replaceChildren();
    this.skip.textContent='SKIP INTRO';this.introBack.disabled=this.introIndex===0;
    this.introNext.textContent=this.introIndex===introduction.length-1?'START TRAINING':'NEXT';
    document.body.dataset.trainingSlideControl=scene.control;
    this.positionHand(scene.control,scene.motion);
  }
  private finishIntroduction():void {
    this.introSeen=true;this.introIndex=null;this.introActions.hidden=true;
    this.root.classList.remove('is-introduction');this.skip.textContent='SKIP TRAINING';this.showStage();
  }

  private showStage(): void {
    if (!this.active) return;
    this.introIndex=null;this.introActions.hidden=true;
    this.root.classList.remove('is-introduction');this.skip.textContent='SKIP TRAINING';
    const step = trainingSlideIds[this.index]!;
    const scene = scenes[step];
    this.ready = false;
    this.playerActionStarted = false;
    this.playerActionMs = 0;
    this.progressPercent = -1;
    this.renderProgress(0);
    this.timeProgress.hidden = true;
    this.actionObserved = false;
    this.completing = false;
    this.saving = false;
    this.saveRetries = 0;
    this.title.textContent = scene.title;
    this.detail.textContent = scene.detail;
    this.tail.textContent = scene.after ?? '.';
    this.guidance = '';
    this.count.textContent = String(this.index + 1) + ' / ' + String(trainingSlideIds.length);
    this.status.textContent = '';
    this.status.classList.remove('is-complete');
    this.progress.replaceChildren(...trainingSlideIds.map((_, index) => {
      const dot = document.createElement('i');
      dot.classList.toggle('is-seen', index <= this.index);
      dot.classList.toggle('is-current', index === this.index);
      return dot;
    }));
    document.body.dataset.trainingSlideControl = scene.control;
    this.positionHand(scene.control, scene.motion);
    this.options.onStage(step);
    this.makeReady(step);
  }

  private makeReady(step: TutorialLessonStep): void {
    if (!this.active || this.suspended || this.currentStep() !== step) return;
    this.ready = true;
    this.status.textContent = needsHeldControl(step) ? 'YOUR TURN · HOLD UNTIL FULL' : 'YOUR TURN';
    this.timeProgress.hidden = false;
    this.options.onReady(step);
  }

  private positionHand(control: string, motion: string): void {
    if (this.suspended) { this.hand.hidden = true; return; }
    if(!control){this.hand.hidden=true;return;}
    const selector = control === 'task' ? '.training-screenplay' : control === 'view' ? '#game-root canvas'
      : control === 'radar' ? '#radar-panel'
      : control === 'landing' ? '[data-touch-control="throttle"]'
      : '[data-touch-control="' + control + '"]';
    const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) { this.hand.hidden = true; return; }
    this.hand.hidden = false;
    this.hand.style.left = String(rect.left + rect.width * (control==='task'?.94:.5)) + 'px';
    this.hand.style.top = String(rect.top + rect.height * .5) + 'px';
    this.hand.dataset.motion = motion;
  }

  private async advance(): Promise<void> {
    if (!this.active || !this.actionObserved || this.saving || this.suspended) return;
    this.saving = true;
    const step = trainingSlideIds[this.index]!;
    this.options.onStageEnd(step);
    this.hand.hidden = true;
    this.status.textContent = 'SAVING TRAINING PROGRESS…';
    this.status.classList.remove('is-complete');
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
    } catch { /* A failed save follows the same retry path as a rejected response. */ }
    if (!this.active) return;
    this.saving = false;
    if (this.suspended) return; // Resume retries the completed lesson after the app returns.
    if (this.saveRetries++ < 2) {
      this.completionTimer = window.setTimeout(() => { void this.advance(); }, this.saveRetries * 1_000);
      return;
    }
    this.status.textContent = 'UNABLE TO SAVE PROGRESS. REOPEN TRAINING.';
  }
}
