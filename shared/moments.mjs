const shareLead = Object.freeze({
  perfect_landing: 'I just nailed a Perfect Landing', legendary_landing: 'I just landed a Legendary Landing',
  storm_landing: 'Survived a Storm Landing', fog_landing: 'Landed safely through fog',
  chaos_event_complete: 'Completed a Chaos Event', secret_discovery: 'Found a hidden signal',
  combat_kill: 'Won a dogfight', near_miss: 'Survived a wild near miss', crash: 'Had a spectacular crash',
  low_altitude_run: 'Completed a low-altitude run', new_record: 'Set a new flight record',
  level_up: 'Reached a new Pilot Level', weekly_reward: 'Earned a weekly flight reward',
});

export function momentShareText(type, statLine = '') {
  const stat = statLine ? ` ${statLine}` : '';
  return `${shareLead[type]} in Airport Chaos.${stat} Try it: fly.vadensoftware.com`;
}

export class MomentStore {
  #moments = [];
  constructor(limit = 8, duplicateCooldownMs = 8_000) { this.limit = limit; this.duplicateCooldownMs = duplicateCooldownMs; }
  add(input) {
    const timestamp = input.timestamp ?? Date.now();
    const duplicate = this.#moments.find((moment) => moment.type === input.type && moment.sourceEventId === input.sourceEventId && timestamp - moment.timestamp < this.duplicateCooldownMs);
    if (duplicate) return undefined;
    const moment = { ...input, id:`${input.type}-${timestamp}-${Math.random().toString(36).slice(2,7)}`, timestamp, shareText:input.shareText ?? momentShareText(input.type,input.statLine) };
    this.#moments.unshift(moment); this.#moments.length = Math.min(this.#moments.length, this.limit); return moment;
  }
  latestSince(timestamp) { return this.#moments.find((moment) => moment.timestamp >= timestamp); }
  list() { return this.#moments; }
}
