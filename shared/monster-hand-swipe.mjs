// Mission 19's close-range hand attack. Positions are fractions of creature height.
export const monsterHandSwipe = Object.freeze({
  durationMs: 700,
  cooldownMs: 2_200,
  activationRadius: 240,
  hitRadius: 95,
  damage: 25,
  maxReachRatio: .35,
  rest: Object.freeze({ x: .42, y: .30, z: -.12 }),
  armOrigin: Object.freeze({ x: .31, y: .62, z: 0 }),
});

const smooth = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function monsterHandSwipeWeight(progress) {
  return smooth(progress / .35) * (1 - smooth((progress - .55) / .45));
}
