type V = { x: number; y: number; z: number };
export class HunterMotionBuffer {
  push(position: V, rotation: V, velocity: V, serverNow: number, receivedAt: number): void;
  sample(now: number): { position: V; rotation: V } | null;
}
