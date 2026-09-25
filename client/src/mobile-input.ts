import type { FlightAction } from './flight-input';
import {
  joystickInput,
  mobileIdleBrakeRequested,
  pinchZoomFactor,
  throttleLeverState,
  normalizeGraphicsQuality,
  normalizeTouchMode,
  resolvedGraphicsQuality,
  type GraphicsQualityMode,
  type TouchControlsMode,
} from '../../shared/mobile-input-rules.mjs';

export {
  joystickInput,
  mobileIdleBrakeRequested,
  pinchZoomFactor,
  throttleLeverState,
  normalizeGraphicsQuality,
  normalizeTouchMode,
  resolvedGraphicsQuality,
  type GraphicsQualityMode,
  type TouchControlsMode,
};

const TOUCH_KEY = 'airport-chaos-touch-controls-v1';
const QUALITY_KEY = 'airport-chaos-graphics-quality-v1';
const LAYOUT_KEY = 'airport-chaos-mobile-layout-v1';

export type MobileControlId = 'stick' | 'throttle' | 'fire';
export type MobileControlPlacement = { x: number; y: number; scale: number };
export type MobileControlLayout = Record<MobileControlId, MobileControlPlacement>;
export type MobileControlPlacementLimits = Record<keyof MobileControlPlacement, { min: number; max: number; step: number }>;

const defaultLayout: MobileControlLayout = {
  stick: { x: 14, y: 72, scale: 1 },
  throttle: { x: 75, y: 40, scale: 0.95 },
  fire: { x: 72, y: 82, scale: 1 },
};

const legacyDefaultLayout: MobileControlLayout = {
  stick: { x: 14, y: 72, scale: 1 },
  throttle: { x: 87, y: 45, scale: 0.95 },
  fire: { x: 87, y: 80, scale: 1 },
};

export const mobileControlPlacementLimits: Record<MobileControlId, MobileControlPlacementLimits> = {
  stick: { x: { min: 10, max: 40, step: 1 }, y: { min: 45, max: 82, step: 1 }, scale: { min: 0.75, max: 1.25, step: 0.05 } },
  throttle: { x: { min: 62, max: 90, step: 1 }, y: { min: 30, max: 66, step: 1 }, scale: { min: 0.75, max: 1.25, step: 0.05 } },
  fire: { x: { min: 60, max: 90, step: 1 }, y: { min: 62, max: 88, step: 1 }, scale: { min: 0.8, max: 1.3, step: 0.05 } },
};

const controlActions: Record<'throttle' | 'aim', FlightAction[]> = {
  throttle: ['boost'],
  aim: ['aimLeft', 'aimRight', 'aimUp', 'aimDown'],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cloneLayout = (layout: MobileControlLayout): MobileControlLayout => structuredClone(layout);

function safePlacement(control: MobileControlId, value: unknown, fallback: MobileControlPlacement): MobileControlPlacement {
  const stored = value && typeof value === 'object' ? value as Partial<MobileControlPlacement> : {};
  const limits = mobileControlPlacementLimits[control];
  return {
    x: clamp(Number.isFinite(stored.x) ? stored.x! : fallback.x, limits.x.min, limits.x.max),
    y: clamp(Number.isFinite(stored.y) ? stored.y! : fallback.y, limits.y.min, limits.y.max),
    scale: clamp(Number.isFinite(stored.scale) ? stored.scale! : fallback.scale, limits.scale.min, limits.scale.max),
  };
}

function preferredLayout(): MobileControlLayout {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null') as Partial<MobileControlLayout> | null;
    const migrated = (control: MobileControlId): Partial<MobileControlPlacement> | undefined => {
      const placement = stored?.[control];
      const legacy = legacyDefaultLayout[control];
      return placement?.x === legacy.x && placement.y === legacy.y && placement.scale === legacy.scale
        ? defaultLayout[control]
        : placement;
    };
    return {
      stick: safePlacement('stick', migrated('stick'), defaultLayout.stick),
      throttle: safePlacement('throttle', migrated('throttle'), defaultLayout.throttle),
      fire: safePlacement('fire', migrated('fire'), defaultLayout.fire),
    };
  } catch {
    return cloneLayout(defaultLayout);
  }
}

