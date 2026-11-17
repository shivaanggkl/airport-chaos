import { fireCrosshairGeometry } from './fire-icon';
import { arrangeControls, fitControl, type LayoutBox } from './control-layout-geometry';
import type { FlightAction } from './flight-input';
import {
  joystickInput,
  joystickKnobPosition,
  joystickTenEdgeInput,
  mobileIdleBrakeRequested,
  pinchZoomFactor,
  throttleLeverState,
  mobileThrottleSelection, mobileThrottleStops, mobileThrottleNames,
  normalizeGraphicsQuality,
  mobileControlStyle,
  resolvedGraphicsQuality,
  touchControlsEnabled,
  type GraphicsQualityMode,
} from '../../shared/mobile-input-rules.mjs';

export {
  joystickInput,
  joystickKnobPosition,
  joystickTenEdgeInput,
  mobileIdleBrakeRequested,
  pinchZoomFactor,
  throttleLeverState,
  normalizeGraphicsQuality,
  mobileControlStyle,
  resolvedGraphicsQuality,
  touchControlsEnabled,
  type GraphicsQualityMode,
};

const QUALITY_KEY = 'airport-chaos-graphics-quality-v1';
const LAYOUT_KEY = 'airport-chaos-mobile-layout-v1';
const PITCH_KEY = 'airport-chaos-flight-pitch-inverted-v1';
const LEGACY_PITCH_KEY = 'airport-chaos-mobile-pitch-inverted-v1';
export function preferredPitchInverted(): boolean {
  try { return (localStorage.getItem(PITCH_KEY) ?? localStorage.getItem(LEGACY_PITCH_KEY)) === 'true'; }
  catch { return false; }
}
export function persistPitchInverted(inverted:boolean):void {
  try { localStorage.setItem(PITCH_KEY,String(inverted)); } catch { /* optional storage */ }
}

export type MobileControlId = 'stick' | 'throttle' | 'fire' | 'radar';
export type MobileControlPlacement = { x: number; y: number; scale: number };
export type MobileControlLayout = Record<MobileControlId, MobileControlPlacement>;
export type MobileControlPlacementLimits = Record<keyof MobileControlPlacement, { min: number; max: number; step: number }>;

export const defaultLayout: MobileControlLayout = {
  radar: { x: 90, y: 20, scale: 1 },
  stick: { x: 14, y: 72, scale: 1 },
  throttle: { x: 75, y: 40, scale: 0.95 },
  fire: { x: 75, y: 78, scale: 1 },
};

const legacyDefaultLayout: MobileControlLayout = {
  radar: { x: 90, y: 20, scale: 1 },
  stick: { x: 14, y: 72, scale: 1 },
  throttle: { x: 87, y: 45, scale: 0.95 },
  fire: { x: 87, y: 80, scale: 1 },
};

const previousDefaultLayout: MobileControlLayout = {
  radar: { x: 90, y: 20, scale: 1 },
  stick: { x: 14, y: 72, scale: 1 },
  throttle: { x: 75, y: 40, scale: 0.95 },
  fire: { x: 72, y: 82, scale: 1 },
};

export const mobileControlPlacementLimits: Record<MobileControlId, MobileControlPlacementLimits> = {
  radar: { x: { min: 0, max: 100, step: 1 }, y: { min: 0, max: 100, step: 1 }, scale: { min: .75, max: 1.25, step: .05 } },
  stick: { x: { min: 0, max: 100, step: 1 }, y: { min: 0, max: 100, step: 1 }, scale: { min: 0.75, max: 1.25, step: 0.05 } },
  throttle: { x: { min: 0, max: 100, step: 1 }, y: { min: 0, max: 100, step: 1 }, scale: { min: 0.75, max: 1.25, step: 0.05 } },
  fire: { x: { min: 0, max: 100, step: 1 }, y: { min: 0, max: 100, step: 1 }, scale: { min: 0.8, max: 1.3, step: 0.05 } },
};

