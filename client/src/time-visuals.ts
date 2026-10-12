// Visual-only presets. Day and Dusk values retain their established appearance.
export function createTimeVisuals(isDallas: boolean) {
  return {
    day: { background: isDallas ? 0x5aaee0 : 0x76c9ed, ambientSky: isDallas ? 0xd4efff : 0xd9f3ff, ambientGround: isDallas ? 0x587443 : 0x5d764a, ambientIntensity: isDallas ? 2.78 : 2.55, sunColor: isDallas ? 0xffd39a : 0xffe2ae, sunIntensity: isDallas ? 3.72 : 3.45, sunPosition: [-2400, 4200, 1800], horizon: isDallas ? 0xaedcf0 : 0xc4e8f4, middle: isDallas ? 0xaedcf0 : 0xc4e8f4, zenith: isDallas ? 0x217fbe : 0x2d9dd4, gradientLow: -0.18, gradientHigh: 0.82, duskAmount: 0, eveningAmount: 0 },
    dusk: { background: 0x33405e, ambientSky: 0xb8c8e8, ambientGround: 0x53604e, ambientIntensity: 1.4, sunColor: 0xffae78, sunIntensity: 1.68, sunPosition: [-2400, 4200, 1800], horizon: 0xaa644a, middle: 0x51476f, zenith: 0x1b2d58, gradientLow: -0.10, gradientHigh: 0.34, duskAmount: 1, eveningAmount: 0 },
    evening: { background: 0x91bed2, ambientSky: 0xc8ddeb, ambientGround: 0x738672, ambientIntensity: 1.55, sunColor: 0xffbc78, sunIntensity: 2.2, sunPosition: [-4200, 1800, 2400], horizon: 0x728e9a, middle: 0x4c94c0, zenith: 0x195d9e, gradientLow: -0.18, gradientHigh: 0.82, duskAmount: 0, eveningAmount: 1 },
  } as const;
}
