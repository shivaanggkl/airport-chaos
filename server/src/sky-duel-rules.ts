import { competitiveModes } from '../../shared/competitive-modes.mjs';

export function duelTimeoutWinner(scoreA: number, scoreB: number): 'WIN_A' | 'WIN_B' | 'DRAW' {
  return scoreA === scoreB ? 'DRAW' : scoreA > scoreB ? 'WIN_A' : 'WIN_B';
}

/** Evaluate only after all eligible destructions from the combat step. */
export function duelScoreWinner(scoreA: number, scoreB: number): 'WIN_A' | 'WIN_B' | 'DRAW' | undefined {
  return Math.max(scoreA, scoreB) >= competitiveModes.skyDuel.winningScore
    ? duelTimeoutWinner(scoreA, scoreB) : undefined;
}
