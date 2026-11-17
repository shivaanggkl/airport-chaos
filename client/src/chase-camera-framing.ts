import type { AircraftType } from './aircraft';

export type AircraftCameraProfile = Readonly<{ widthFraction: number; elevation: number }>;
export const aircraftCameraProfiles: Readonly<Record<AircraftType, AircraftCameraProfile>> = {
  trainer: { widthFraction: .24, elevation: 15 * Math.PI / 180 },
  fighter: { widthFraction: .29, elevation: 13 * Math.PI / 180 },
  privateJet: { widthFraction: .33, elevation: 18 * Math.PI / 180 },
  cargo: { widthFraction: .35, elevation: 20 * Math.PI / 180 },
};

// Conservative ordinary bank/climb poses, evaluated only when fitting cached geometry.
const framingAttitudes = [[0, 1.22], [0, -1.22], [.38, .8], [.38, -.8], [-.38, .8], [-.38, -.8]].map(([pitch, bank]) => ({
  pitchSin: Math.sin(pitch!), pitchCos: Math.cos(pitch!), bankSin: Math.sin(bank!), bankCos: Math.cos(bank!),
  cameraSin: Math.sin(bank! * .08), cameraCos: Math.cos(bank! * .08),
}));

/** Fit cached visible geometry once per model/viewport change, using the aircraft profile. */
export function fitAircraftChase(width: number, height: number, length: number, aspect: number, profile: AircraftCameraProfile, points?: readonly number[], usableWidthFraction = 1) {
  const elevation = Math.tan(profile.elevation), focusRatio = .075;
  const widthFraction = profile.widthFraction * usableWidthFraction;
  const angle = Math.atan(elevation - focusRatio);
  const sin = Math.sin(angle), cos = Math.cos(angle);
  const verticalTan = Math.tan(58 * Math.PI / 360), horizontalTan = verticalTan * aspect;
  const depthScale = elevation * sin + cos, verticalScale = sin - elevation * cos;
  let distance = .1, safetyDistance = .1;
  const count = points ? points.length / 3 : 8;
  for (let index = 0; index < count; index++) {
    const x = points ? points[index * 3]! : (index & 1 ? 1 : -1) * width / 2;
    const y = points ? points[index * 3 + 1]! : (index & 2 ? 1 : -1) * height / 2;
    const z = points ? points[index * 3 + 2]! : (index & 4 ? 1 : -1) * length / 2;
    const depthOffset = y * sin + z * cos, verticalOffset = y * cos - z * sin;
    // Solve the projection inequalities directly; no iterative rendering or per-frame bounds work.
    distance = Math.max(distance, z + .1,
      (Math.abs(x) / (widthFraction * horizontalTan) + depthOffset) / depthScale,
      (verticalOffset + .8 * verticalTan * depthOffset) / (.8 * verticalTan * depthScale - verticalScale),
      (.85 * verticalTan * depthOffset - verticalOffset) / (verticalScale + .85 * verticalTan * depthScale));
    for (const pose of framingAttitudes) {
      const bankY = x * pose.bankSin + y * pose.bankCos;
      const rotatedX = x * pose.bankCos - y * pose.bankSin;
      const rotatedY = bankY * pose.pitchCos - z * pose.pitchSin;
      const rotatedZ = bankY * pose.pitchSin + z * pose.pitchCos;
      const depth = rotatedY * sin + rotatedZ * cos;
      const vertical = (rotatedY * cos - rotatedZ * sin) * pose.cameraCos - rotatedX * pose.cameraSin;
      const scale = verticalScale * pose.cameraCos;
      safetyDistance = Math.max(safetyDistance, rotatedZ + .1,
        (vertical + .97 * verticalTan * depth) / (.97 * verticalTan * depthScale - scale),
        (.97 * verticalTan * depth - vertical) / (scale + .97 * verticalTan * depthScale));
    }
  }
  const safetyAdjusted = safetyDistance > distance;
  distance = Math.max(distance, safetyDistance);
  return { safetyAdjusted, distance, height: distance * elevation, focusHeight: distance * focusRatio };
}
