/** Permission for new shots only; existing ballistic projectiles are untouched. */
export class CrossfireFireCoordinator {
  private shooterId: string | null = null;
  private handoffUntil = 0;
  private selectedAt=0;

  /** Rank actual firing geometry; retain a useful pass instead of alternating on a clock. */
  select(candidates:readonly {id:string;score:number}[],now:number):void {
    let best:typeof candidates[number]|undefined;
    for(const candidate of candidates)if(!best||candidate.score>best.score)best=candidate;
    const current=candidates.find(c=>c.id===this.shooterId);
    if(current&&(!best||best.id===current.id||now-this.selectedAt<750||best.score<current.score+.35))return;
    if(this.shooterId){this.revoke(this.shooterId,now);return;}
    if(best&&now>=this.handoffUntil){this.shooterId=best.id;this.selectedAt=now;}
  }

  canInitiate(hunterId: string, eligible: boolean, now: number): boolean {
    // Priority includes lining up a pass. Losing a shot momentarily must not
    // send both aircraft back into supporting positions.
    if (this.shooterId === hunterId) return eligible;
    if (!eligible || this.shooterId || now < this.handoffUntil) return false;
    this.shooterId = hunterId;
    this.selectedAt=now;
    return true;
  }

  revoke(hunterId: string, now: number): void {
    if (this.shooterId !== hunterId) return;
    this.shooterId = null;
    this.handoffUntil = now + 900;
  }

  get activeShooterId(): string | null { return this.shooterId; }
}
