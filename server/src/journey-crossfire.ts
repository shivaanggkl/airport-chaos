/** Permission for new shots only; existing ballistic projectiles are untouched. */
export class CrossfireFireCoordinator {
  private shooterId: string | null = null;
  private handoffUntil = 0;

  canInitiate(hunterId: string, eligible: boolean, now: number): boolean {
    if (this.shooterId === hunterId) {
      if (eligible) return true;
      this.shooterId = null;
      this.handoffUntil = now + 900;
      return false;
    }
    if (!eligible || this.shooterId || now < this.handoffUntil) return false;
    this.shooterId = hunterId;
    return true;
  }

  revoke(hunterId: string, now: number): void {
    if (this.shooterId !== hunterId) return;
    this.shooterId = null;
    this.handoffUntil = now + 900;
  }

  get activeShooterId(): string | null { return this.shooterId; }
}
