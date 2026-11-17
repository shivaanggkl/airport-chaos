import { Vector3, type Quaternion } from 'three';

export const aircraftCameraProfile = { widthFraction: .35, elevation: 16 * Math.PI / 180, focusRatio: .075, groundClearance: 2.2 } as const;
const firehawkCameraProfile = { widthFraction: .34, elevation: 5 * Math.PI / 180, focusRatio: .01, groundClearance: 1.1 } as const;
export function normalAircraftCameraProfile(type: string) {
  return type === 'fighter' ? firehawkCameraProfile : aircraftCameraProfile;
}

/** Fit cached visible geometry in straight, level flight only. */
export function fitAircraftChase(width: number, height: number, length: number, aspect: number, points?: readonly number[], profile: { widthFraction: number; elevation: number; focusRatio: number } = aircraftCameraProfile) {
  const elevation = Math.tan(profile.elevation), focusRatio = profile.focusRatio;
  const angle = Math.atan(elevation - focusRatio);
  const sin = Math.sin(angle), cos = Math.cos(angle);
  const verticalTan = Math.tan(58 * Math.PI / 360), horizontalTan = verticalTan * aspect;
  const depthScale = elevation * sin + cos, verticalScale = sin - elevation * cos;
  let distance = .1;
  const count = points ? points.length / 3 : 8;
  for (let index = 0; index < count; index++) {
    const x = points ? points[index * 3]! : (index & 1 ? 1 : -1) * width / 2;
    const y = points ? points[index * 3 + 1]! : (index & 2 ? 1 : -1) * height / 2;
    const z = points ? points[index * 3 + 2]! : (index & 4 ? 1 : -1) * length / 2;
    const depthOffset = y * sin + z * cos, verticalOffset = y * cos - z * sin;
    distance = Math.max(distance, (2.2 + depthOffset) / depthScale,
      (Math.abs(x) / (profile.widthFraction * horizontalTan) + depthOffset) / depthScale,
      (verticalOffset + .94 * verticalTan * depthOffset) / (.94 * verticalTan * depthScale - verticalScale),
      (.94 * verticalTan * depthOffset - verticalOffset) / (verticalScale + .94 * verticalTan * depthScale));
  }
  return { distance, height: distance * elevation, focusHeight: distance * focusRatio };
}

// Cache actual extreme vertices in 26 directions when the model loads. These
// retain the airframe's outline instead of empty corners of an enclosing box.
export function cacheAircraftSafetyPoints(points: readonly number[]): number[] {
  const result: number[] = [], included = new Set<number>();
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    let best = -Infinity, selected = -1;
    for (let index = 0; index < points.length; index += 3) {
      const projection = points[index]! * x + points[index + 1]! * y + points[index + 2]! * z;
      if (projection > best) { best = projection; selected = index; }
    }
    if (selected >= 0 && !included.has(selected)) {
      included.add(selected); result.push(points[selected]!, points[selected + 1]!, points[selected + 2]!);
    }
  }
  return result;
}

const safetyVertex = new Vector3();
/** Minimum temporary distance for the current attitude; bounded cached points only. */
export function requiredChaseDistance(points: readonly number[], rotation: Quaternion, aspect: number, elevation: number, roll: number, focusRatio: number = aircraftCameraProfile.focusRatio): number {
  const slope = Math.tan(elevation), angle = Math.atan(slope - focusRatio);
  const sin = Math.sin(angle), cos = Math.cos(angle), rollSin = Math.sin(roll), rollCos = Math.cos(roll);
  const vertical = Math.tan(58 * Math.PI / 360) * .94, horizontal = vertical * aspect;
  const depthScale = slope * sin + cos, screenScale = sin - slope * cos;
  const xScale = screenScale * rollSin, yScale = screenScale * rollCos;
  let distance = 0;
  for (let index = 0; index < points.length; index += 3) {
    safetyVertex.fromArray(points, index).applyQuaternion(rotation);
    const { x, y, z } = safetyVertex;
    const depthOffset = y * sin + z * cos, screenY = y * cos - z * sin;
    const screenX = x * rollCos + screenY * rollSin, rotatedY = screenY * rollCos - x * rollSin;
    distance = Math.max(distance, (2.2 + depthOffset) / depthScale,
      (screenX + horizontal * depthOffset) / (horizontal * depthScale - xScale),
      (-screenX + horizontal * depthOffset) / (horizontal * depthScale + xScale),
      (rotatedY + vertical * depthOffset) / (vertical * depthScale - yScale),
      (-rotatedY + vertical * depthOffset) / (vertical * depthScale + yScale));
  }
  return distance;
}
