import * as THREE from 'three';

export type StuntType =
  | 'barrelRoll'
  | 'quickDodge'
  | 'invertedFlight'
  | 'lowPass'
  | 'nearMiss'
  | 'bridgeRun'
  | 'highSpeedPass'
  | 'diveRecovery'
  | 'precisionLanding';

export type StuntZone = {
  id: string;
  kind: 'bridge' | 'landmark';
  x: number;
  z: number;
  radius: number;
  minAltitude: number;
  maxAltitude: number;
};

export type StuntFrame = {
  delta: number;
  airborne: boolean;
  position: THREE.Vector3;
  altitude: number;
  speed: number;
  maxSpeed: number;
  stallSpeed: number;
  verticalSpeed: number;
  roll: number;
  aircraftType: 'trainer' | 'privateJet' | 'cargo' | 'fighter';
};

export type LandingQuality = {
  speed: number;
  safeSpeed: number;
  descentRate: number;
  safeDescentRate: number;
  bankAngle: number;
  pitch: number;
  headingError: number;
  aircraftType: StuntFrame['aircraftType'];
};

type StuntCallbacks = {
  onScore: (points: number) => void;
  onCredits: (credits: number) => void;
  onMessage: (message: string) => void;
  onStunt?: (type: StuntType) => void;
};

const STUNT_POINTS: Record<StuntType, number> = {
  barrelRoll: 150,
  quickDodge: 180,
  invertedFlight: 200,
  lowPass: 250,
  nearMiss: 300,
  bridgeRun: 400,
  highSpeedPass: 300,
  diveRecovery: 350,
  precisionLanding: 500,
};

const STUNT_LABELS: Record<StuntType, string> = {
  barrelRoll: 'BARREL ROLL',
  quickDodge: 'QUICK DODGE',
  invertedFlight: 'INVERTED FLIGHT',
  lowPass: 'LOW PASS',
  nearMiss: 'NEAR MISS',
  bridgeRun: 'BRIDGE RUN',
  highSpeedPass: 'HIGH-SPEED PASS',
  diveRecovery: 'DIVE RECOVERY',
  precisionLanding: 'PRECISION LANDING',
};

export const stuntGuide: ReadonlyArray<{ type: StuntType; name: string; how: string; where: string; reward: number }> = [
  { type: 'barrelRoll', name: STUNT_LABELS.barrelRoll, how: 'Hold X + A / D for one full roll.', where: 'Open sky', reward: STUNT_POINTS.barrelRoll },
  { type: 'quickDodge', name: STUNT_LABELS.quickDodge, how: 'Hold X + ← / → to break sideways.', where: 'Open sky or combat', reward: STUNT_POINTS.quickDodge },
  { type: 'invertedFlight', name: STUNT_LABELS.invertedFlight, how: 'Fly upside down for a few seconds without slowing too much.', where: 'Open sky', reward: STUNT_POINTS.invertedFlight },
  { type: 'lowPass', name: STUNT_LABELS.lowPass, how: 'Fly fast and safely close to terrain without touching it.', where: 'Open ground or water corridors', reward: STUNT_POINTS.lowPass },
  { type: 'nearMiss', name: STUNT_LABELS.nearMiss, how: 'Pass close to another real pilot without colliding.', where: 'Multiplayer airspace', reward: STUNT_POINTS.nearMiss },
  { type: 'bridgeRun', name: STUNT_LABELS.bridgeRun, how: 'Fly through a designated bridge corridor at low altitude.', where: 'Marked bridge corridors', reward: STUNT_POINTS.bridgeRun },
  { type: 'highSpeedPass', name: STUNT_LABELS.highSpeedPass, how: 'Sustain high speed near terrain or a stunt landmark.', where: 'Low routes and landmark zones', reward: STUNT_POINTS.highSpeedPass },
  { type: 'diveRecovery', name: STUNT_LABELS.diveRecovery, how: 'Commit to a steep dive, then recover well above terrain.', where: 'Open air with clear recovery room', reward: STUNT_POINTS.diveRecovery },
  { type: 'precisionLanding', name: STUNT_LABELS.precisionLanding, how: 'Land gently and straight, with no red speed warning.', where: 'Any runway', reward: STUNT_POINTS.precisionLanding },
];

const comboTimeout = 9;
const normalizedAngle = (angle: number): number => THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;

