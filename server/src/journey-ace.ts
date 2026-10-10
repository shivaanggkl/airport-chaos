export type AceDamageContext = {
  shooterId: string;
  assignedPilotId: string;
  activeAttemptId: string | undefined;
  bossAttemptId: string;
  activeTargetId: string | null;
  bossId: string;
  attemptStatus: string | undefined;
  tookOffFromLove: boolean;
  runwayPreparation: boolean;
};

/** A normal validated projectile may damage only its owner's assigned Ace. */
export function aceDamageAuthorized(context: AceDamageContext): boolean {
  return context.shooterId === context.assignedPilotId &&
    context.activeAttemptId === context.bossAttemptId &&
    context.activeTargetId === context.bossId &&
    context.attemptStatus === 'RACING' &&
    context.tookOffFromLove && !context.runwayPreparation;
}
