import { TRAINING_FILM_DURATION_MS, trainingFilmScenes, type TrainingFilmSceneId } from '../../shared/training-film.mjs';
import { tutorialInstruction, type TutorialBindings, type TutorialInputMode } from '../../shared/tutorial-flight-rules.mjs';
import './training-film.css';

type FilmControls = { mode: TutorialInputMode; inverted: boolean; bindings: TutorialBindings };
type TrainingFilmOptions = {
  controls: () => FilmControls;
  onClose: () => void;
  onComplete: () => Promise<boolean>;
};

/** A timed, pausable flight demonstration. Only full active playback calls onComplete. */
export class TrainingFilm {
  private readonly root = document.createElement('section');
  private readonly visual: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly instruction: HTMLElement;
  private readonly count: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private elapsed = 0;
  private lastFrame = 0;
  private frame = 0;
  private sceneIndex = -1;
  private paused = false;
  private completing = false;
  private finishingRequest = false;

  constructor(private readonly options: TrainingFilmOptions) {
    this.root.className = 'training-film';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Milwaukee flight training cinematic');
    this.root.innerHTML = `
      <div class="training-film-frame">
        <header class="training-film-header">
          <span>✈ MILWAUKEE FLIGHT SCHOOL <small>WATCH MODE</small></span>
          <button type="button" data-film-close aria-label="Close training film">✕</button>
        </header>
        <div class="training-film-content">
          <div class="training-film-visual" data-scene="intro" aria-hidden="true">
            <div class="training-film-sky"></div>
            <div class="training-film-ground"></div>
            <div class="training-film-runway"></div>
            <div class="training-film-horizon"></div>
            <img class="training-film-plane" src="/media/store-aircraft/trainer.avif" alt="">
            <div class="training-film-hud"><span>❤ 100</span><span>◉ SPEED</span><span>⇧ ALT</span></div>
            <div class="training-film-radar"><i></i><b>⌖</b></div>
            <div class="training-film-map">CITY MAP<br><span>✈ YOU　◇ AIRPORT　◎ TARGET</span></div>
            <div class="training-film-stick"><b>↑</b><i></i><b>↓</b></div>
            <div class="training-film-throttle"><i></i><span>BOOST<br>FAST<br>MED<br>SLOW</span></div>
            <div class="training-film-target">◎</div>
            <div class="training-film-fire">FIRE</div>
            <div class="training-film-objective">MISSION OBJECTIVE →</div>
          </div>
          <div class="training-film-copy">
            <small data-film-count></small>
            <h2 data-film-title></h2>
            <p data-film-detail></p>
            <strong data-film-instruction></strong>
            <p class="training-film-status" data-film-status role="status" aria-live="polite"></p>
          </div>
        </div>
        <footer class="training-film-footer">
          <div class="training-film-progress" role="progressbar" aria-label="Training film progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-film-progress></i></div>
          <span data-film-clock></span>
          <button type="button" data-film-pause>PAUSE</button>
        </footer>
      </div>`;
    this.visual = this.root.querySelector('.training-film-visual')!;
    this.title = this.root.querySelector('[data-film-title]')!;
    this.detail = this.root.querySelector('[data-film-detail]')!;
    this.instruction = this.root.querySelector('[data-film-instruction]')!;
    this.count = this.root.querySelector('[data-film-count]')!;
    this.progress = this.root.querySelector('[data-film-progress]')!;
    this.clock = this.root.querySelector('[data-film-clock]')!;
    this.pauseButton = this.root.querySelector('[data-film-pause]')!;
    this.status = this.root.querySelector('[data-film-status]')!;
    this.root.querySelector<HTMLButtonElement>('[data-film-close]')!.addEventListener('click', () => this.close());
    this.pauseButton.addEventListener('click', () => {
      if (this.completing) {
        void this.finish();
        return;
      }
      this.paused = !this.paused;
      this.pauseButton.textContent = this.paused ? 'RESUME' : 'PAUSE';
      this.root.classList.toggle('is-paused', this.paused);
      this.lastFrame = performance.now();
    });
    document.addEventListener('visibilitychange', () => {
      if (!this.root.hidden && document.hidden) {
        this.paused = true;
        this.pauseButton.textContent = 'RESUME';
        this.root.classList.add('is-paused');
      }
    });
    document.body.append(this.root);
  }

