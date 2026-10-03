export function creditReceipt(previousBalance, newBalance, rewardId, source) {
  if (!Number.isSafeInteger(previousBalance) || !Number.isSafeInteger(newBalance) || newBalance <= previousBalance) return undefined;
  return { rewardId, delta: newBalance - previousBalance, newBalance, source };
}

export function reconcileCreditSnapshot(currentBalance, currentRevision, newBalance, newRevision, receipt, seenRewardIds) {
  if (!Number.isSafeInteger(newBalance) || newBalance < 0 || !Number.isSafeInteger(newRevision) || newRevision < 0 ||
      newRevision < currentRevision || (newRevision === currentRevision && newBalance !== currentBalance)) {
    return { accepted: false, toastDelta: 0 };
  }
  const delta = newBalance - currentBalance;
  const validReceipt = newRevision > currentRevision && delta > 0 && receipt &&
    typeof receipt.rewardId === 'string' && receipt.rewardId.length > 0 && receipt.rewardId.length <= 100 &&
    receipt.newBalance === newBalance && receipt.delta === delta && !seenRewardIds.has(receipt.rewardId);
  return { accepted: true, toastDelta: validReceipt ? delta : 0, rewardId: validReceipt ? receipt.rewardId : undefined };
}