export class StuntComboSystem {
  private previousRoll = 0;
  private rollTravel = 0;
  private rollDirection = 0;
  private invertedTime = 0;
  private invertedArmed = true;
  private lowPassTime = 0;
  private lowPassArmed = true;
  private highSpeedTime = 0;
  private highSpeedArmed = true;
  private bridgeArmed = new Set<string>();
  private diving = false;
  private diveStartAltitude = 0;
  private comboMultiplier = 1;
  private comboPoints = 0;
  private comboStunts = 0;
  private comboIdle = 0;
  private lastStunt: StuntType | null = null;

  constructor(
    private readonly zones: readonly StuntZone[],
    private readonly callbacks: StuntCallbacks,
  ) {
    for (const zone of zones) if (zone.kind === 'bridge') this.bridgeArmed.add(zone.id);
  }

  update(frame: StuntFrame): void {
    if (!frame.airborne) {
      this.previousRoll = frame.roll;
      this.rollTravel = 0;
      this.invertedTime = 0;
      this.lowPassTime = 0;
      this.highSpeedTime = 0;
      return;
    }

    this.comboIdle += frame.delta;
    if (this.comboStunts > 0 && this.comboIdle >= comboTimeout) this.finishCombo();

    this.detectBarrelRoll(frame);
    this.detectInverted(frame);
    this.detectLowPass(frame);
    this.detectBridgeRun(frame);
    this.detectHighSpeedPass(frame);
    this.detectDiveRecovery(frame);
  }

  notifyNearMiss(aircraftType: StuntFrame['aircraftType']): void {
    this.award('nearMiss', aircraftType);
  }

  notifyQuickDodge(aircraftType: StuntFrame['aircraftType']): void {
    this.award('quickDodge', aircraftType);
  }

  notifyLanding(quality: LandingQuality): void {
    const precise =
      quality.speed <= quality.safeSpeed * 0.78 &&
      Math.abs(quality.descentRate) <= quality.safeDescentRate * 0.58 &&
      quality.bankAngle <= 0.16 &&
      Math.abs(quality.pitch) <= 0.13 &&
      quality.headingError <= 0.18;
    if (precise) this.award('precisionLanding', quality.aircraftType);
  }

  reset(): void {
    this.comboMultiplier = 1;
    this.comboPoints = 0;
    this.comboStunts = 0;
    this.comboIdle = 0;
    this.lastStunt = null;
    this.rollTravel = 0;
    this.rollDirection = 0;
    this.invertedTime = 0;
    this.invertedArmed = true;
    this.lowPassTime = 0;
    this.lowPassArmed = true;
    this.highSpeedTime = 0;
    this.highSpeedArmed = true;
    this.diving = false;
    for (const zone of this.zones) if (zone.kind === 'bridge') this.bridgeArmed.add(zone.id);
  }

  private detectBarrelRoll(frame: StuntFrame): void {
    const delta = normalizedAngle(frame.roll - this.previousRoll);
    this.previousRoll = frame.roll;
    if (Math.abs(delta) < 0.001) return;
    const direction = Math.sign(delta);
    if (this.rollDirection !== 0 && direction !== this.rollDirection) this.rollTravel = 0;
    this.rollDirection = direction;
    this.rollTravel += Math.abs(delta);
    if (this.rollTravel >= Math.PI * 2 - 0.16) {
      this.rollTravel = 0;
      this.award('barrelRoll', frame.aircraftType);
    }
  }

  private detectInverted(frame: StuntFrame): void {
    const inverted = Math.abs(Math.abs(normalizedAngle(frame.roll)) - Math.PI) <= 0.38;
    if (!inverted) {
      this.invertedTime = 0;
      if (Math.abs(Math.abs(normalizedAngle(frame.roll)) - Math.PI) > 0.62) this.invertedArmed = true;
      return;
    }
    if (!this.invertedArmed || frame.speed < frame.stallSpeed * 1.2) return;
    this.invertedTime += frame.delta;
    if (this.invertedTime >= 2.5) {
      this.invertedArmed = false;
      this.invertedTime = 0;
      this.award('invertedFlight', frame.aircraftType);
    }
  }