export function preferredTouchMode(): TouchControlsMode {
  try { return normalizeTouchMode(localStorage.getItem(TOUCH_KEY)); } catch { return 'auto'; }
}

export function preferredGraphicsQuality(): GraphicsQualityMode {
  try { return normalizeGraphicsQuality(localStorage.getItem(QUALITY_KEY)); } catch { return 'auto'; }
}

export class MobileInputControls {
  private mode = preferredTouchMode();
  private layout = preferredLayout();
  private active = new Set<FlightAction>();
  private joystickPointer: number | undefined;
  private steeringInput = { x: 0, y: 0 };
  private throttlePointer: number | undefined;
  private throttleTarget: number | undefined;
  private throttleBoostRequested = false;
  private lastBoostReady: boolean | undefined;
  private boostReadyPulseTimer: number | undefined;
  private aimPointer: number | undefined;
  private aimStart = { x: 0, y: 0 };

  constructor(
    private root: HTMLElement,
    private aimTarget: HTMLElement,
    private setAction: (action: FlightAction, active: boolean) => void,
    private onThrottleInput?: (throttle: number) => void,
  ) {
    root.querySelectorAll<HTMLElement>('[data-hold]').forEach((button) => {
      this.bindHold(button, button.dataset.hold as FlightAction);
    });
    this.bindStick(root.querySelector<HTMLElement>('[data-touch-stick]')!);
    this.bindThrottle(root.querySelector<HTMLElement>('[data-touch-throttle]')!);
    this.bindAimTarget();
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    window.addEventListener('resize', () => this.refresh());
    window.addEventListener('orientationchange', () => this.refresh());
    this.applyLayout();
    this.refresh();
  }

  getMode() { return this.mode; }
  isTouchLayout() { return this.deviceEnabled(); }
  getThrottleTarget() { return this.root.hidden ? undefined : this.throttleTarget; }
  getSteeringInput() { return this.root.hidden ? { x: 0, y: 0 } : this.steeringInput; }

  setThrottleState(throttle: number) {
    const value = clamp(throttle, 0, 1);
    this.throttleTarget = value;
    this.renderThrottle(value, false);
  }

  syncFlightState(throttle: number, boostMeter: number, boostActive: boolean) {
    const lever = this.root.querySelector<HTMLElement>('[data-touch-throttle]');
    if (!lever) return;
    const ready = boostMeter >= 99.5;
    lever.classList.toggle('boost-ready', ready);
    lever.classList.toggle('boost-recharging', !ready);
    lever.classList.toggle('is-boosting', boostActive);
    lever.dataset.boostMeter = Math.round(boostMeter).toString();
    if (this.lastBoostReady === false && ready) {
      lever.classList.remove('boost-ready-pulse');
      void lever.offsetWidth;
      lever.classList.add('boost-ready-pulse');
      window.clearTimeout(this.boostReadyPulseTimer);
      this.boostReadyPulseTimer = window.setTimeout(() => lever.classList.remove('boost-ready-pulse'), 900);
    }
    this.lastBoostReady = ready;
    if (this.throttleBoostRequested && boostMeter <= 0.05) {
      this.throttleBoostRequested = false;
      this.throttleTarget = 1;
      this.apply([], 'throttle');
      this.renderThrottle(1, false);
    } else if (this.throttleTarget === undefined) {
      this.renderThrottle(clamp(throttle, 0, 1), false);
    }
  }

  setMode(mode: TouchControlsMode) {
    this.mode = normalizeTouchMode(mode);
    try { localStorage.setItem(TOUCH_KEY, this.mode); } catch { /* Persistence is optional. */ }
    this.reset();
    this.refresh();
  }

  getLayout() { return cloneLayout(this.layout); }

