export type AudioLevelKey = 'master' | 'music' | 'engine' | 'combat' | 'ui';

export type AudioLevels = Record<AudioLevelKey, number>;

type AudioCategory = 'music' | 'ui' | 'engine' | 'weapons' | 'impacts';
type ExtendedAudioContextState = AudioContextState | 'interrupted';
type EnginePresentationState = {
  frequency: number;
  gain: number;
  frequencyTimeConstant: number;
  gainTimeConstant: number;
};

const FOREGROUND_RESUME_DELAYS_MS = [0, 90, 220] as const;
const lifecycleDelay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const AUDIO_LEVELS_KEY = 'airport-chaos-audio-levels-v1';
const DEFAULT_LEVELS: AudioLevels = {
  master: 100,
  music: 72,
  engine: 95,
  combat: 100,
  ui: 80,
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const readStoredLevels = (): AudioLevels => {
  if (typeof window === 'undefined') return { ...DEFAULT_LEVELS };
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUDIO_LEVELS_KEY) ?? '{}') as Partial<AudioLevels>;
    return {
      master: clampPercent(stored.master ?? DEFAULT_LEVELS.master),
      music: clampPercent(stored.music ?? DEFAULT_LEVELS.music),
      engine: clampPercent(stored.engine ?? DEFAULT_LEVELS.engine),
      combat: clampPercent(stored.combat ?? DEFAULT_LEVELS.combat),
      ui: clampPercent(stored.ui ?? DEFAULT_LEVELS.ui),
    };
  } catch {
    return { ...DEFAULT_LEVELS };
  }
};

const isDisabledControl = (element: Element) => {
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) return element.disabled;
  return element.getAttribute('aria-disabled') === 'true';
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
};

class AudioManager {
  private context: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private categoryGains = new Map<AudioCategory, GainNode>();
  private musicMix: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private levels = readStoredLevels();
  private muted = false;
  private unlocked = false;
  private menuMusicDesired = true;
  private musicTimer: number | null = null;
  private musicStopTimer: number | null = null;
  private musicStep = 0;
  private nextMusicStepTime = 0;
  private uiListenerInstalled = false;
  private lifecycleInstalled = false;
  private resumeFallbackArmed = false;
  private lifecycleResume: Promise<void> | null = null;
  private lifecycleRecoveryTimer: number | null = null;
  private contextGeneration = 0;
  private contextStateListener: (() => void) | null = null;
  private backgrounded = false;
  private graphInvalidated = false;
  private enginePresentation: EnginePresentationState | null = null;
  private confirmActiveUntil = 0;
  private uiClickActiveUntil = 0;
  private hitActiveUntil = 0;
  private rewardActiveUntil = 0;
  private purchaseActiveUntil = 0;
  private priorityImpactUntil = 0;

