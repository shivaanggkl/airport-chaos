type Vector3 = Readonly<{ x: number; y: number; z: number }>;
type Runway = Readonly<{ x: number; z: number; heading: number; runwayWidth: number; runwayLength: number }>;
type LandingEnvelope = Readonly<{ speed: number; descent: number; tilt: number }>;

/** Score the championship from the latest accepted server transform, never from a submitted grade. */
export function observedChampionshipLanding(position: Vector3, velocity: Vector3, rotation: Vector3,
  runway: Runway, runwayY: number, envelope: LandingEnvelope) {
  const dx = position.x - runway.x;
  const dz = position.z - runway.z;
  const along = dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading);
  const lateral = dx * Math.cos(runway.heading) - dz * Math.sin(runway.heading);
  if (Math.abs(along) > runway.runwayLength / 2 + 35 || Math.abs(lateral) > runway.runwayWidth / 2 + 8 ||
    Math.abs(position.y - runwayY) > 8) return null;
  const speed = Math.hypot(velocity.x, velocity.z);
  const bankAngle = Math.abs(Math.atan2(Math.sin(rotation.z), Math.cos(rotation.z)));
  const heading = rotation.y - runway.heading;
  const headingError = Math.min(
    Math.abs(Math.atan2(Math.sin(heading), Math.cos(heading))),
    Math.abs(Math.atan2(Math.sin(heading + Math.PI), Math.cos(heading + Math.PI))),
  );
  if (speed < 12 || speed > envelope.speed * 1.18 || velocity.y > 1 ||
    Math.abs(velocity.y) > envelope.descent * 1.35 || bankAngle > envelope.tilt + .12 ||
    Math.abs(rotation.x) > envelope.tilt + .10 || headingError > .62) return null;
  return { speed, descentRate: velocity.y, bankAngle, pitch: rotation.x, headingError };
}

/** A low pass over the runway is not a landing; accepted movement must reach the surface. */
export function observedChampionshipTouchdown(previous: Vector3, current: Vector3, velocity: Vector3,
  rotation: Vector3, runway: Runway, runwayY: number, envelope: LandingEnvelope) {
  if (previous.y <= runwayY + .01 || current.y < runwayY - .5 || current.y > runwayY + .5) return null;
  return observedChampionshipLanding(current, velocity, rotation, runway, runwayY, envelope);
}
