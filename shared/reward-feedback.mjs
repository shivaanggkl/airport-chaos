export function formatRewardFeedback(credits, score) {
  const safeCredits = Number.isFinite(credits) ? Math.max(0, Math.round(credits)) : 0;
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0;
  const parts = [];
  if (safeCredits > 0) parts.push(`+${safeCredits.toLocaleString()} Credits`);
  if (safeScore > 0) parts.push(`+${safeScore.toLocaleString()} Score`);
  return parts.join(' • ');
}