  setPlacement(control: MobileControlId, next: Partial<MobileControlPlacement>) {
    this.layout[control] = safePlacement(control, { ...this.layout[control], ...next }, defaultLayout[control]);
    this.persistLayout();
    this.applyLayout();
  }

  resetLayout() {
    this.layout = cloneLayout(defaultLayout);
    this.persistLayout();
    this.applyLayout();
    return this.getLayout();
  }

  reset() {
    for (const action of this.active) this.setAction(action, false);
    this.active.clear();
    this.joystickPointer = undefined;
    this.steeringInput = { x: 0, y: 0 };
    this.throttlePointer = undefined;
    this.throttleTarget = undefined;
    this.throttleBoostRequested = false;
    this.aimPointer = undefined;
    this.root.querySelectorAll<HTMLElement>('.is-active').forEach((element) => element.classList.remove('is-active'));
    const stick = this.root.querySelector<HTMLElement>('[data-touch-stick]');
    stick?.style.removeProperty('--touch-x');
    stick?.style.removeProperty('--touch-y');
    const throttle = this.root.querySelector<HTMLElement>('[data-touch-throttle]');
    window.clearTimeout(this.boostReadyPulseTimer);
    throttle?.classList.remove('is-dragging', 'is-boosting', 'boost-ready-pulse');
  }

  private deviceEnabled() {
    return this.mode === 'on'
      || (this.mode === 'auto' && (matchMedia('(pointer: coarse)').matches || innerWidth <= 900));
  }

  private refresh() {
    const enabled = this.deviceEnabled();
    const landscape = innerWidth > innerHeight;
    this.root.hidden = !(enabled && landscape);
    document.documentElement.classList.toggle('touch-controls-enabled', enabled);
    document.documentElement.classList.toggle('touch-controls-active', enabled && landscape);
    this.aimTarget.classList.toggle('touch-aim-enabled', enabled && landscape);
    if (this.root.hidden) this.reset();
  }

