import { competitiveModes } from '../../shared/competitive-modes.mjs';

export function duelTakedownWinner(scoreA: number, scoreB: number, overtime: boolean): 'WIN_A' | 'WIN_B' | undefined {
  if (overtime || scoreA >= competitiveModes.skyDuel.takedownsToWin || scoreB >= competitiveModes.skyDuel.takedownsToWin)
    return scoreA > scoreB ? 'WIN_A' : 'WIN_B';
  return undefined;
}

export function duelTimeoutWinner(scoreA: number, scoreB: number): 'WIN_A' | 'WIN_B' | undefined {
  return scoreA === scoreB ? undefined : scoreA > scoreB ? 'WIN_A' : 'WIN_B';
}
