import * as THREE from 'three';

export type MissionObjective = {
  id: string;
  label: string;
  position: THREE.Vector3;
  radius: number;
};

type ConfirmedGateAttempt = { attemptId: string; gateIndex: number; status: string };
type GateDefinition = { x: number; z: number; altitude: number; radius: number };

/** An objective exists only for a gate selected by the confirmed attempt. */
export function confirmedGateObjective(attempt: ConfirmedGateAttempt, gates: readonly GateDefinition[],
  heightAt: (x: number, z: number) => number): MissionObjective | null {
  if (attempt.status !== 'APPROACH' && attempt.status !== 'RACING') return null;
  if (!Number.isInteger(attempt.gateIndex)) return null;
  const gate = gates[attempt.gateIndex];
  if (!gate) return null;
  return {
    id: `${attempt.attemptId}:gate-${attempt.gateIndex + 1}`,
    label: `GATE ${attempt.gateIndex + 1}`,
    position: new THREE.Vector3(gate.x, heightAt(gate.x, gate.z) + gate.altitude, gate.z),
    radius: gate.radius,
  };
}

/** Mission 2 follows only the live bot named by the confirmed attempt. */
export function confirmedHunterObjective(attempt: { attemptId: string; targetId: string | null; status: string },
  target: { id: string; position: THREE.Vector3; isBot: boolean; lifeState: string } | undefined): MissionObjective | null {
  if ((attempt.status !== 'APPROACH' && attempt.status !== 'RACING') || !attempt.targetId ||
    target?.id !== attempt.targetId || !target.isBot || target.lifeState !== 'alive') return null;
  return { id: `${attempt.attemptId}:${target.id}`, label: 'HUNTER', position: target.position, radius: 9 };
}

type ScreenRect = { left: number; top: number; right: number; bottom: number };
type SafeInsets = { left: number; right: number; top: number; bottom: number };
export type ObjectivePlacement = { kind: 'marker' | 'arrow'; x: number; y: number; angle: number };

const ARROW_HALF_WIDTH = 99;
const ARROW_HALF_HEIGHT = 23;
const MARKER_HALF_WIDTH = 70;
const MARKER_HALF_HEIGHT = 15;

function overlaps(x: number, y: number, halfWidth: number, halfHeight: number, rect: ScreenRect): boolean {
  return x + halfWidth > rect.left - 7 && x - halfWidth < rect.right + 7 &&
    y + halfHeight > rect.top - 7 && y - halfHeight < rect.bottom + 7;
}

/** Uses the active camera, including orbit/zoom. Behind-camera targets use
 * camera-local bearing instead of Three's inverted perspective projection. */
