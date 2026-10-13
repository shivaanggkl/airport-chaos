// Mission 19 jump timing shared by authoritative motion and the skinned pose.
export const monsterJumpMotion = Object.freeze({anticipationEnd: .25, landingStart: .82,
  durationMs: 2800, height: 140, distance: 240, intervalMs: 18000, crouch: 15, landingCrouch: 18});
export function monsterJumpLift(progress) {
  const p=Math.max(0,Math.min(1,progress));
  if(p<monsterJumpMotion.anticipationEnd)return -monsterJumpMotion.crouch*Math.sin(Math.PI*p/monsterJumpMotion.anticipationEnd);
  if(p<monsterJumpMotion.landingStart){
    const t=(p-monsterJumpMotion.anticipationEnd)/(monsterJumpMotion.landingStart-monsterJumpMotion.anticipationEnd);
    return monsterJumpMotion.height*4*t*(1-t);
  }
  return -monsterJumpMotion.landingCrouch*Math.sin(Math.PI*(p-monsterJumpMotion.landingStart)/(1-monsterJumpMotion.landingStart));
}
