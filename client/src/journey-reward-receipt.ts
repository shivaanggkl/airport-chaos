const storageKey = 'airport-chaos-journey-reward-receipt';

export function storeJourneyRewardReceipt(attemptId: string, pilotId: string, credits: number): void {
  try {
    if (Number.isSafeInteger(credits) && credits > 0) {
      sessionStorage.setItem(storageKey, JSON.stringify({ attemptId, pilotId, credits }));
    } else {
      sessionStorage.removeItem(storageKey);
    }
  } catch { /* The journey still opens if session storage is unavailable. */ }
}

export function takeJourneyRewardReceipt(attemptId: string, pilotId: string): number {
  try {
    const stored = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    if (!stored) return 0;
    const receipt = JSON.parse(stored) as { attemptId?: string; pilotId?: string; credits?: number };
    return receipt.attemptId === attemptId && receipt.pilotId === pilotId &&
      Number.isSafeInteger(receipt.credits) && receipt.credits! > 0 ? receipt.credits! : 0;
  } catch { return 0; }
}
