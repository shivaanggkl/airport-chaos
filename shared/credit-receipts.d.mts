export type CreditReceipt = Readonly<{ rewardId: string; delta: number; newBalance: number; source: string }>;
export function creditReceipt(previousBalance: number, newBalance: number, rewardId: string, source: string): CreditReceipt | undefined;
export function reconcileCreditSnapshot(currentBalance: number, currentRevision: number, newBalance: number, newRevision: number,
  receipt: CreditReceipt | undefined, seenRewardIds: ReadonlySet<string>): { accepted: boolean; toastDelta: number; rewardId?: string };
