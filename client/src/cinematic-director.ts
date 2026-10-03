import {
  CINEMATIC_EVENT_DEBOUNCE_MS,
  GAMEPLAY_CINEMATIC_PRIORITY,
  MISSION_COMPLETE_DURATION_MS,
  PERFECT_LANDING_DURATION_MS,
  REGION_ENTRY_DURATION_MS,
  TAKEOFF_CINEMATIC_DURATION_MS,
  cinematicEase,
  cinematicProgress,
  cinematicPulse,
  type GameplayCinematicKind,
} from '../../shared/gameplay-cinematic-rules.mjs';

export type CameraCinematicFrame = Readonly<{
  kind: 'TAKEOFF' | 'PERFECT_LANDING';
  progress: number;
  eased: number;
  pulse: number;
}>;

type BannerRequest = {
  kind: 'REGION_ENTRY' | 'MISSION_COMPLETE' | 'PERFECT_LANDING';
  key: string;
  title: string;
  subtitle: string;
  durationMs: number;
  requestedAt: number;
};

type CameraRequest = {
  kind: 'TAKEOFF' | 'PERFECT_LANDING';
  key: string;
  requestedAt: number;
  durationMs: number;
};

type ActiveCamera = CameraRequest & { startedAt: number };
type ActiveBanner = BannerRequest & { startedAt: number };

export type CinematicDirectorOptions = {
  root: HTMLElement;
  canStartCamera: (kind: CameraRequest['kind']) => boolean;
  onCameraStart?: (kind: CameraRequest['kind']) => void;
  onCameraEnd?: (kind: CameraRequest['kind'], skipped: boolean) => void;
  onBannerShown?: (kind: BannerRequest['kind']) => void;
};

export class CinematicDirector {
  private readonly element: HTMLElement;
  private readonly titleElement: HTMLElement;
  private readonly subtitleElement: HTMLElement;
  private readonly seenKeys = new Map<string, number>();
  private readonly seenRegions = new Set<string>();
  private readonly bannerQueue: BannerRequest[] = [];
  private readonly cameraQueue: CameraRequest[] = [];
  private activeBanner?: ActiveBanner;
  private activeCamera?: ActiveCamera;
  private disposed = false;

  constructor(private readonly options: CinematicDirectorOptions) {
    this.element = document.createElement('aside');
    this.element.className = 'gameplay-cinematic-banner';
    this.element.hidden = true;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('aria-atomic', 'true');
    this.titleElement = document.createElement('strong');
    this.subtitleElement = document.createElement('span');
    this.element.append(this.titleElement, this.subtitleElement);
    options.root.append(this.element);
  }

  requestTakeoff(key: string, now = performance.now()): boolean {
    if (!this.acceptUnique(`takeoff:${key}`, now)) return false;
    this.queueCamera({ kind: 'TAKEOFF', key, requestedAt: now, durationMs: TAKEOFF_CINEMATIC_DURATION_MS });
    return true;
  }

  requestRegion(key: string, title: string, subtitle: string, now = performance.now()): boolean {
    if (this.seenRegions.has(key)) return false;
    this.seenRegions.add(key);
    this.queueBanner({ kind: 'REGION_ENTRY', key, title, subtitle, durationMs: REGION_ENTRY_DURATION_MS, requestedAt: now });
    return true;
  }

  requestMissionComplete(key: string, title: string, rewardText: string, now = performance.now()): boolean {
    if (!this.acceptUnique(`mission:${key}`, now)) return false;
    this.queueBanner({ kind: 'MISSION_COMPLETE', key, title, subtitle: rewardText, durationMs: MISSION_COMPLETE_DURATION_MS, requestedAt: now });
    return true;
  }

  requestPerfectLanding(key: string, rewardText: string, now = performance.now()): boolean {
    if (!this.acceptUnique(`landing:${key}`, now)) return false;
    this.queueBanner({
      kind: 'PERFECT_LANDING', key, title: 'PERFECT LANDING', subtitle: rewardText,
      durationMs: PERFECT_LANDING_DURATION_MS + 650, requestedAt: now,
    });
    this.queueCamera({ kind: 'PERFECT_LANDING', key, requestedAt: now, durationMs: PERFECT_LANDING_DURATION_MS });
    return true;
  }

  update(now = performance.now()): void {
    if (this.disposed) return;
    this.updateCamera(now);
    this.updateBanner(now);
  }

  cameraFrame(now = performance.now()): CameraCinematicFrame | undefined {
    const active = this.activeCamera;
    if (!active) return undefined;
    const progress = cinematicProgress(now - active.startedAt, active.durationMs);
    return { kind: active.kind, progress, eased: cinematicEase(progress), pulse: cinematicPulse(progress) };
  }

