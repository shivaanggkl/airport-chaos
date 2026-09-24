import type { FlightAction } from './flight-input';
import {
  joystickActions,
  pinchZoomFactor,
  normalizeGraphicsQuality,
  normalizeTouchMode,
  resolvedGraphicsQuality,
  type GraphicsQualityMode,
  type TouchControlsMode,
} from '../../shared/mobile-input-rules.mjs';

export {
  joystickActions,
  pinchZoomFactor,
  normalizeGraphicsQuality,
  normalizeTouchMode,
  resolvedGraphicsQuality,
  type GraphicsQualityMode,
  type TouchControlsMode,
};

const TOUCH_KEY = 'airport-chaos-touch-controls-v1';
const QUALITY_KEY = 'airport-chaos-graphics-quality-v1';
const LAYOUT_KEY = 'airport-chaos-mobile-layout-v1';

export type MobileControlId = 'stick' | 'altitude' | 'fire';
export type MobileControlPlacement = { x: number; y: number; scale: number };
export type MobileControlLayout = Record<MobileControlId, MobileControlPlacement>;

const defaultLayout: MobileControlLayout = {
  stick: { x: 13, y: 76, scale: 1 },
  altitude: { x: 87, y: 50, scale: 1 },
  fire: { x: 87, y: 76, scale: 1.08 },
};

const controlActions: Record<'stick' | 'aim', FlightAction[]> = {
  stick: ['yawLeft', 'yawRight', 'rollLeft', 'rollRight', 'throttleUp', 'throttleDown', 'boost'],
  aim: ['aimLeft', 'aimRight', 'aimUp', 'aimDown'],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cloneLayout = (layout: MobileControlLayout): MobileControlLayout => structuredClone(layout);

function safePlacement(value: unknown, fallback: MobileControlPlacement): MobileControlPlacement {
  const stored = value && typeof value === 'object' ? value as Partial<MobileControlPlacement> : {};
  return {
    x: clamp(Number.isFinite(stored.x) ? stored.x! : fallback.x, 12, 88),
    y: clamp(Number.isFinite(stored.y) ? stored.y! : fallback.y, 35, 76),
    scale: clamp(Number.isFinite(stored.scale) ? stored.scale! : fallback.scale, 0.75, 1.35),
  };
}

function preferredLayout(): MobileControlLayout {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null') as Partial<MobileControlLayout> | null;
    return {
      stick: safePlacement(stored?.stick, defaultLayout.stick),
      altitude: safePlacement(stored?.altitude, defaultLayout.altitude),
      fire: safePlacement(stored?.fire, defaultLayout.fire),
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
  private aimPointer: number | undefined;
  private aimStart = { x: 0, y: 0 };

  constructor(
    private root: HTMLElement,
    private aimTarget: HTMLElement,
    private setAction: (action: FlightAction, active: boolean) => void,
  ) {
    root.querySelectorAll<HTMLElement>('[data-hold]').forEach((button) => {
      this.bindHold(button, button.dataset.hold as FlightAction);
    });
    this.bindStick(root.querySelector<HTMLElement>('[data-touch-stick]')!);
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

  setMode(mode: TouchControlsMode) {
    this.mode = normalizeTouchMode(mode);
    try { localStorage.setItem(TOUCH_KEY, this.mode); } catch { /* Persistence is optional. */ }
    this.reset();
    this.refresh();
  }

  getLayout() { return cloneLayout(this.layout); }

  setPlacement(control: MobileControlId, next: Partial<MobileControlPlacement>) {
    this.layout[control] = safePlacement({ ...this.layout[control], ...next }, defaultLayout[control]);
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
    this.aimPointer = undefined;
    this.root.querySelectorAll<HTMLElement>('.is-active').forEach((element) => element.classList.remove('is-active'));
    const stick = this.root.querySelector<HTMLElement>('[data-touch-stick]');
    stick?.style.removeProperty('--touch-x');
    stick?.style.removeProperty('--touch-y');
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
      this.apply(joystickActions(x, y), 'stick');
      stick.style.setProperty('--touch-x', `${x * 30}px`);
      stick.style.setProperty('--touch-y', `${y * 30}px`);
      stick.classList.toggle('is-boosting', y < -0.82);
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
      this.apply([], 'stick');
      stick.classList.remove('is-boosting');
      stick.style.removeProperty('--touch-x');
      stick.style.removeProperty('--touch-y');
      this.joystickPointer = undefined;
      if (stick.hasPointerCapture(event.pointerId)) stick.releasePointerCapture(event.pointerId);
    };
    stick.addEventListener('pointerup', stop);
    stick.addEventListener('pointercancel', stop);
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
