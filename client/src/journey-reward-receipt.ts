const storageKey = 'airport-chaos-journey-reward-receipt';

export function storeJourneyRewardReceipt(attemptId: string, pilotId: string, credits: number, missionId?: string): void {
  try {
    if (Number.isSafeInteger(credits) && (credits > 0 || credits === 0 && missionId)) {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptId, pilotId, credits, missionId }));
    } else {
      sessionStorage.removeItem(storageKey);
    }
  } catch { /* The journey still opens if session storage is unavailable. */ }
}

export function takeJourneyRewardReceipt(attemptId: string, pilotId: string): number {
  return takeJourneyCompletionReceipt(attemptId,pilotId)?.credits ?? 0;
}

export function takeJourneyCompletionReceipt(attemptId: string, pilotId: string): {credits:number;missionId?:string}|undefined {
  try {
    const stored = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    if (!stored) return undefined;
    const receipt = JSON.parse(stored) as { attemptId?: string; pilotId?: string; credits?: number; missionId?:string };
    if(receipt.attemptId!==attemptId||receipt.pilotId!==pilotId||!Number.isSafeInteger(receipt.credits)||receipt.credits!<0)return undefined;
    return {credits:receipt.credits!,missionId:typeof receipt.missionId==='string'?receipt.missionId:undefined};
  } catch { return undefined; }
}