const controlActions: Record<'throttle' | 'aim', FlightAction[]> = {
  throttle: ['boost'],
  aim: ['aimLeft', 'aimRight', 'aimUp', 'aimDown'],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cloneLayout = (layout: MobileControlLayout): MobileControlLayout => structuredClone(layout);

export function safePlacement(control: MobileControlId, value: unknown, fallback: MobileControlPlacement): MobileControlPlacement {
  const stored = value && typeof value === 'object' ? value as Partial<MobileControlPlacement> : {};
  const limits = mobileControlPlacementLimits[control];
  return {
    x: clamp(Number.isFinite(stored.x) ? stored.x! : fallback.x, limits.x.min, limits.x.max),
    y: clamp(Number.isFinite(stored.y) ? stored.y! : fallback.y, limits.y.min, limits.y.max),
    scale: clamp(Number.isFinite(stored.scale) ? stored.scale! : fallback.scale, limits.scale.min, limits.scale.max),
  };
}

export function preferredMobileControlLayout(): MobileControlLayout {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null') as Partial<MobileControlLayout> | null;
    const migrated = (control: MobileControlId): Partial<MobileControlPlacement> | undefined => {
      const placement = stored?.[control];
      const legacy = legacyDefaultLayout[control];
      const previous = previousDefaultLayout[control];
      return placement && [legacy, previous].some((oldDefault) =>
        placement.x === oldDefault.x && placement.y === oldDefault.y && placement.scale === oldDefault.scale)
        ? defaultLayout[control]
        : placement;
    };
    return {
      radar: safePlacement('radar', stored?.radar, defaultLayout.radar),
      stick: safePlacement('stick', migrated('stick'), defaultLayout.stick),
      throttle: safePlacement('throttle', migrated('throttle'), defaultLayout.throttle),
      fire: safePlacement('fire', migrated('fire'), defaultLayout.fire),
    };
  } catch {
    return cloneLayout(defaultLayout);
  }
}

export function persistMobileControlPlacement(control: MobileControlId, current: MobileControlLayout, next: Partial<MobileControlPlacement>): MobileControlLayout {
  const layout = cloneLayout(current);
  layout[control] = safePlacement(control, { ...layout[control], ...next }, defaultLayout[control]);
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); localStorage.setItem('airport-chaos-custom-controls-v1', 'true'); } catch { /* persistence is optional */ }
  return layout;
}

export function resetPreferredMobileControlLayout(): MobileControlLayout {
  try { localStorage.removeItem('airport-chaos-custom-controls-v1'); } catch { /* optional */ }
  const layout = cloneLayout(defaultLayout);
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* persistence is optional */ }
  return layout;
}

export function preferredGraphicsQuality(): GraphicsQualityMode {
  try { return normalizeGraphicsQuality(localStorage.getItem(QUALITY_KEY)); } catch { return 'auto'; }
}

export class MobileInputControls {
  private pitchInverted = preferredPitchInverted();
  private layout = preferredMobileControlLayout();
  private active = new Set<FlightAction>();
  private joystickPointer: number | undefined;
  private steeringInput = { x: 0, y: 0 };
  private demoSteering: { x: number; y: number } | undefined;
  private demoActive = false;
  private throttlePointer: number | undefined;
  private throttleTarget: number | undefined;
  private boostPointer: number | undefined;
  private readonly boostButton: HTMLButtonElement | null;
  private aimPointer: number | undefined;
  private aimStart = { x: 0, y: 0 };
  private placementFrame = 0;

