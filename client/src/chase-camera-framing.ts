/** Fit cached visible geometry once per model/viewport change, at a 15° rear elevation. */
export function fitAircraftChase(width: number, height: number, length: number, aspect: number, widthFraction = .29, points?: readonly number[]) {
  const elevation = Math.tan(Math.PI / 12), focusRatio = .075;
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
    // Solve the projection inequalities directly; no iterative rendering or per-frame bounds work.
    distance = Math.max(distance, z + .1,
      (Math.abs(x) / (widthFraction * horizontalTan) + depthOffset) / depthScale,
      (verticalOffset + .8 * verticalTan * depthOffset) / (.8 * verticalTan * depthScale - verticalScale),
      (.85 * verticalTan * depthOffset - verticalOffset) / (verticalScale + .85 * verticalTan * depthScale));
  }
  return { distance, height: distance * elevation, focusHeight: distance * focusRatio };
}
