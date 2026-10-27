const FINISH_SECONDS = 1.05;

export type CrashSurface = 'transport' | 'ground' | 'obstacle' | 'runway';

/** Keeps the result screen behind the shared, immediate aircraft blast. */
export class CrashSequence {
  private elapsed = 0;
  private blasted = false;

  constructor(readonly attemptId: string, readonly surface: CrashSurface) {}

  update(delta: number): { blast: boolean; complete: boolean; flash: number } {
    this.elapsed = Math.min(FINISH_SECONDS, this.elapsed + Math.max(0, delta));
    const blast = !this.blasted;
    if (blast) this.blasted = true;
    const flash = Math.max(0, 1 - this.elapsed / .28) * .72;
    return { blast, complete: this.elapsed >= FINISH_SECONDS, flash };
  }
}