  open(): void {
    this.elapsed = 0;
    this.sceneIndex = -1;
    this.paused = false;
    this.completing = false;
    this.finishingRequest = false;
    this.status.textContent = '';
    this.pauseButton.textContent = 'PAUSE';
    this.root.classList.remove('is-paused');
    this.root.hidden = false;
    this.lastFrame = performance.now();
    this.render();
    this.root.querySelector<HTMLButtonElement>('[data-film-close]')!.focus();
    this.frame = requestAnimationFrame(this.tick);
  }

  isOpen(): boolean { return !this.root.hidden; }

  close(): void {
    if (this.root.hidden || this.finishingRequest) return;
    cancelAnimationFrame(this.frame);
    this.root.hidden = true;
    this.options.onClose();
  }

  private readonly tick = (now: number): void => {
    if (this.root.hidden) return;
    if (!this.paused && !this.completing) {
      // A backgrounded app cannot silently finish the presentation.
      this.elapsed = Math.min(TRAINING_FILM_DURATION_MS, this.elapsed + Math.min(100, Math.max(0, now - this.lastFrame)));
      this.render();
      if (this.elapsed >= TRAINING_FILM_DURATION_MS) {
        this.completing = true;
        void this.finish();
      }
    }
    this.lastFrame = now;
    if (!this.completing) this.frame = requestAnimationFrame(this.tick);
  };

  private async finish(): Promise<void> {
    if (this.finishingRequest) return;
    this.finishingRequest = true;
    this.status.textContent = 'FINISHING TRAINING…';
    this.pauseButton.disabled = true;
    try {
      if (await this.options.onComplete()) return;
    } catch { /* The film stays open so the player can retry. */ }
    this.finishingRequest = false;
    if (this.root.hidden) return;
    this.status.textContent = 'CONNECTION REQUIRED TO UNLOCK DALLAS. TRY AGAIN.';
    this.pauseButton.disabled = false;
    this.pauseButton.textContent = 'RETRY';
  }

  private render(): void {
    let remaining = this.elapsed;
    let index = trainingFilmScenes.length - 1;
    for (let candidate = 0; candidate < trainingFilmScenes.length; candidate += 1) {
      if (remaining < trainingFilmScenes[candidate]!.durationMs) { index = candidate; break; }
      remaining -= trainingFilmScenes[candidate]!.durationMs;
    }
    if (index !== this.sceneIndex) {
      this.sceneIndex = index;
      const scene = trainingFilmScenes[index]!;
      this.visual.dataset.scene = scene.id;
      this.title.textContent = scene.title;
      this.detail.textContent = scene.detail;
      this.instruction.textContent = this.instructionFor(scene.id);
      this.count.textContent = `CHAPTER ${String(index + 1).padStart(2, '0')} / ${trainingFilmScenes.length}`;
    }
    const percent = Math.round(this.elapsed / TRAINING_FILM_DURATION_MS * 100);
    this.progress.style.width = `${percent}%`;
    this.root.querySelector('.training-film-progress')!.setAttribute('aria-valuenow', String(percent));
    const seconds = Math.ceil((TRAINING_FILM_DURATION_MS - this.elapsed) / 1000);
    this.clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} LEFT`;
  }

  private instructionFor(id: TrainingFilmSceneId): string {
    const { mode, inverted, bindings } = this.options.controls();
    const lesson = (step: string) => tutorialInstruction(step, mode, inverted, bindings).controlInstruction;
    switch (id) {
      case 'throttle': return lesson('throttle');
      case 'takeoff': return lesson('takeoff');
      case 'turns': return `${lesson('turnLeft')} ${lesson('turnRight')}`;
      case 'altitude': return `${lesson('climb')} ${lesson('descend')}`;
      case 'camera': return `${lesson('cameraLook')} ${lesson('cameraZoom')}`;
      case 'objective': return lesson('approach');
      case 'target': return lesson('targetLock');
      case 'fire': return lesson('fire');
      case 'landing': return lesson('landing');
      case 'map': return mode === 'touch' ? 'TAP THE RADAR TO OPEN THE CITY MAP.' : 'CLICK THE RADAR TO OPEN THE CITY MAP.';
      case 'players': return 'OPEN PLAYERS ON THE FLIGHT CARD.';
      case 'territories': return 'OPEN TERRITORIES ON THE FLIGHT CARD.';
      case 'hud': return 'WATCH YOUR HEALTH, SPEED, ALTITUDE, AND RADAR.';
      case 'intro': return 'WATCH THE FULL PRESENTATION TO UNLOCK DALLAS.';
      case 'finish': return 'PRACTICE MODE REMAINS AVAILABLE IN MILWAUKEE.';
    }
  }
}
