export const landingGradeForScore = (score) => score >= 940 ? 'LEGENDARY' : score >= 820 ? 'PERFECT' : score >= 650 ? 'SMOOTH' : score >= 420 ? 'SAFE' : 'ROUGH';

export function landingPrecisionScore(telemetry, envelope) {
  const within = (value, maximum) => Math.max(0, 1 - value / maximum);
  const smoothness = within(Math.abs(telemetry.descentRate), envelope.descent * 1.5) * 0.36;
  const alignment = within(telemetry.headingError, 0.46) * 0.28;
  const wingsLevel = within(telemetry.bankAngle, envelope.tilt) * 0.22;
  const attitude = within(Math.abs(telemetry.pitch), envelope.tilt) * 0.08;
  const speedControl = within(Math.abs(telemetry.speed - envelope.speed * 0.72), envelope.speed * 0.75) * 0.06;
  return Math.max(1, Math.min(1000, Math.round((smoothness + alignment + wingsLevel + attitude + speedControl) * 1000)));
}