  getLevels() {
    return { ...this.levels };
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyLevels();
    if (muted) this.stopMenuScheduler();
    else if (this.unlocked && this.menuMusicDesired && typeof document !== 'undefined' && !document.hidden) this.startMenuMusic();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setLevel(category: AudioLevelKey, value: number, persist = true) {
    this.levels[category] = clampPercent(value);
    if (persist && typeof window !== 'undefined') {
      window.localStorage.setItem(AUDIO_LEVELS_KEY, JSON.stringify(this.levels));
    }
    this.applyLevels();
  }

  install() {
    if (typeof document === 'undefined' || this.uiListenerInstalled) return;
    this.uiListenerInstalled = true;
    const unlockFromGesture = () => {
      if (!this.unlocked || this.resumeFallbackArmed || this.context?.state !== 'running') void this.unlock();
    };
    document.addEventListener('pointerdown', unlockFromGesture, { capture: true });
    document.addEventListener('keydown', (event) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
        void this.unlock();
      }
    }, { capture: true });
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('button, [role="button"], input[type="button"], input[type="submit"]')
        : null;
      if (!target || isDisabledControl(target)) return;
      const label = `${target.getAttribute('aria-label') ?? ''} ${target.textContent ?? ''}`.trim();
      if (/\b(back|close|cancel|return)\b/i.test(label)) {
        this.playBack();
      } else if (/\b(fly|play|launch)\b/i.test(label) || target.classList.contains('entry-button-primary')) {
        this.playConfirm();
      } else {
        this.playUiClick();
      }
    });
    window.addEventListener('airport-chaos-ui-back', () => this.playBack());
    this.installLifecycleHandling();
  }

  async unlock() {
    if (this.lifecycleResume) await this.lifecycleResume;
    let context = this.ensureContext();
    if (!context) return false;
    let running = await this.resumeContext(context, 'gesture', [0]);
    if (!running && this.context === context && this.contextState(context) !== 'closed') {
      context = this.rebuildContext('gesture-rebuild');
      running = Boolean(context && await this.resumeContext(context, 'gesture-rebuild', [0]));
    }
    this.unlocked = running;
    if (!running) {
      this.resumeFallbackArmed = true;
      return false;
    }
    this.resumeFallbackArmed = false;
    this.graphInvalidated = false;
    this.restoreLogicalAudioState();
    return true;
  }

  setMenuMusicDesired(desired: boolean) {
    this.menuMusicDesired = desired;
    if (!this.context || !this.musicMix) return;
    const now = this.context.currentTime;
    this.musicMix.gain.cancelScheduledValues(now);
    this.musicMix.gain.setValueAtTime(Math.max(0.0001, this.musicMix.gain.value), now);
    this.musicMix.gain.exponentialRampToValueAtTime(desired ? 1 : 0.0001, now + (desired ? 0.45 : 0.8));
    if (desired && this.unlocked && !this.muted && !document.hidden) {
      this.startMenuMusic();
      return;
    }
    if (this.musicStopTimer !== null) window.clearTimeout(this.musicStopTimer);
    this.musicStopTimer = window.setTimeout(() => {
      if (!this.menuMusicDesired) this.stopMenuScheduler();
    }, 850);
  }

  playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    endFrequency?: number,
    delay = 0,
    category: Exclude<AudioCategory, 'music'> = 'ui',
  ) {
    const context = this.context;
    const output = this.categoryGains.get(category);
    if (!context || !output || context.state !== 'running' || this.muted) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const toneGain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    toneGain.gain.setValueAtTime(0.0001, start);
    toneGain.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.015, duration * 0.4));
    toneGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(toneGain);
    toneGain.connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      toneGain.disconnect();
    }, { once: true });
  }

  updateEngine(frequency: number, gain: number, frequencyTimeConstant = 0.05, gainTimeConstant = frequencyTimeConstant) {
    this.enginePresentation = { frequency, gain, frequencyTimeConstant, gainTimeConstant };
    const context = this.context;
    const output = this.categoryGains.get('engine');
    if (!context || !output || context.state !== 'running') return;
    this.applyEnginePresentation(context, output, this.enginePresentation);
  }

  playUiClick() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    if (now < this.uiClickActiveUntil) return;
    this.uiClickActiveUntil = now + 0.055;
    this.playPitchDrop('ui', 145, 78, 0.075, 0.1, now);
    this.playPitchDrop('ui', 92, 58, 0.09, 0.04, now + 0.012, 'triangle');
    this.playNoise('ui', now, 0.045, 0.026, 'bandpass', 920);
  }

  playConfirm() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    if (now < this.confirmActiveUntil) return;
    this.confirmActiveUntil = now + 1;
    if (this.musicMix && this.menuMusicDesired) {
      this.musicMix.gain.cancelScheduledValues(now);
      this.musicMix.gain.setValueAtTime(Math.max(0.0001, this.musicMix.gain.value), now);
      this.musicMix.gain.linearRampToValueAtTime(0.72, now + 0.055);
      this.musicMix.gain.setValueAtTime(0.72, now + 0.68);
      this.musicMix.gain.linearRampToValueAtTime(1, now + 1.05);
    }
    this.scheduleConfirmMechanicalLock(now);
    this.playPitchDrop('ui', 86, 30, 0.58, 0.34, now + 0.045);
    this.playNoise('ui', now + 0.045, 0.28, 0.12, 'lowpass', 720);
    this.scheduleConfirmPowerRise(now + 0.105);
    this.scheduleConfirmHeroicSting(now + 0.54);
  }

  private scheduleConfirmMechanicalLock(startTime: number) {
    const context = this.context;
    const output = this.categoryGains.get('ui');
    if (!context || !output) return;
    [186, 112].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = index === 0 ? 'square' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, startTime + index * 0.028);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.58, startTime + 0.075 + index * 0.028);
      envelope.gain.setValueAtTime(index === 0 ? 0.075 : 0.105, startTime + index * 0.028);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.085 + index * 0.028);
      oscillator.connect(envelope);
      envelope.connect(output);
      oscillator.start(startTime + index * 0.028);
      oscillator.stop(startTime + 0.1 + index * 0.028);
    });
    this.playNoise('ui', startTime, 0.075, 0.055, 'bandpass', 1120);
  }

  private scheduleConfirmPowerRise(startTime: number) {
    const context = this.context;
    const output = this.categoryGains.get('ui');
    const noise = this.getNoiseBuffer();
    if (!context || !output || !noise) return;
    const noiseSource = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseEnvelope = context.createGain();
    noiseSource.buffer = noise;
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.value = 0.75;
    noiseFilter.frequency.setValueAtTime(420, startTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(2_800, startTime + 0.58);
    noiseEnvelope.gain.setValueAtTime(0.0001, startTime);
    noiseEnvelope.gain.linearRampToValueAtTime(0.105, startTime + 0.46);
    noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.66);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseEnvelope);
    noiseEnvelope.connect(output);
    noiseSource.start(startTime, 0, 0.65);
    [92, 138].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      oscillator.type = index === 0 ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 2.35, startTime + 0.58);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(390, startTime);
      filter.frequency.exponentialRampToValueAtTime(1_850, startTime + 0.58);
      envelope.gain.setValueAtTime(0.0001, startTime);
      envelope.gain.linearRampToValueAtTime(index === 0 ? 0.04 : 0.027, startTime + 0.42);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.68);
      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(output);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.7);
    });
  }

  private scheduleConfirmHeroicSting(startTime: number) {
    const context = this.context;
    const output = this.categoryGains.get('ui');
    if (!context || !output) return;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1_050, startTime);
    filter.frequency.linearRampToValueAtTime(1_750, startTime + 0.16);
    filter.connect(output);
    [220, 293.66, 369.99].forEach((frequency, index) => {
      for (const detune of [-5, 5]) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = detune < 0 ? 'sawtooth' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, startTime);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.1225, startTime + 0.24);
        oscillator.detune.value = detune;
        envelope.gain.setValueAtTime(0.0001, startTime);
        envelope.gain.linearRampToValueAtTime(0.025 - index * 0.003, startTime + 0.045);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.38);
        oscillator.connect(envelope);
        envelope.connect(filter);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.4);
      }
    });
    this.playNoise('ui', startTime, 0.2, 0.045, 'bandpass', 1_650);
  }

  playBack() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    this.playPitchDrop('ui', 185, 88, 0.11, 0.085, now, 'triangle');
    this.playNoise('ui', now, 0.06, 0.03, 'bandpass', 650);
  }

  playDestroyConfirm() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    this.priorityImpactUntil = now + 1.05;
    this.playPitchDrop('impacts', 82, 29, 0.52, 0.42, now);
    this.playPitchDrop('impacts', 168, 48, 0.34, 0.22, now + 0.015, 'sawtooth');
    this.playNoise('impacts', now, 0.42, 0.25, 'lowpass', 780);
    this.playMetalTail(now + 0.04);
    this.playChord('impacts', [196, 246.94, 293.66], now + 0.21, 0.42, 0.045);
  }

  playReward() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    if (now < this.rewardActiveUntil || now < this.priorityImpactUntil) return;
    this.rewardActiveUntil = now + 0.9;
    this.scheduleRewardRise(now);
    this.playPitchDrop('impacts', 92, 44, 0.26, 0.17, now + 0.16);
    this.playChord('impacts', [293.66, 369.99, 440], now + 0.28, 0.44, 0.038);
    this.playNoise('impacts', now + 0.16, 0.18, 0.055, 'bandpass', 1_750);
  }

  playHitConfirm() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    if (now < this.hitActiveUntil) return;
    this.hitActiveUntil = now + 0.075;
    this.playPitchDrop('impacts', 1_100, 640, 0.085, 0.055, now, 'square');
    this.playPitchDrop('impacts', 235, 118, 0.09, 0.032, now, 'sawtooth');
    this.playNoise('impacts', now, 0.07, 0.046, 'bandpass', 2_350);
  }

  playPurchaseSuccess() {
    const context = this.context;
    if (!context || context.state !== 'running' || this.muted) return;
    const now = context.currentTime;
    if (now < this.purchaseActiveUntil) return;
    this.purchaseActiveUntil = now + 1.2;
    this.priorityImpactUntil = now + 1.2;
    this.scheduleConfirmMechanicalLock(now);
    this.playPitchDrop('impacts', 78, 28, 0.62, 0.38, now + 0.045);
    this.playNoise('impacts', now + 0.05, 0.32, 0.14, 'lowpass', 690);
    this.schedulePurchaseFinish(now + 0.34);
  }

  private scheduleRewardRise(startTime: number) {
    const context = this.context;
    const output = this.categoryGains.get('impacts');
    if (!context || !output) return;
    [196, 293.66].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      oscillator.type = index === 0 ? 'triangle' : 'sawtooth';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, startTime + 0.34);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(780, startTime);
      filter.frequency.linearRampToValueAtTime(2_100, startTime + 0.34);
      envelope.gain.setValueAtTime(0.0001, startTime);
      envelope.gain.linearRampToValueAtTime(index === 0 ? 0.037 : 0.023, startTime + 0.2);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.42);
      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(output);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.44);
    });
  }

  private schedulePurchaseFinish(startTime: number) {
    const context = this.context;
    const output = this.categoryGains.get('impacts');
    const noise = this.getNoiseBuffer();
    if (!context || !output || !noise) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(650, startTime);
    filter.frequency.exponentialRampToValueAtTime(3_200, startTime + 0.52);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(0.085, startTime + 0.36);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.62);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(startTime, 0, 0.63);
    [220, 277.18, 369.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const toneEnvelope = context.createGain();
      oscillator.type = index === 0 ? 'triangle' : 'sawtooth';
      oscillator.frequency.setValueAtTime(frequency, startTime + 0.18);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.1892, startTime + 0.48);
      toneEnvelope.gain.setValueAtTime(0.0001, startTime + 0.18);
      toneEnvelope.gain.linearRampToValueAtTime(0.033 - index * 0.004, startTime + 0.3);
      toneEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.72);
      oscillator.connect(toneEnvelope);
      toneEnvelope.connect(output);
      oscillator.start(startTime + 0.18);
      oscillator.stop(startTime + 0.74);
    });
  }

  private ensureContext() {
    if (this.context && this.contextState(this.context) !== 'closed') return this.context;
    if (this.context) this.clearGraphReferences();
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const context = new AudioContextCtor();
    const generation = ++this.contextGeneration;
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;
    master.connect(compressor);
    compressor.connect(context.destination);
    this.context = context;
    this.masterGain = master;
    this.compressor = compressor;
    for (const category of ['music', 'ui', 'engine', 'weapons', 'impacts'] as const) {
      const gain = context.createGain();
      gain.connect(master);
      this.categoryGains.set(category, gain);
    }
    this.musicMix = context.createGain();
    this.musicMix.gain.value = this.menuMusicDesired ? 1 : 0.0001;
    this.musicMix.connect(this.categoryGains.get('music')!);
    this.contextStateListener = () => this.logLifecycle('context-statechange', context, generation);
    context.addEventListener('statechange', this.contextStateListener);
    this.applyLevels();
    this.logLifecycle('context-created', context, generation);
    return context;
  }

  private contextState(context: AudioContext): ExtendedAudioContextState {
    return context.state as ExtendedAudioContextState;
  }

  private logLifecycle(event: string, context = this.context, generation = this.contextGeneration, detail = '') {
    const state = context ? this.contextState(context) : 'none';
    console.info('[AirportChaosAudio]', JSON.stringify({ event, state, generation, detail }));
  }

  private clearGraphReferences() {
    this.stopEngineSource();
    this.musicMix?.disconnect();
    for (const gain of this.categoryGains.values()) gain.disconnect();
    this.categoryGains.clear();
    this.masterGain?.disconnect();
    this.compressor?.disconnect();
    this.musicMix = null;
    this.masterGain = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.context = null;
    this.contextStateListener = null;
    this.confirmActiveUntil = 0;
    this.uiClickActiveUntil = 0;
    this.hitActiveUntil = 0;
    this.rewardActiveUntil = 0;
    this.purchaseActiveUntil = 0;
    this.priorityImpactUntil = 0;
  }

  private rebuildContext(reason: string) {
    const previous = this.context;
    const previousGeneration = this.contextGeneration;
    const previousStateListener = this.contextStateListener;
    this.stopMenuScheduler(false);
    if (this.musicStopTimer !== null) window.clearTimeout(this.musicStopTimer);
    this.musicStopTimer = null;
    if (previous && previousStateListener) previous.removeEventListener('statechange', previousStateListener);
    this.logLifecycle('context-rebuild', previous, this.contextGeneration, reason);
    this.clearGraphReferences();
    if (previous && this.contextState(previous) !== 'closed') {
      void previous.close().then(
        () => this.logLifecycle('old-context-closed', previous, previousGeneration, reason),
        () => this.logLifecycle('old-context-close-failed', previous, previousGeneration, reason),
      );
    }
    return this.ensureContext();
  }

  private stopEngineSource() {
    if (this.engineOscillator) {
      try { this.engineOscillator.stop(); } catch { /* already ended or the old context was interrupted */ }
      this.engineOscillator.disconnect();
    }
    this.engineFilter?.disconnect();
    this.engineGain?.disconnect();
    this.engineOscillator = null;
    this.engineFilter = null;
    this.engineGain = null;
  }

  private applyEnginePresentation(context: AudioContext, output: GainNode, state: EnginePresentationState) {
    if (!this.engineOscillator || !this.engineGain || !this.engineFilter) {
      this.engineOscillator = context.createOscillator();
      this.engineFilter = context.createBiquadFilter();
      this.engineGain = context.createGain();
      this.engineOscillator.type = 'sawtooth';
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 180;
      this.engineGain.gain.value = 0;
      this.engineOscillator.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(output);
      this.engineOscillator.start();
    }
    this.engineOscillator.frequency.setTargetAtTime(state.frequency, context.currentTime, state.frequencyTimeConstant);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : state.gain, context.currentTime, state.gainTimeConstant);
  }

  private applyLevels() {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    const setGain = (gain: GainNode | undefined | null, value: number) => {
      if (!gain) return;
      gain.gain.setTargetAtTime(Math.max(0, value), now, 0.025);
    };
    setGain(this.masterGain, this.muted ? 0 : (this.levels.master / 100) * 1.25);
    setGain(this.categoryGains.get('music'), (this.levels.music / 100) * 0.62);
    setGain(this.categoryGains.get('ui'), this.levels.ui / 100);
    setGain(this.categoryGains.get('engine'), this.levels.engine / 100);
    setGain(this.categoryGains.get('weapons'), (this.levels.combat / 100) * 1.05);
    setGain(this.categoryGains.get('impacts'), (this.levels.combat / 100) * 1.05);
  }

  private playPitchDrop(
    category: Exclude<AudioCategory, 'music'>,
    startFrequency: number,
    endFrequency: number,
    duration: number,
    gain: number,
    startTime: number,
    type: OscillatorType = 'sine',
  ) {
    const context = this.context;
    const output = this.categoryGains.get(category);
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const saturator = context.createWaveShaper();
    saturator.curve = new Float32Array(Array.from({ length: 256 }, (_, index) => {
      const x = (index / 255) * 2 - 1;
      return Math.tanh(x * 2.2);
    }));
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    envelope.gain.setValueAtTime(Math.max(0.0001, gain), startTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(envelope);
    envelope.connect(saturator);
    saturator.connect(output);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.01);
  }

  private getNoiseBuffer() {
    if (!this.context) return null;
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.ceil(this.context.sampleRate * 0.65);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const envelope = 1 - index / length;
      channel[index] = (Math.random() * 2 - 1) * envelope;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playNoise(
    category: Exclude<AudioCategory, 'music'>,
    startTime: number,
    duration: number,
    gain: number,
    filterType: BiquadFilterType,
    frequency: number,
  ) {
    const context = this.context;
    const output = this.categoryGains.get(category);
    const buffer = this.getNoiseBuffer();
    if (!context || !output || !buffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === 'bandpass' ? 1.2 : 0.6;
    envelope.gain.setValueAtTime(Math.max(0.0001, gain), startTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(startTime, 0, Math.min(duration, buffer.duration));
  }

  private playChord(category: Exclude<AudioCategory, 'music'>, frequencies: number[], startTime: number, duration: number, gain: number) {
    const context = this.context;
    const output = this.categoryGains.get(category);
    if (!context || !output) return;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1150;
    filter.Q.value = 0.7;
    filter.connect(output);
    frequencies.forEach((frequency) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(Math.max(0.0001, gain), startTime);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(envelope);
      envelope.connect(filter);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.01);
    });
  }

  private playMetalTail(startTime: number) {
    const context = this.context;
    const output = this.categoryGains.get('impacts');
    if (!context || !output) return;
    [620, 913, 1280].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = index === 1 ? 'square' : 'triangle';
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.022, startTime);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.34 + index * 0.05);
      oscillator.connect(envelope);
      envelope.connect(output);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.56);
    });
  }

  private startMenuMusic() {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.musicMix || this.musicTimer !== null || !this.menuMusicDesired || this.muted) return;
    if (this.musicStopTimer !== null) {
      window.clearTimeout(this.musicStopTimer);
      this.musicStopTimer = null;
    }
    this.nextMusicStepTime = context.currentTime + 0.05;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 100);
  }

  private stopMenuScheduler(resetStep = true) {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (resetStep) this.musicStep = 0;
  }

  private scheduleMusic() {
    const context = this.context;
    if (!context || !this.musicMix || !this.menuMusicDesired || context.state !== 'running') return;
    const stepDuration = 60 / 100 / 4;
    while (this.nextMusicStepTime < context.currentTime + 0.42) {
      this.scheduleMusicStep(this.musicStep, this.nextMusicStepTime);
      this.musicStep = (this.musicStep + 1) % 128;
      this.nextMusicStepTime += stepDuration;
    }
  }

  private scheduleMusicStep(step: number, startTime: number) {
    const musicOutput = this.musicMix;
    const context = this.context;
    if (!context || !musicOutput) return;
    const bar = Math.floor(step / 16);
    const localStep = step % 16;
    const intro = step < 16;
    const breakdown = step >= 96 && step < 112;
    const kickSteps = intro ? [0, 10] : breakdown ? [0, 10, 14] : [0, 3, 7, 10, 14];
    if (kickSteps.includes(localStep)) this.scheduleMusicKick(startTime, musicOutput, intro ? 0.78 : 1);
    if ([4, 12].includes(localStep)) this.scheduleMusicSnare(startTime, musicOutput, intro ? 0.72 : 1);
    const hatHit = intro ? [3, 7, 11, 15].includes(localStep) : localStep % 2 === 1 || (!breakdown && [14].includes(localStep));
    if (hatHit) this.scheduleMusicHat(startTime, musicOutput, localStep >= 13 && !intro ? 0.027 : 0.018);

    const roots = [36.71, 36.71, 41.2, 32.7, 36.71, 43.65, 41.2, 32.7];
    const root = roots[bar];
    const bassSteps = intro ? [0, 10] : breakdown ? [0, 7, 10] : [0, 3, 7, 10, 14];
    if (bassSteps.includes(localStep)) {
      const movement = localStep === 7 ? 1.1225 : localStep === 14 ? 1.1892 : 1;
      this.scheduleMusicBass(startTime, root * movement, musicOutput, intro ? 0.72 : 1);
    }
    if ([0, 4, 8, 12].includes(localStep)) {
      this.scheduleMusicPulse(startTime, root * 3, musicOutput, intro || breakdown ? 0.72 : 1.08);
    }

    const motifs: Record<number, number[]> = {
      16: [146.83, 174.61, 220],
      24: [164.81, 196, 246.94],
      32: [174.61, 220, 293.66],
      40: [196, 246.94, 329.63],
      48: [146.83, 220, 293.66],
      56: [174.61, 261.63, 349.23],
      64: [174.61, 233.08, 293.66],
      72: [196, 246.94, 329.63],
      80: [174.61, 220, 293.66],
      88: [164.81, 220, 277.18],
      112: [146.83, 220, 293.66],
      120: [174.61, 233.08, 349.23],
    };
    if (motifs[step]) this.scheduleMusicMotif(startTime, motifs[step], musicOutput, step >= 112 ? 1.28 : 1.16);
    if ([0, 32, 64, 96].includes(step)) this.scheduleMusicImpact(startTime, musicOutput, step === 0 ? 0.78 : 1);
    if ([12, 60, 124].includes(step)) this.scheduleMusicRiser(startTime, musicOutput);
  }

  private scheduleMusicKick(startTime: number, output: AudioNode, strength: number) {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(148, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(41, startTime + 0.17);
    envelope.gain.setValueAtTime(0.36 * strength, startTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.26);
    const clickBuffer = this.getNoiseBuffer();
    if (clickBuffer) {
      const click = context.createBufferSource();
      const highpass = context.createBiquadFilter();
      const clickEnvelope = context.createGain();
      click.buffer = clickBuffer;
      highpass.type = 'highpass';
      highpass.frequency.value = 1_900;
      clickEnvelope.gain.setValueAtTime(0.045 * strength, startTime);
      clickEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.026);
      click.connect(highpass);
      highpass.connect(clickEnvelope);
      clickEnvelope.connect(output);
      click.start(startTime, 0, 0.03);
    }
  }

  private scheduleMusicSnare(startTime: number, output: AudioNode, strength: number) {
    const context = this.context!;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    [0, 0.018, 0.037].forEach((offset, index) => {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = 1_500 + index * 500;
      filter.Q.value = 0.72;
      envelope.gain.setValueAtTime((index === 0 ? 0.105 : 0.048) * strength, startTime + offset);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + 0.13);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(output);
      source.start(startTime + offset, 0, 0.14);
    });
    const body = context.createOscillator();
    const bodyEnvelope = context.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, startTime);
    body.frequency.exponentialRampToValueAtTime(118, startTime + 0.1);
    bodyEnvelope.gain.setValueAtTime(0.05 * strength, startTime);
    bodyEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);
    body.connect(bodyEnvelope);
    bodyEnvelope.connect(output);
    body.start(startTime);
    body.stop(startTime + 0.13);
  }

  private scheduleMusicHat(startTime: number, output: AudioNode, gain: number) {
    const context = this.context!;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 5_900;
    envelope.gain.setValueAtTime(gain, startTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.042);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(startTime, 0, 0.04);
  }

  private scheduleMusicBass(startTime: number, frequency: number, output: AudioNode, strength: number) {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 255;
    filter.Q.value = 0.95;
    envelope.gain.setValueAtTime(0.102 * strength, startTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.52);
    filter.connect(envelope);
    envelope.connect(output);
    (['sine', 'triangle', 'sawtooth'] as const).forEach((type, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      const harmonic = index === 0 ? 1 : index === 1 ? 2 : 4;
      oscillator.frequency.setValueAtTime(frequency * (index === 0 ? 1.7 : harmonic), startTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * harmonic, startTime + 0.08);
      const layerGain = context.createGain();
      layerGain.gain.value = index === 0 ? 1 : index === 1 ? 0.2 : 0.075;
      oscillator.connect(layerGain);
      layerGain.connect(filter);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.54);
    });
  }

  private scheduleMusicPulse(startTime: number, frequency: number, output: AudioNode, strength: number) {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 560;
    filter.Q.value = 1.2;
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(0.025 * strength, startTime + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
    filter.connect(envelope);
    envelope.connect(output);
    [-7, 7].forEach((detune) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(filter);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.3);
    });
  }

  private scheduleMusicMotif(startTime: number, frequencies: number[], output: AudioNode, strength: number) {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1_050, startTime);
    filter.frequency.linearRampToValueAtTime(2_450, startTime + 0.12);
    filter.Q.value = 1.05;
    filter.connect(output);
    frequencies.forEach((frequency, noteIndex) => {
      [-6, 6].forEach((detune) => {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = detune < 0 ? 'sawtooth' : 'triangle';
        oscillator.frequency.value = detune < 0 ? frequency : frequency * 2;
        oscillator.detune.value = detune;
        envelope.gain.setValueAtTime(0.0001, startTime);
        envelope.gain.linearRampToValueAtTime((0.017 - noteIndex * 0.0015) * strength, startTime + 0.045);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.62);
        oscillator.connect(envelope);
        envelope.connect(filter);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.64);
      });
    });
  }

  private scheduleMusicImpact(startTime: number, output: AudioNode, strength: number) {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(74, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(27, startTime + 0.52);
    envelope.gain.setValueAtTime(0.19 * strength, startTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.58);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.6);
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseEnvelope = context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 680;
    noiseEnvelope.gain.setValueAtTime(0.11 * strength, startTime);
    noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.34);
    source.connect(filter);
    filter.connect(noiseEnvelope);
    noiseEnvelope.connect(output);
    source.start(startTime, 0, 0.36);
  }

  private scheduleMusicRiser(startTime: number, output: AudioNode) {
    const context = this.context!;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(420, startTime);
    filter.frequency.exponentialRampToValueAtTime(3_100, startTime + 0.58);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(0.052, startTime + 0.5);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.62);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(startTime, 0, 0.63);
  }

  private installLifecycleHandling() {
    if (this.lifecycleInstalled || typeof document === 'undefined') return;
    this.lifecycleInstalled = true;
    window.addEventListener('airport-chaos-native-app-state', (event) => {
      const state = (event as CustomEvent<{ state?: string }>).detail?.state;
      if (state === 'inactive' || state === 'background') {
        this.enterBackground(`native:${state}`);
      } else if (state === 'active') {
        this.requestForegroundRecovery('native:active');
      } else if (state) {
        this.logLifecycle('native-lifecycle', this.context, this.contextGeneration, state);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.enterBackground('visibility:hidden');
      } else if (this.unlocked) {
        this.requestForegroundRecovery('visibility:visible');
      }
    });
    window.addEventListener('pagehide', () => this.enterBackground('pagehide'));
    window.addEventListener('pageshow', () => {
      if (this.context && this.unlocked) this.requestForegroundRecovery('pageshow');
    });
    window.addEventListener('focus', () => {
      if (this.context && this.unlocked && !document.hidden) this.requestForegroundRecovery('focus');
    });
  }

  private enterBackground(source: string) {
    if (this.backgrounded) return;
    this.backgrounded = true;
    this.graphInvalidated = true;
    if (this.lifecycleRecoveryTimer !== null) window.clearTimeout(this.lifecycleRecoveryTimer);
    this.lifecycleRecoveryTimer = null;
    this.stopMenuScheduler(false);
    if (this.musicStopTimer !== null) window.clearTimeout(this.musicStopTimer);
    this.musicStopTimer = null;
    this.stopEngineSource();
    const context = this.context;
    this.logLifecycle('background', context, this.contextGeneration, source);
    if (context && this.contextState(context) !== 'closed') {
      void context.suspend().then(
        () => this.logLifecycle('background-suspended', context, this.contextGeneration, source),
        () => this.logLifecycle('background-suspend-failed', context, this.contextGeneration, source),
      );
    }
  }

  private requestForegroundRecovery(source: string): void {
    if (!this.context || !this.unlocked || document.hidden) return;
    this.backgrounded = false;
    this.logLifecycle('foreground-signal', this.context, this.contextGeneration, source);
    if (this.lifecycleResume || this.lifecycleRecoveryTimer !== null) return;
    this.lifecycleRecoveryTimer = window.setTimeout(() => {
      this.lifecycleRecoveryTimer = null;
      if (this.lifecycleResume || document.hidden) return;
      this.lifecycleResume = this.recoverAfterForeground(source).finally(() => {
        this.lifecycleResume = null;
      });
    }, 45);
  }

  private async resumeContext(context: AudioContext, source: string, delays: readonly number[] = FOREGROUND_RESUME_DELAYS_MS): Promise<boolean> {
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (this.context !== context || this.contextState(context) === 'closed') return false;
      const delay = delays[attempt];
      if (delay > 0) await lifecycleDelay(delay);
      if (this.context !== context || document.hidden) return false;
      if (this.contextState(context) === 'running') {
        this.logLifecycle('resume-verified', context, this.contextGeneration, `${source}:${attempt + 1}`);
        return true;
      }
      try {
        await context.resume();
      } catch {
        this.logLifecycle('resume-rejected', context, this.contextGeneration, `${source}:${attempt + 1}`);
      }
      await lifecycleDelay(35);
      this.logLifecycle('resume-attempt', context, this.contextGeneration, `${source}:${attempt + 1}`);
      if (this.contextState(context) === 'running') return true;
    }
    return false;
  }

  private async recoverAfterForeground(source: string) {
    let context = this.context;
    if (!context) return;
    const resumed = await this.resumeContext(context, source);
    if (!resumed || this.graphInvalidated) {
      context = this.rebuildContext(!resumed ? `${source}:not-running` : `${source}:continuous-sources-invalidated`);
      if (!context || !await this.resumeContext(context, `${source}:fresh-context`)) {
        this.unlocked = false;
        this.resumeFallbackArmed = true;
        this.logLifecycle('foreground-needs-gesture', context, this.contextGeneration, source);
        return;
      }
    }
    this.unlocked = true;
    this.resumeFallbackArmed = false;
    this.graphInvalidated = false;
    this.restoreLogicalAudioState();
    this.logLifecycle('foreground-recovered', this.context, this.contextGeneration, source);
  }

  private restoreLogicalAudioState() {
    this.applyLevels();
    if (this.muted || !this.context || this.contextState(this.context) !== 'running') return;
    if (this.menuMusicDesired) {
      this.startMenuMusic();
      return;
    }
    const output = this.categoryGains.get('engine');
    if (this.enginePresentation && output) this.applyEnginePresentation(this.context, output, this.enginePresentation);
  }

}

export const audioManager = new AudioManager();