  constructor(
    private root: HTMLElement,
    private aimTarget: HTMLElement,
    private setAction: (action: FlightAction, active: boolean) => void,
    private onThrottleInput?: (throttle: number) => void,
  ) {
    this.boostButton = root.querySelector<HTMLButtonElement>('[data-touch-boost]');
    if (this.boostButton) this.bindBoost(this.boostButton);
    const fireIcon = root.querySelector<SVGElement>('[data-touch-control="fire"] svg');
    if (fireIcon) fireIcon.innerHTML = fireCrosshairGeometry;
    root.querySelectorAll<HTMLElement>('[data-hold]').forEach((button) => {
      this.bindHold(button, button.dataset.hold as FlightAction);
    });
    this.bindStick(root.querySelector<HTMLElement>('[data-touch-stick]')!);
    this.bindThrottle(root.querySelector<HTMLElement>('[data-touch-throttle]')!);
    this.bindAimTarget();
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('pagehide', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
      else this.refresh();
    });
    window.addEventListener('resize', () => {
      this.reset();
      this.refresh();
    });
    window.addEventListener('orientationchange', () => requestAnimationFrame(() => {
      this.reset();
      this.refresh();
    }));
    window.addEventListener('pageshow', () => {
      this.reset();
      this.refresh();
    });
    for (const selector of ['#flight-notifications', '#contextual-hint']) {
      const obstacle = document.querySelector<HTMLElement>(selector);
      if (!obstacle) continue;
      new ResizeObserver(() => this.scheduleNoticeClearance()).observe(obstacle);
      new MutationObserver(() => this.scheduleNoticeClearance()).observe(obstacle, { attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    this.applyLayout();
    this.refresh();
  }

  getPitchInverted(): boolean {
    return this.pitchInverted;
  }
  setDemoActive(active: boolean): void {
    this.demoActive = active;
    if (!active) this.clearDemoSteering();
    this.refresh();
  }
  setPitchInverted(inverted: boolean) {
    this.pitchInverted=inverted;
    persistPitchInverted(inverted);
    this.reset();
  }
  isTouchLayout() { return this.deviceEnabled(); }
  supportsTouchControls() { return matchMedia('(pointer: coarse)').matches || innerWidth <= 900; }
  getThrottleTarget() { return this.root.hidden && !this.demoActive ? undefined : this.throttleTarget; }
  // Raw stick input. The shared keyboard/touch pitch command applies inversion once.
  getSteeringInput() { return this.demoSteering ?? (this.root.hidden ? { x: 0, y: 0 } : { ...this.steeringInput }); }

  setDemoSteering(x: number, y: number): void {
    this.demoSteering = { x, y };
    const stick = this.root.querySelector<HTMLElement>('[data-touch-stick]');
    const knob = joystickKnobPosition(x, y);
    stick?.style.setProperty('--touch-x', `${knob.x}px`);
    stick?.style.setProperty('--touch-y', `${knob.y}px`);
  }

  clearDemoSteering(): void {
    this.demoSteering = undefined;
    const stick = this.root.querySelector<HTMLElement>('[data-touch-stick]');
    stick?.style.setProperty('--touch-x', '0px');
    stick?.style.setProperty('--touch-y', '0px');
  }

  setThrottleState(throttle: number) {
    const value = mobileThrottleSelection(throttle);
    // Desktop keeps its existing keyboard throttle until the lever is dragged.
    this.throttleTarget = this.deviceEnabled() || this.demoActive ? value : undefined;
    this.renderThrottle(value);
  }

  syncFlightState(throttle: number, boostMeter: number, boostActive: boolean, keyboardThrottleActive = false) {
    if (keyboardThrottleActive) this.throttleTarget = undefined;
    const button = this.boostButton;
    if (button) {
      const charge = Math.round(clamp(boostMeter, 0, 100));
      const text = boostActive ? 'BOOSTING' : charge >= 100 ? 'BOOST' : `BOOST ${charge}%`;
      if (button.textContent !== text) {
        button.textContent = text;
        button.setAttribute('aria-label', `Hold for Boost, ${charge}% available`);
      }
      const available = String(boostMeter > .05);
      if (button.dataset.available !== available) button.dataset.available = available;
      button.classList.toggle('is-boosting', boostActive);
      if (boostMeter <= .05) {
        this.apply([], 'throttle');
        button.classList.remove('is-active');
      }
    }
    if (this.throttleTarget === undefined && this.throttlePointer === undefined) this.renderThrottle(throttle);
  }

  getLayout() { return cloneLayout(this.layout); }

  setPlacement(control: MobileControlId, next: Partial<MobileControlPlacement>) {
    try { localStorage.setItem('airport-chaos-custom-controls-v1', 'true'); } catch { /* optional */ }
    this.layout[control] = safePlacement(control, { ...this.layout[control], ...next }, defaultLayout[control]);
    this.persistLayout();
    this.applyLayout();
  }

  resetLayout() {
    this.layout = resetPreferredMobileControlLayout();
    this.persistLayout();
    this.applyLayout();
    return this.getLayout();
  }

  syncPreferences() {
    this.pitchInverted = preferredPitchInverted();
    this.layout = preferredMobileControlLayout();
    this.applyLayout();
    this.refresh();
  }

  reset() {
    const stick = this.root.querySelector<HTMLElement>('[data-touch-stick]');
    const throttle = this.root.querySelector<HTMLElement>('[data-touch-throttle]');
    this.resetJoystick(stick);
    this.releaseCapture(throttle, this.throttlePointer);
    this.releaseCapture(this.boostButton, this.boostPointer);
    this.releaseCapture(this.aimTarget, this.aimPointer);
    for (const action of this.active) this.setAction(action, false);
    this.active.clear();
    this.throttlePointer = undefined;
    this.boostPointer = undefined;
    this.aimPointer = undefined;
    this.root.querySelectorAll<HTMLElement>('.is-active').forEach((element) => element.classList.remove('is-active'));
    this.boostButton?.classList.remove('is-boosting');
    throttle?.classList.remove('is-dragging');
  }

  private releaseCapture(element: HTMLElement | null, pointerId: number | undefined) {
    if (pointerId === undefined || !element) return;
    try {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    } catch {
      // A lifecycle event may invalidate the native pointer before JS observes it.
    }
  }

  private resetJoystick(stick = this.root.querySelector<HTMLElement>('[data-touch-stick]'), pointerId?: number): boolean {
    if (pointerId !== undefined && this.joystickPointer !== pointerId) return false;
    const owner = this.joystickPointer;
    this.joystickPointer = undefined;
    this.steeringInput = { x: 0, y: 0 };
    stick?.style.removeProperty('--touch-x');
    stick?.style.removeProperty('--touch-y');
    stick?.classList.remove('is-active');
    this.releaseCapture(stick, owner);
    return true;
  }

  private deviceEnabled() {
    return touchControlsEnabled('auto', matchMedia('(pointer: coarse)').matches, innerWidth <= 900);
  }

  private refresh() {
    const enabled = this.deviceEnabled() || this.demoActive;
    const landscape = innerWidth > innerHeight;
    this.root.hidden = enabled && !landscape;
    this.root.classList.toggle('desktop-throttle-only', !enabled);
    document.documentElement.classList.toggle('touch-controls-enabled', enabled);
    document.documentElement.classList.toggle('touch-controls-active', enabled && landscape);
    this.aimTarget.classList.toggle('touch-aim-enabled', enabled && landscape);
    if (this.root.hidden) this.reset();
    this.applyLayout();
    this.scheduleNoticeClearance();
  }

  private persistLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout)); } catch { /* Persistence is optional. */ }
  }

  private applyLayout() {
    let custom = false;
    try { custom = localStorage.getItem('airport-chaos-custom-controls-v1') === 'true'; } catch { /* optional */ }
    document.documentElement.classList.toggle('custom-control-layout', custom);
    const ids=Object.keys(this.layout) as MobileControlId[];
    const elements=Object.fromEntries(ids.map(control=>[control,control==='radar'?document.querySelector<HTMLElement>('#radar-panel'):this.root.querySelector<HTMLElement>(`[data-touch-control="${control}"]`)])) as Record<MobileControlId,HTMLElement|null>;
    const boxes=Object.fromEntries(ids.map(control=>{const element=elements[control];return [control,{width:element?.offsetWidth||parseFloat(element?getComputedStyle(element).width:'')||(control==='throttle'?76:116),height:element?.offsetHeight||parseFloat(element?getComputedStyle(element).height:'')||(control==='throttle'?150:116)}];})) as Record<MobileControlId,LayoutBox>;
    const rootStyle=getComputedStyle(this.root);
    const safe=(side:string)=>parseFloat(rootStyle.getPropertyValue(`padding-${side}`))||0;
    const area={width:innerWidth,height:innerHeight,left:safe('left')+8,right:safe('right')+8,top:safe('top')+60,bottom:safe('bottom')+8};
    const arranged=custom?arrangeControls(ids,this.layout,boxes,area):null;
    for (const control of ids) {
      const element=elements[control];
      if(!element)continue;
      const placement = this.layout[control];
      const defaults = defaultLayout[control];
      const fitted=custom?(arranged?.[control]??fitControl(placement,boxes[control],area)):placement;
      const style = mobileControlStyle(fitted.x, fitted.y, fitted.scale);
      element.classList.toggle('uses-default-placement', !custom && placement.x === defaults.x && placement.y === defaults.y && placement.scale === defaults.scale);
      element.style.setProperty('--touch-left', style.left);
      element.style.setProperty('--touch-top', style.top);
      element.style.setProperty('--touch-scale', style.scale);
    }
    this.scheduleNoticeClearance();
  }

  private scheduleNoticeClearance() {
    if (this.placementFrame) return;
    this.placementFrame = requestAnimationFrame(() => {
      this.placementFrame = 0;
      this.clearNoticesFromStick();
    });
  }

  private clearNoticesFromStick() {
    const stick = this.root.querySelector<HTMLElement>('[data-touch-stick]');
    if (!stick) return;
    const notices = ['#flight-notifications', '#contextual-hint']
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => element !== null);
    for (const notice of notices) {
      notice.style.removeProperty('--touch-notice-x');
      notice.style.removeProperty('--touch-notice-y');
    }
    if (this.root.hidden) return;
    const control = stick.getBoundingClientRect();
    const bounds = this.root.getBoundingClientRect();
    const gap = 12;
    for (const notice of notices) {
      const rect = notice.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.right + gap <= control.left || rect.left >= control.right + gap ||
        rect.bottom + gap <= control.top || rect.top >= control.bottom + gap) continue;
      const right = control.right + gap - rect.left;
      const left = control.left - gap - rect.right;
      if (rect.right + right <= bounds.right - gap) notice.style.setProperty('--touch-notice-x', `${Math.ceil(right)}px`);
      else if (rect.left + left >= bounds.left + gap) notice.style.setProperty('--touch-notice-x', `${Math.floor(left)}px`);
      else {
        const above = control.top - gap - rect.bottom;
        const below = control.bottom + gap - rect.top;
        if (rect.bottom + below <= bounds.bottom - gap) notice.style.setProperty('--touch-notice-y', `${Math.ceil(below)}px`);
        else if (rect.top + above >= bounds.top + gap) notice.style.setProperty('--touch-notice-y', `${Math.floor(above)}px`);
      }
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
      if (this.joystickPointer !== event.pointerId) return;
      event.preventDefault();
      const rect = stick.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.48);
      const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.48);
      const tenEdgeInput = joystickTenEdgeInput(x, y);
      this.steeringInput = joystickInput(tenEdgeInput.x, tenEdgeInput.y);
      const knob = joystickKnobPosition(x, y);
      stick.style.setProperty('--touch-x', `${knob.x}px`);
      stick.style.setProperty('--touch-y', `${knob.y}px`);
    };
    stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.joystickPointer !== undefined) return;
      this.joystickPointer = event.pointerId;
      try { stick.setPointerCapture(event.pointerId); } catch { /* Window-level release still owns cleanup. */ }
      stick.classList.add('is-active');
      move(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (this.joystickPointer === event.pointerId) move(event);
    });
    const stop = (event: PointerEvent) => {
      if (this.joystickPointer !== event.pointerId) return;
      if (event.cancelable) event.preventDefault();
      this.resetJoystick(stick, event.pointerId);
    };
    stick.addEventListener('pointerup', stop);
    stick.addEventListener('pointercancel', stop);
    stick.addEventListener('lostpointercapture', (event) => stop(event as PointerEvent));
    window.addEventListener('pointerup', stop, { capture: true });
    window.addEventListener('pointercancel', stop, { capture: true });
  }

  private renderThrottle(throttle: number) {
    const lever = this.root.querySelector<HTMLElement>('[data-touch-throttle]');
    if (!lever) return;
    const index = mobileThrottleStops.indexOf(mobileThrottleSelection(throttle));
    lever.style.setProperty('--throttle-y', `${(1 - index / 3) * 100}%`);
    lever.setAttribute('aria-valuenow', String(index));
    lever.setAttribute('aria-valuetext', mobileThrottleNames[index]!);
    lever.dataset.throttle = String(mobileThrottleStops[index]);
    lever.dataset.mode = String(index);
  }

  private bindThrottle(lever: HTMLElement) {
    let grabOffset = 0;
    const select = (throttle: number) => {
      this.throttleTarget = throttle;
      this.renderThrottle(throttle);
      this.onThrottleInput?.(throttle);
    };
    const move = (event: PointerEvent) => {
      const rect = lever.getBoundingClientRect();
      select(throttleLeverState(event.clientY - grabOffset, rect.top, rect.height, this.throttleTarget).throttle);
    };
    lever.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.throttlePointer !== undefined) return;
      this.throttlePointer = event.pointerId;
      try { lever.setPointerCapture(event.pointerId); } catch { /* Window release still clears the drag. */ }
      lever.classList.add('is-dragging');
      const current = mobileThrottleSelection(this.throttleTarget ?? Number(lever.dataset.throttle ?? 0));
      const index = mobileThrottleStops.indexOf(current);
      const rect = lever.getBoundingClientRect();
      const handleY = rect.top + (1 - index / 3) * rect.height;
      const target = event.target as HTMLElement;
      // Grabbing the handle never changes speed; tapping a label selects it deliberately.
      const label = target.closest<HTMLElement>('[data-throttle-stop]');
      const grabbing = !label && Math.abs(event.clientY - handleY) <= 22;
      grabOffset = grabbing ? event.clientY - handleY : 0;
      if (label) select(mobileThrottleStops[Number(label.dataset.throttleStop)]!);
      else if (!grabbing) move(event);
    });
    lever.addEventListener('pointermove', (event) => {
      if (this.throttlePointer === event.pointerId) move(event);
    });
    const stop = (event: PointerEvent) => {
      if (this.throttlePointer !== event.pointerId) return;
      const pointer = this.throttlePointer;
      this.throttlePointer = undefined;
      lever.classList.remove('is-dragging');
      this.releaseCapture(lever, pointer);
    };
    lever.addEventListener('pointerup', stop);
    lever.addEventListener('pointercancel', stop);
    lever.addEventListener('lostpointercapture', stop);
    window.addEventListener('pointerup', stop, { capture: true });
    window.addEventListener('pointercancel', stop, { capture: true });
    lever.addEventListener('keydown', (event) => {
      const index = mobileThrottleStops.indexOf(mobileThrottleSelection(this.throttleTarget ?? Number(lever.dataset.throttle ?? 0)));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3
        : event.key === 'ArrowUp' || event.key === 'ArrowRight' ? Math.min(3, index + 1)
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? Math.max(0, index - 1) : undefined;
      if (next === undefined) return;
      event.preventDefault();
      select(mobileThrottleStops[next]!);
    });
  }

  private bindBoost(button: HTMLButtonElement) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.boostPointer !== undefined || button.dataset.available === 'false') return;
      this.boostPointer = event.pointerId;
      try { button.setPointerCapture(event.pointerId); } catch { /* Window release still clears Boost. */ }
      button.classList.add('is-active');
      this.apply(['boost'], 'throttle');
    });
    const stop = (event: PointerEvent) => {
      if (this.boostPointer !== event.pointerId) return;
      const pointer = this.boostPointer;
      this.boostPointer = undefined;
      button.classList.remove('is-active');
      this.apply([], 'throttle');
      this.releaseCapture(button, pointer);
    };
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    window.addEventListener('pointerup', stop, { capture: true });
    window.addEventListener('pointercancel', stop, { capture: true });
    button.addEventListener('keydown', (event) => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && button.dataset.available !== 'false') {
        event.preventDefault(); this.apply(['boost'], 'throttle');
      }
    });
    button.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); this.apply([], 'throttle'); }
    });
    button.addEventListener('blur', () => this.apply([], 'throttle'));
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
    this.aimTarget.addEventListener('lostpointercapture', (event) => stop(event as PointerEvent));
  }
}