export function projectMissionObjective(
  camera: THREE.PerspectiveCamera, target: THREE.Vector3, radius: number,
  width: number, height: number, obstacles: readonly ScreenRect[] = [],
  safe: SafeInsets = { left: 0, right: 0, top: 0, bottom: 0 },
  projected = new THREE.Vector3(), local = new THREE.Vector3(),
): ObjectivePlacement {
  local.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const front = local.z < -camera.near;
  const safeTop = Math.min(height * .5 - 30, Math.max(height < 520 ? 124 : 112, height * .19, safe.top + 105));
  const safeBottom = Math.max(height * .5 + 30, Math.min(height - (height < 520 ? 75 : 68), height - safe.bottom - 55));
  const left = ARROW_HALF_WIDTH + Math.max(15, safe.left + 12);
  const right = width - ARROW_HALF_WIDTH - Math.max(15, safe.right + 12);
  if (front) {
    projected.copy(target).project(camera);
    const centerX = projected.x;
    const centerY = projected.y;
    const depth = projected.z;
    const x = (centerX + 1) * width * .5;
    const top = projected.set(target.x, target.y + radius, target.z).project(camera);
    const y = (1 - top.y) * height * .5 - 18;
    if (Number.isFinite(x) && Number.isFinite(y) && depth >= -1 && depth <= 1 &&
      x >= safe.left + MARKER_HALF_WIDTH + 8 && x <= width - safe.right - MARKER_HALF_WIDTH - 8 &&
      y >= safeTop && y <= safeBottom &&
      !obstacles.some((rect) => overlaps(x, y, MARKER_HALF_WIDTH, MARKER_HALF_HEIGHT, rect))) {
      return { kind: 'marker', x, y, angle: 0 };
    }
    projected.set(centerX, centerY, depth);
  }

  // A target directly behind has no useful horizontal bearing; the lower
  // edge means "turn around" while lateral targets still point left/right.
  let dx = front ? projected.x * width * .5 : local.x;
  let dy = front ? -projected.y * height * .5 : -local.y + Math.max(1, local.z) * .4;
  if (Math.hypot(dx, dy) < .001) { dx = 0; dy = -1; }
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const travel = Math.min(
    ux > 0 ? (right - width * .5) / ux : ux < 0 ? (left - width * .5) / ux : Infinity,
    uy > 0 ? (safeBottom - height * .5) / uy : uy < 0 ? (safeTop - height * .5) / uy : Infinity,
  );
  const desiredX = width * .5 + ux * travel;
  const desiredY = height * .5 + uy * travel;
  let bestX = desiredX;
  let bestY = desiredY;
  let bestScore = Infinity;
  // Search the same perimeter for a free label position, avoiding the mission
  // box, radar and player-placed touch controls without moving their layout.
  for (let step = 0; step <= 20; step++) {
    for (const sign of step === 0 ? [1] : [-1, 1]) {
      const offset = sign * step * 18;
      const vertical = Math.abs(ux) >= Math.abs(uy);
      const x = vertical ? (ux >= 0 ? right : left) : Math.max(left, Math.min(right, desiredX + offset));
      const y = vertical ? Math.max(safeTop, Math.min(safeBottom, desiredY + offset)) : (uy >= 0 ? safeBottom : safeTop);
      if (obstacles.some((rect) => overlaps(x, y, ARROW_HALF_WIDTH, ARROW_HALF_HEIGHT, rect))) continue;
      const score = Math.hypot(x - desiredX, y - desiredY);
      if (score < bestScore) { bestScore = score; bestX = x; bestY = y; }
    }
    if (bestScore < Infinity) break;
  }
  if (bestScore === Infinity) {
    for (const [x, y] of [[width * .5, safeTop], [width * .5, safeBottom], [left, height * .5], [right, height * .5]]) {
      if (obstacles.some((rect) => overlaps(x, y, ARROW_HALF_WIDTH, ARROW_HALF_HEIGHT, rect))) continue;
      const score = Math.hypot(x - desiredX, y - desiredY);
      if (score < bestScore) { bestScore = score; bestX = x; bestY = y; }
    }
  }
  return { kind: 'arrow', x: bestX, y: bestY, angle: Math.atan2(uy, ux) };
}