  engineLift(now = performance.now()): number {
    const frame = this.cameraFrame(now);
    return frame?.kind === 'TAKEOFF' ? frame.pulse * 0.16 : 0;
  }

  isSkippable(): boolean {
    return this.activeCamera?.kind === 'PERFECT_LANDING';
  }

  skip(): boolean {
    if (!this.isSkippable()) return false;
    this.finishCamera(true);
    return true;
  }

  cancelCamera(): void {
    this.cameraQueue.length = 0;
    if (this.activeCamera) this.finishCamera(true);
  }

  clearPresentation(): void {
    this.cancelCamera();
    this.bannerQueue.length = 0;
    this.hideBanner();
  }

  resetFlight(): void {
    this.clearPresentation();
    this.seenRegions.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.resetFlight();
    this.disposed = true;
    this.element.remove();
  }

  private acceptUnique(key: string, now: number): boolean {
    const previous = this.seenKeys.get(key);
    if (previous !== undefined && now - previous < CINEMATIC_EVENT_DEBOUNCE_MS) return false;
    this.seenKeys.set(key, now);
    if (this.seenKeys.size > 96) this.seenKeys.delete(this.seenKeys.keys().next().value!);
    return previous === undefined;
  }

  private queueCamera(request: CameraRequest): void {
    if (this.activeCamera && GAMEPLAY_CINEMATIC_PRIORITY[request.kind] > GAMEPLAY_CINEMATIC_PRIORITY[this.activeCamera.kind]) {
      this.finishCamera(true);
    }
    this.cameraQueue.push(request);
    this.cameraQueue.sort((a, b) => GAMEPLAY_CINEMATIC_PRIORITY[b.kind] - GAMEPLAY_CINEMATIC_PRIORITY[a.kind] || a.requestedAt - b.requestedAt);
  }

  private queueBanner(request: BannerRequest): void {
    if (this.activeBanner && GAMEPLAY_CINEMATIC_PRIORITY[request.kind] > GAMEPLAY_CINEMATIC_PRIORITY[this.activeBanner.kind]) {
      this.bannerQueue.push({ ...this.activeBanner, requestedAt: performance.now() });
      this.hideBanner();
    }
    this.bannerQueue.push(request);
    this.bannerQueue.sort((a, b) => GAMEPLAY_CINEMATIC_PRIORITY[b.kind] - GAMEPLAY_CINEMATIC_PRIORITY[a.kind] || a.requestedAt - b.requestedAt);
  }

  private updateCamera(now: number): void {
    if (this.activeCamera) {
      if (!this.options.canStartCamera(this.activeCamera.kind)) {
        this.finishCamera(true);
      } else if (now - this.activeCamera.startedAt >= this.activeCamera.durationMs) {
        this.finishCamera(false);
      }
    }
    if (this.activeCamera) return;
    while (this.cameraQueue.length > 0) {
      const next = this.cameraQueue[0];
      const maximumQueueAge = next.kind === 'PERFECT_LANDING' ? 6_000 : 2_500;
      if (now - next.requestedAt > maximumQueueAge) {
        this.cameraQueue.shift();
        continue;
      }
      if (!this.options.canStartCamera(next.kind)) return;
      this.cameraQueue.shift();
      this.activeCamera = { ...next, startedAt: now };
      this.options.onCameraStart?.(next.kind);
      return;
    }
  }

  private updateBanner(now: number): void {
    if (this.activeBanner && now - this.activeBanner.startedAt >= this.activeBanner.durationMs) this.hideBanner();
    if (this.activeBanner || this.bannerQueue.length === 0) return;
    const next = this.bannerQueue.shift()!;
    this.activeBanner = { ...next, startedAt: now };
    this.titleElement.textContent = next.title;
    this.subtitleElement.textContent = next.subtitle;
    this.element.dataset.kind = next.kind.toLowerCase();
    this.element.style.setProperty('--gameplay-cinematic-duration', `${next.durationMs}ms`);
    this.element.hidden = false;
    this.element.classList.remove('is-visible');
    void this.element.offsetWidth;
    this.element.classList.add('is-visible');
    this.options.onBannerShown?.(next.kind);
  }

  private hideBanner(): void {
    this.activeBanner = undefined;
    this.element.classList.remove('is-visible');
    this.element.hidden = true;
    delete this.element.dataset.kind;
    this.element.style.removeProperty('--gameplay-cinematic-duration');
  }

  private finishCamera(skipped: boolean): void {
    const active = this.activeCamera;
    if (!active) return;
    this.activeCamera = undefined;
    this.options.onCameraEnd?.(active.kind, skipped);
  }
}