  private detectLowPass(frame: StuntFrame): void {
    const eligible = frame.altitude >= 7 && frame.altitude <= 45 && frame.speed >= Math.max(frame.stallSpeed * 1.35, frame.maxSpeed * 0.58);
    if (!eligible) {
      this.lowPassTime = 0;
      if (frame.altitude > 68 || frame.speed < frame.maxSpeed * 0.42) this.lowPassArmed = true;
      return;
    }
    if (!this.lowPassArmed) return;
    this.lowPassTime += frame.delta;
    if (this.lowPassTime >= 1.1) {
      this.lowPassArmed = false;
      this.lowPassTime = 0;
      this.award('lowPass', frame.aircraftType);
    }
  }

  private detectBridgeRun(frame: StuntFrame): void {
    for (const zone of this.zones) {
      if (zone.kind !== 'bridge') continue;
      const distance = Math.hypot(frame.position.x - zone.x, frame.position.z - zone.z);
      const inside = distance <= zone.radius && frame.altitude >= zone.minAltitude && frame.altitude <= zone.maxAltitude;
      if (!inside) {
        if (distance > zone.radius * 1.2) this.bridgeArmed.add(zone.id);
        continue;
      }
      if (this.bridgeArmed.delete(zone.id)) this.award('bridgeRun', frame.aircraftType);
    }
  }

  private detectHighSpeedPass(frame: StuntFrame): void {
    const nearLandmark = this.zones.some((zone) => zone.kind === 'landmark' && Math.hypot(frame.position.x - zone.x, frame.position.z - zone.z) <= zone.radius && frame.altitude <= zone.maxAltitude);
    const eligible = frame.speed >= frame.maxSpeed * 0.82 && (frame.altitude <= 150 || nearLandmark);
    if (!eligible) {
      this.highSpeedTime = 0;
      if (frame.altitude > 230 || frame.speed < frame.maxSpeed * 0.66) this.highSpeedArmed = true;
      return;
    }
    if (!this.highSpeedArmed) return;
    this.highSpeedTime += frame.delta;
    if (this.highSpeedTime >= 0.8) {
      this.highSpeedArmed = false;
      this.highSpeedTime = 0;
      this.award('highSpeedPass', frame.aircraftType);
    }
  }

  private detectDiveRecovery(frame: StuntFrame): void {
    if (!this.diving && frame.altitude >= 180 && frame.verticalSpeed <= -Math.max(8, frame.maxSpeed * 0.11)) {
      this.diving = true;
      this.diveStartAltitude = frame.altitude;
      return;
    }
    if (!this.diving) return;
    if (frame.verticalSpeed >= 1.5 && frame.altitude >= 55 && this.diveStartAltitude - frame.altitude >= 110) {
      this.diving = false;
      this.award('diveRecovery', frame.aircraftType);
    } else if (frame.altitude < 25 || frame.verticalSpeed > -0.5 && this.diveStartAltitude - frame.altitude < 70) {
      this.diving = false;
    }
  }

  private award(type: StuntType, aircraftType: StuntFrame['aircraftType']): void {
    if (this.lastStunt === type && this.comboStunts > 0) return;
    const continuesCombo = this.comboStunts > 0 && this.comboIdle < comboTimeout;
    this.comboMultiplier = continuesCombo ? Math.min(5, this.comboMultiplier + 1) : 1;
    const heavyBonus = aircraftType === 'cargo' && type !== 'precisionLanding' && type !== 'invertedFlight' ? 1.25 : 1;
    const points = Math.round(STUNT_POINTS[type] * this.comboMultiplier * heavyBonus);
    this.comboPoints += points;
    this.comboStunts += 1;
    this.comboIdle = 0;
    this.lastStunt = type;
    this.callbacks.onScore(points);
    this.callbacks.onStunt?.(type);
    this.callbacks.onMessage(`${STUNT_LABELS[type]} +${points}${this.comboMultiplier > 1 ? ` · COMBO x${this.comboMultiplier}` : ''}`);
  }

  private finishCombo(): void {
    const credits = Math.min(8, Math.max(1, Math.floor(this.comboPoints / 450)));
    this.callbacks.onCredits(credits);
    this.callbacks.onMessage(`COMBO BANKED +${credits} CREDITS`);
    this.comboMultiplier = 1;
    this.comboPoints = 0;
    this.comboStunts = 0;
    this.comboIdle = 0;
    this.lastStunt = null;
  }
}
