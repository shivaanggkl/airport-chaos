export const referralAirborneRequirementMs = 60_000;

/** Tracks one continuous, server-accepted airborne flight without database writes. */
export class ReferralFlightTracker {
  private readonly flights = new Map<string, number>();

  begin(connectionId: string): void { this.flights.set(connectionId, 0); }
  reset(connectionId: string): void { this.flights.delete(connectionId); }
  has(connectionId: string): boolean { return this.flights.has(connectionId); }

  advance(connectionId: string, acceptedElapsedMs: number): boolean {
    const elapsed = this.flights.get(connectionId);
    if (elapsed === undefined || !Number.isFinite(acceptedElapsedMs) || acceptedElapsedMs <= 0) return false;
    // A long gap between validated packets is not proof of continuous flight.
    const next = Math.min(referralAirborneRequirementMs, elapsed + Math.min(2_000, acceptedElapsedMs));
    this.flights.set(connectionId, next);
    return next >= referralAirborneRequirementMs;
  }
}
