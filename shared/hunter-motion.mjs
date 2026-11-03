const axes = ['x', 'y', 'z'];
/** A small delayed snapshot buffer for authoritative Hunter flight, not client simulation. */
export class HunterMotionBuffer {
  snapshots = [];
  offset = null;
  result = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
  push(position, rotation, velocity, serverNow, receivedAt) {
    if (![serverNow, receivedAt, ...Object.values(position), ...Object.values(rotation), ...Object.values(velocity)].every(Number.isFinite)) return;
    if (this.snapshots.length && serverNow <= this.snapshots.at(-1).time) return;
    this.offset ??= serverNow - receivedAt;
    this.snapshots.push({ position: { ...position }, rotation: { ...rotation }, velocity: { ...velocity }, time: serverNow });
    if (this.snapshots.length > 5) this.snapshots.shift();
  }
  sample(now) {
    if (!this.snapshots.length) return null;
    const time = now + this.offset - 250;
    let a = this.snapshots[0], b = a;
    for (let i = 1; i < this.snapshots.length; i++) {
      b = this.snapshots[i];
      if (b.time >= time) break;
      a = b;
    }
    const span = (b.time - a.time) / 1000;
    const t = span > 0 ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 0;
    for (const axis of axes) {
      // Hermite tangents keep speed continuous across the 5 Hz snapshot joins.
      this.result.position[axis] = (2*t*t*t-3*t*t+1)*a.position[axis] + (t*t*t-2*t*t+t)*span*a.velocity[axis]
        + (-2*t*t*t+3*t*t)*b.position[axis] + (t*t*t-t*t)*span*b.velocity[axis];
      const delta = Math.atan2(Math.sin(b.rotation[axis] - a.rotation[axis]), Math.cos(b.rotation[axis] - a.rotation[axis]));
      this.result.rotation[axis] = a.rotation[axis] + delta * t;
      if (time > b.time) this.result.position[axis] = b.position[axis] + b.velocity[axis] * Math.min(.15, (time - b.time) / 1000);
    }
    return this.result;
  }
}