  private persistLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout)); } catch { /* Persistence is optional. */ }
  }

  private applyLayout() {
    for (const control of Object.keys(this.layout) as MobileControlId[]) {
      const element = this.root.querySelector<HTMLElement>(`[data-touch-control="${control}"]`);
      const placement = this.layout[control];
      const defaults = defaultLayout[control];
      element?.classList.toggle('uses-default-placement', placement.x === defaults.x && placement.y === defaults.y && placement.scale === defaults.scale);
      element?.style.setProperty('--touch-left', `${placement.x}%`);
      element?.style.setProperty('--touch-top', `${placement.y}%`);
      element?.style.setProperty('--touch-scale', `${placement.scale}`);
    }
  }

  private apply(next: FlightAction[], group: keyof typeof controlActions) {
    for (const action of controlActions[group]) {
      if (this.active.has(action) && !next.includes(action)) {
        this.active.delete(action);
        this.setAction(action, false);
      }
    }
    for (const action of next) {
      if (!this.active.has(action)) {
        this.active.add(action);
        this.setAction(action, true);
      }
    }
  }

  private bindHold(button: HTMLElement, action: FlightAction) {
    const start = (event: PointerEvent) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add('is-active');
      this.active.add(action);
      this.setAction(action, true);
    };
    const stop = (event: PointerEvent) => {
      event.preventDefault();
      button.classList.remove('is-active');
      this.active.delete(action);
      this.setAction(action, false);
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', () => {
      button.classList.remove('is-active');
      this.active.delete(action);
      this.setAction(action, false);
    });
  }

  private bindStick(stick: HTMLElement) {
    const move = (event: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.42), -1, 1);
      const y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.42), -1, 1);
      this.steeringInput = joystickInput(x, y);
      stick.style.setProperty('--touch-x', `${x * 30}px`);
      stick.style.setProperty('--touch-y', `${y * 30}px`);
    };
    stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      stick.setPointerCapture(event.pointerId);
      this.joystickPointer = event.pointerId;
      move(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (this.joystickPointer === event.pointerId) move(event);
    });
    const stop = (event: PointerEvent) => {
      if (this.joystickPointer !== event.pointerId) return;
      this.steeringInput = { x: 0, y: 0 };
      stick.style.removeProperty('--touch-x');
      stick.style.removeProperty('--touch-y');
      this.joystickPointer = undefined;
      if (stick.hasPointerCapture(event.pointerId)) stick.releasePointerCapture(event.pointerId);
    };
    stick.addEventListener('pointerup', stop);
    stick.addEventListener('pointercancel', stop);
  }

  private renderThrottle(throttle: number, boost: boolean, handlePercent?: number) {
    const lever = this.root.querySelector<HTMLElement>('[data-touch-throttle]');
    if (!lever) return;
    const normalHandle = 100 - clamp(throttle, 0, 1) * 82;
    lever.style.setProperty('--throttle-y', `${handlePercent ?? normalHandle}%`);
    lever.setAttribute('aria-valuenow', Math.round(throttle * 100).toString());
    lever.setAttribute('aria-valuetext', boost ? 'Boost' : `${Math.round(throttle * 100)}% throttle`);
    lever.dataset.throttle = throttle.toFixed(2);
  }

  private bindThrottle(lever: HTMLElement) {
    const move = (event: PointerEvent) => {
      const rect = lever.getBoundingClientRect();
      const state = throttleLeverState(event.clientY, rect.top, rect.height);
      this.throttleTarget = state.throttle;
      this.throttleBoostRequested = state.boost;
      this.renderThrottle(state.throttle, state.boost, state.handlePercent);
      this.apply(state.boost ? ['boost'] : [], 'throttle');
      this.onThrottleInput?.(state.throttle);
    };
    lever.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      lever.setPointerCapture(event.pointerId);
      lever.classList.add('is-dragging');
      this.throttlePointer = event.pointerId;
      move(event);
    });
    lever.addEventListener('pointermove', (event) => {
      if (this.throttlePointer === event.pointerId) move(event);
    });
    const stop = (event: PointerEvent) => {
      if (this.throttlePointer !== event.pointerId) return;
      if (this.throttleBoostRequested) {
        this.throttleTarget = 1;
        this.renderThrottle(1, false);
      }
      this.throttleBoostRequested = false;
      this.apply([], 'throttle');
      lever.classList.remove('is-dragging', 'is-boosting');
      this.throttlePointer = undefined;
      if (lever.hasPointerCapture(event.pointerId)) lever.releasePointerCapture(event.pointerId);
    };
    lever.addEventListener('pointerup', stop);
    lever.addEventListener('pointercancel', stop);
    lever.addEventListener('lostpointercapture', (event) => stop(event as PointerEvent));
  }

  private bindAimTarget() {
    const update = (event: PointerEvent) => {
      const dx = event.clientX - this.aimStart.x;
      const dy = event.clientY - this.aimStart.y;
      const threshold = 7;
      const next: FlightAction[] = [];
      if (dx < -threshold) next.push('aimLeft');
      if (dx > threshold) next.push('aimRight');
      if (dy < -threshold) next.push('aimUp');
      if (dy > threshold) next.push('aimDown');
      this.apply(next, 'aim');
    };
    this.aimTarget.addEventListener('pointerdown', (event) => {
      if (!this.aimTarget.classList.contains('touch-aim-enabled')) return;
      event.preventDefault();
      this.aimPointer = event.pointerId;
      this.aimStart = { x: event.clientX, y: event.clientY };
      this.aimTarget.setPointerCapture(event.pointerId);
    });
    this.aimTarget.addEventListener('pointermove', (event) => {
      if (this.aimPointer === event.pointerId) update(event);
    });
    const stop = (event: PointerEvent) => {
      if (this.aimPointer !== event.pointerId) return;
      this.apply([], 'aim');
      this.aimPointer = undefined;
      if (this.aimTarget.hasPointerCapture(event.pointerId)) this.aimTarget.releasePointerCapture(event.pointerId);
    };
    this.aimTarget.addEventListener('pointerup', stop);
    this.aimTarget.addEventListener('pointercancel', stop);
  }
}
