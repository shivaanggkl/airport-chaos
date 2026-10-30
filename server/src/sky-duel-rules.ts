export function duelTimeoutWinner(scoreA: number, scoreB: number): 'WIN_A' | 'WIN_B' | 'DRAW' {
  return scoreA === scoreB ? 'DRAW' : scoreA > scoreB ? 'WIN_A' : 'WIN_B';
}
