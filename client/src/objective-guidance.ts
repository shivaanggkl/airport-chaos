import * as THREE from 'three';

export type MissionObjective = {
  id: string;
  label: string;
  position: THREE.Vector3;
  radius: number;
  onscreenMarker?: boolean;
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

/** The dive cue follows the confirmed gate and current geometry, including a
 * missed gate behind the aircraft. It never treats altitude as a ceiling. */
export function gravityDropGuidance(gateNumber: number, distance: number, heightDifference: number,
  bearingAngle: number, radius: number, preparing: boolean, cleared: boolean): string {
  if (preparing) return 'GET READY — FOLLOW THE GOLD ARROW';
  if (cleared && gateNumber !== 5) return `GATE ${gateNumber - 1} CLEARED!`;
  if (Math.abs(bearingAngle) > Math.PI * .55) return `FOLLOW THE GOLD ARROW TO GATE ${gateNumber}`;
  const aligned = distance < radius * 3.2 && Math.abs(heightDifference) < radius * .65 &&
    Math.abs(bearingAngle) < .38;
  if (gateNumber === 5) return aligned ? 'LEVEL OUT — FLY THROUGH GATE 5'
    : heightDifference > radius * .45 ? 'PULL UP — REACH THE FINAL GATE'
      : heightDifference < -radius * .7 ? 'GATE 5 BELOW — DESCEND'
        : 'FLY THROUGH GATE 5';
  if (aligned || gateNumber === 1 && Math.abs(heightDifference) <= radius) return `FLY THROUGH GATE ${gateNumber}`;
  if (heightDifference < -radius * .45) return `NOSE DOWN — REACH GATE ${gateNumber}`;
  if (heightDifference > radius * .7) return `GATE ${gateNumber} ABOVE — CLIMB`;
  return `FLY THROUGH GATE ${gateNumber}`;
}

/** One confirmed target for the climb, peak and descent. Corrective altitude
 * cues follow the aircraft's actual position, including a missed approach. */
export function pendulumGateGuidance(gateNumber: number, onGround: boolean, distance: number,
  heightDifference: number, bearingAngle: number, radius: number, cleared: boolean): string {
  if (onGround) return 'TAKE OFF — FOLLOW THE GOLD ARROW';
  if (cleared && gateNumber === 4) return 'PEAK REACHED — SWING DOWN!';
  if (cleared) return `GATE ${gateNumber - 1} CLEARED!`;
  if (Math.abs(bearingAngle) > Math.PI * .55) return `FOLLOW THE GOLD ARROW TO GATE ${gateNumber}`;
  if (distance < radius * 3.2 && Math.abs(heightDifference) < radius * .65 && Math.abs(bearingAngle) < .38)
    return `FLY THROUGH GATE ${gateNumber}`;
  if (heightDifference > radius * .65) return `CLIMB — REACH GATE ${gateNumber}`;
  if (heightDifference < -radius * .65) return gateNumber === 4 ? 'SWING DOWN — REACH GATE 4'
    : gateNumber === 6 ? 'FINAL GATE — FINISH STRONG!' : `DESCEND — REACH GATE ${gateNumber}`;
  return gateNumber === 6 ? 'FINAL GATE — FINISH STRONG!' : `FLY THROUGH GATE ${gateNumber}`;
}

/** Advisory speed cue; the server alone decides whether a crossing counts. */
export function redlineGateGuidance(gateNumber: number, onGround: boolean, distanceMeters: number,
  ready: boolean, tooSlow: boolean, cleared: boolean): string {
  if (onGround) return 'TAKE OFF — FOLLOW THE GOLD ARROW';
  if (tooSlow) return `TOO SLOW — TRY GATE ${gateNumber} AGAIN`;
  if (cleared) return `GATE ${gateNumber - 1} CLEARED!`;
  if (gateNumber === 1) return distanceMeters > 700 ? 'FOLLOW THE ARROW TO GATE 1' : 'FLY THROUGH GATE 1';
  if (!ready) return 'SPEED UP — INCREASE THROTTLE';
  if (gateNumber === 5) return 'FINAL SPEED GATE — GO!';
  return `SPEED READY — FLY THROUGH GATE ${gateNumber}`;
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

/** Presentation guidance for the shared ascending course; it never accepts a gate. */
export function climbGateInstruction(gateNumber: number, grounded: boolean, distanceMeters: number,
  heightDifference: number, gateRadius: number, speed: number, takeoffSpeed: number, justCleared: boolean,
  departureTurnSide: PrecisionTurnSide = null, clearOfRunway = true): string {
  if (justCleared) return `GATE ${gateNumber - 1} CLEARED!`;
  if (grounded) return 'TAKE OFF — CLIMB CLEAR OF RUNWAY';
  if (gateNumber === 1 && !clearOfRunway) return 'CLIMB CLEAR OF RUNWAY';
  if (gateNumber === 1 && departureTurnSide) return `GATE 1 — TURN ${departureTurnSide}`;
  if (heightDifference > gateRadius * .5 && distanceMeters <= 1_700) {
    if (speed < takeoffSpeed * 1.2) return 'GAIN SPEED TO KEEP CLIMBING';
    return `CLIMB TO GATE ${gateNumber}`;
  }
  if (distanceMeters <= Math.max(210, gateRadius * 3) && Math.abs(heightDifference) <= gateRadius * .7)
    return `FLY THROUGH GATE ${gateNumber}`;
  return `FOLLOW THE ARROW TO GATE ${gateNumber}`;
}

export type PrecisionTurnSide = 'LEFT' | 'RIGHT' | null;

/** The configured Addison departure points away from Gate 1; keep the initial turn cue stable until aligned. */
export function climbDepartureTurnSide(gateNumber: number, grounded: boolean, bearingRadians: number,
  previousTurnSide: PrecisionTurnSide): PrecisionTurnSide {
  if (gateNumber !== 1 || grounded || !Number.isFinite(bearingRadians)) return null;
  const angle = Math.abs(bearingRadians);
  if (angle < Math.PI / 4) return null;
  if (previousTurnSide) return previousTurnSide;
  return angle > Math.PI * 5 / 9 ? bearingRadians < 0 ? 'LEFT' : 'RIGHT' : null;
}

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

/** Presentation only. Turn side follows the aircraft's actual heading, with a quiet alignment band. */
export function slalomGateGuidance(gateNumber: number, grounded: boolean, distanceMeters: number,
  horizontalDistance: number, heightDifference: number, gateRadius: number, bearingRadians: number,
  previousTurnSide: PrecisionTurnSide, justCleared: boolean,
): { instruction: string; turnSide: PrecisionTurnSide } {
  if (grounded) return { instruction: 'TAKE OFF — FOLLOW THE GOLD ARROW', turnSide: null };
  const angle = Math.abs(bearingRadians);
  const turnSide = angle >= Math.PI * 30 / 180 || previousTurnSide && angle >= Math.PI * 18 / 180
    ? previousTurnSide && (angle < Math.PI * 110 / 180 || angle > Math.PI * 155 / 180)
      ? previousTurnSide : bearingRadians > 0 ? 'RIGHT' : 'LEFT'
    : null;
  if (justCleared) return { instruction: `GATE ${gateNumber - 1} CLEARED!`, turnSide };
  if (turnSide) return { instruction: `GATE ${gateNumber} — TURN ${turnSide}`, turnSide };
  if (horizontalDistance <= Math.max(240, gateRadius * 3) && angle <= Math.PI / 10 &&
    Math.abs(heightDifference) <= gateRadius * .6) return { instruction: `FLY THROUGH GATE ${gateNumber}`, turnSide: null };
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
    this.marker.hidden = placement.kind !== 'marker' || target.onscreenMarker === false;
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