export function formatObjectiveDistance(meters: number): string {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} KM` : `${Math.round(meters)} M`;
}

/** Presentation only; the server remains responsible for low-altitude gate acceptance. */
export function lowAltitudeGateInstruction(gateNumber: number, grounded: boolean, distanceMeters: number,
  altitudeAgl: number, maxAltitude: number, rejectedTooHigh: boolean, justCleared: boolean): string {
  if (justCleared) return `GATE ${gateNumber - 1} CLEARED!`;
  if (grounded) return 'TAKE OFF — FOLLOW THE GOLD ARROW';
  if (altitudeAgl > maxAltitude && (rejectedTooHigh || distanceMeters <= 200)) return 'TOO HIGH — DESCEND';
  if (distanceMeters <= 900 && altitudeAgl > maxAltitude + 15) return `GATE ${gateNumber} BELOW — DESCEND`;
  if (distanceMeters <= 250 && altitudeAgl <= maxAltitude) return `FLY THROUGH GATE ${gateNumber}`;
  return `FOLLOW THE ARROW TO GATE ${gateNumber}`;
}

export type PrecisionTurnSide = 'LEFT' | 'RIGHT' | null;

/** Signed target bearing in the aircraft's existing forward/right coordinate frame. */
export function precisionGateBearing(aircraftX: number, aircraftZ: number, yaw: number,
  gateX: number, gateZ: number): { angle: number; horizontalDistance: number } {
  const dx = gateX - aircraftX;
  const dz = gateZ - aircraftZ;
  const forward = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  return { angle: Math.atan2(right, forward), horizontalDistance: Math.hypot(dx, dz) };
}

/** Presentation only. The ring opening and crossing still belong to the server. */
export function precisionGateGuidance(gateNumber: number, grounded: boolean, distanceMeters: number,
  horizontalDistance: number, heightDifference: number, gateRadius: number, bearingRadians: number,
  previousTurnSide: PrecisionTurnSide, justCleared: boolean, announceSharpTurn: boolean,
): { instruction: string; turnSide: PrecisionTurnSide } {
  if (grounded) return { instruction: 'TAKE OFF — FOLLOW THE GOLD ARROW', turnSide: null };
  const angle = Math.abs(bearingRadians);
  // Keep a turn cue until aligned, and resist switching sides during a turn.
  const turnSide = gateNumber === 4 && (angle > Math.PI * 55 / 180 || previousTurnSide && angle > Math.PI * 30 / 180)
    ? previousTurnSide && (angle < Math.PI * 70 / 180 || angle > Math.PI * 150 / 180)
      ? previousTurnSide : bearingRadians > 0 ? 'RIGHT' : 'LEFT'
    : null;
  if (justCleared) return { instruction: `GATE ${gateNumber - 1} CLEARED!`, turnSide };
  if (turnSide && announceSharpTurn) return { instruction: 'SHARP TURN AHEAD', turnSide };
  if (turnSide) return { instruction: `GATE 4 — TURN ${turnSide}`, turnSide };
  const heightTolerance = gateRadius * .92 * .5;
  if (distanceMeters <= 900 && heightDifference > heightTolerance) return { instruction: `GATE ${gateNumber} ABOVE — CLIMB`, turnSide: null };
  if (distanceMeters <= 900 && heightDifference < -heightTolerance) return { instruction: `GATE ${gateNumber} BELOW — DESCEND`, turnSide: null };
  if (horizontalDistance <= Math.max(160, gateRadius * 4) && angle <= Math.PI / 6 &&
    Math.abs(heightDifference) <= heightTolerance) return { instruction: `FLY THROUGH GATE ${gateNumber}`, turnSide: null };
  return { instruction: `FOLLOW THE ARROW TO GATE ${gateNumber}`, turnSide: null };
}

export type TerritoryGuidance = {
  phase: 'NAVIGATE' | 'CAPTURING' | 'BLOCKED' | 'CONTESTED' | 'DEFENDING' | 'RETURN' | 'RECAPTURE';
  instruction: string;
  target: 'territory' | 'defender' | null;
};

/** Selects a presentation target from server-owned territory and attempt state. */
export function territoryGuidance(grounded: boolean, inside: boolean, owned: boolean, contested: boolean,
  captureProgress: number, defenderId: string | undefined, defenderVisible: boolean, hadControl: boolean): TerritoryGuidance {
  if (grounded) return { phase: 'NAVIGATE', instruction: 'TAKE OFF — FOLLOW THE GOLD ARROW', target: 'territory' };
  if (!inside) return hadControl
    ? { phase: owned ? 'RETURN' : 'RECAPTURE', instruction: owned ? 'RETURN TO WHITE ROCK' : 'RECAPTURE WHITE ROCK', target: 'territory' }
    : { phase: 'NAVIGATE', instruction: 'FLY INTO THE HIGHLIGHTED AREA', target: 'territory' };
  if (contested) return { phase: 'CONTESTED', instruction: 'TERRITORY CONTESTED — DEFEND IT', target: null };
  if (owned) return { phase: 'DEFENDING', instruction: 'HOLD THE AREA FOR 30 SECONDS', target: null };
  if (captureProgress >= 95 && defenderId) return defenderVisible
    ? { phase: 'BLOCKED', instruction: 'DEFEAT THE MARKED DEFENDER', target: 'defender' }
    : { phase: 'BLOCKED', instruction: 'DEFENDER ACTIVE — LOCATING TARGET', target: null };
  if (captureProgress >= 95) return { phase: 'BLOCKED', instruction: 'CAPTURE BLOCKED — DEFENSE ACTIVE', target: null };
  if (hadControl && captureProgress === 0) return { phase: 'RECAPTURE', instruction: 'RECAPTURE WHITE ROCK', target: 'territory' };
  return { phase: 'CAPTURING', instruction: 'STAY INSIDE TO CAPTURE', target: null };
}

/** Optional coaching is per confirmed objective. Runway time never counts. */
export class ObjectiveApproachHint {
  private objectiveId = '';
  private referenceDistance = Infinity;
  private lastApproachAt = 0;
  private shown = false;
  private visible = false;

  update(id: string, distanceMeters: number, airborne: boolean, enabled: boolean, now: number): boolean {
    if (id !== this.objectiveId) {
      this.objectiveId = id;
      this.referenceDistance = distanceMeters;
      this.lastApproachAt = now;
      this.shown = false;
      this.visible = false;
    }
    if (!airborne || !enabled) {
      this.referenceDistance = distanceMeters;
      this.lastApproachAt = now;
      this.visible = false;
      return false;
    }
    if (distanceMeters < this.referenceDistance - 30) {
      this.referenceDistance = distanceMeters;
      this.lastApproachAt = now;
      this.visible = false;
    }
    if (!this.shown && now - this.lastApproachAt >= 20_000) {
      this.shown = true;
      this.visible = true;
    }
    return this.visible;
  }

  reset(): void {
    this.objectiveId = '';
    this.visible = false;
  }
}

export class ObjectiveGuidance {
  private readonly layer = document.createElement('div');
  private readonly marker = document.createElement('div');
  private readonly arrow = document.createElement('div');
  private readonly arrowIcon = document.createElement('span');
  private readonly arrowText = document.createElement('span');
  private readonly safeProbe = document.createElement('div');
  private readonly hint = new ObjectiveApproachHint();
  private readonly projected = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private objective: MissionObjective | null = null;
  private obstacles: ScreenRect[] = [];
  private safeInsets: SafeInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  private nextBoundsAt = 0;
  private nextLabelAt = 0;
  private lastLabel = '';
  distanceMeters = 0;
  hintVisible = false;

  constructor(root: HTMLElement) {
    this.layer.className = 'mission-objective-guidance';
    this.layer.setAttribute('aria-hidden', 'true');
    this.marker.className = 'mission-objective-marker';
    this.arrow.className = 'mission-objective-arrow';
    this.arrowIcon.className = 'mission-objective-arrow-icon';
    this.arrowIcon.textContent = '➜';
    this.arrow.append(this.arrowIcon, this.arrowText);
    this.safeProbe.className = 'mission-objective-safe-probe';
    this.layer.append(this.marker, this.arrow, this.safeProbe);
    root.append(this.layer);
    this.hide();
  }

  setObjective(objective: MissionObjective | null): void {
    if (this.objective?.id !== objective?.id) this.hint.reset();
    this.objective = objective;
    if (!objective) this.hide();
  }

  update(camera: THREE.PerspectiveCamera, player: THREE.Vector3, metersPerUnit: number,
    airborne: boolean, hintsEnabled: boolean, now = performance.now()): void {
    if (!this.objective) return;
    const target = this.objective;
    this.distanceMeters = player.distanceTo(target.position) * metersPerUnit;
    this.hintVisible = this.hint.update(target.id, this.distanceMeters, airborne, hintsEnabled, now);
    if (now >= this.nextBoundsAt) {
      this.nextBoundsAt = now + 350;
      this.obstacles = ['#sky-challenge', '#right-flight-stack', '#touch-controls [data-touch-control="stick"]',
        '#touch-controls [data-touch-control="throttle"]', '#touch-controls [data-touch-control="fire"]']
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .filter((element): element is HTMLElement => Boolean(element && element.getClientRects().length))
        .map((element) => element.getBoundingClientRect());
      if (typeof getComputedStyle === 'function') {
        const style = getComputedStyle(this.safeProbe);
        this.safeInsets = {
          left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0,
          top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0,
        };
      }
    }
    const placement = projectMissionObjective(camera, target.position, target.radius,
      innerWidth, innerHeight, this.obstacles, this.safeInsets, this.projected, this.local);
    const label = `${target.label} · ${formatObjectiveDistance(this.distanceMeters)}`;
    if (label !== this.lastLabel && now >= this.nextLabelAt) {
      this.lastLabel = label;
      this.nextLabelAt = now + 150;
      this.marker.textContent = label;
      this.arrowText.textContent = label;
    }
    this.marker.hidden = placement.kind !== 'marker';
    this.arrow.hidden = placement.kind !== 'arrow';
    const visible = placement.kind === 'marker' ? this.marker : this.arrow;
    visible.style.transform = `translate(-50%, -50%) translate(${placement.x.toFixed(1)}px, ${placement.y.toFixed(1)}px)`;
    if (placement.kind === 'arrow') this.arrowIcon.style.transform = `rotate(${placement.angle.toFixed(3)}rad)`;
  }

  hide(): void {
    this.marker.hidden = true;
    this.arrow.hidden = true;
    this.hintVisible = false;
  }

  dispose(): void { this.layer.remove(); }
}
