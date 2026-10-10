type Position = Readonly<{ x: number; y: number; z: number }>;
type Sample = { at: number; position: Position };

/** Measures sustained displacement using accepted server-timed transforms only. */
export class SpeedGateTracker {
  private readonly tracks = new Map<string, { attemptId: string; samples: Sample[] }>();

  record(playerId: string, attemptId: string, position: Position, at: number): number | null {
    let track = this.tracks.get(playerId);
    if (!track || track.attemptId !== attemptId || at <= (track.samples.at(-1)?.at ?? -Infinity) ||
      at - (track.samples.at(-1)?.at ?? at) > 1_000) {
      track = { attemptId, samples: [] };
      this.tracks.set(playerId, track);
    }
    track.samples.push({ at, position });
    while (track.samples.length > 1 && at - track.samples[0]!.at > 800) track.samples.shift();
    const baseline = track.samples.find(sample => at - sample.at >= 300);
    if (!baseline) return null;
    const elapsed = (at - baseline.at) / 1_000;
    return Math.hypot(position.x - baseline.position.x, position.y - baseline.position.y,
      position.z - baseline.position.z) / elapsed;
  }

  clear(playerId: string): void { this.tracks.delete(playerId); }
}
