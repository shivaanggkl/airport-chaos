/** The connection map and its indexes share the same authorized socket objects. */
export class PlayerSockets<S> extends Map<S, string> {
  private readonly byPlayer = new Map<string, S>();
  private readonly byCity = new Map<string, Map<S, string>>();
  private readonly cityByPlayer = new Map<string, string>();

  constructor(private readonly cityOf: (playerId: string) => string | undefined) { super(); }

  override set(socket: S, playerId: string): this {
    this.delete(socket);
    const previous = this.byPlayer.get(playerId);
    if (previous !== undefined) this.delete(previous);
    super.set(socket, playerId);
    this.byPlayer.set(playerId, socket);
    this.refreshCity(playerId);
    return this;
  }

  override delete(socket: S): boolean {
    const playerId = super.get(socket);
    if (playerId === undefined || !super.delete(socket)) return false;
    if (this.byPlayer.get(playerId) === socket) this.byPlayer.delete(playerId);
    const city = this.cityByPlayer.get(playerId);
    const members = city === undefined ? undefined : this.byCity.get(city);
    members?.delete(socket);
    if (city !== undefined && members?.size === 0) this.byCity.delete(city);
    this.cityByPlayer.delete(playerId);
    return true;
  }

  override clear(): void {
    super.clear(); this.byPlayer.clear(); this.byCity.clear(); this.cityByPlayer.clear();
  }

  socketFor(playerId: string): S | undefined { return this.byPlayer.get(playerId); }
  inCity(city: string): Iterable<readonly [S, string]> { return this.byCity.get(city) ?? []; }

  refreshCity(playerId: string): void {
    const socket = this.byPlayer.get(playerId);
    if (socket === undefined) return;
    const previous = this.cityByPlayer.get(playerId);
    const city = this.cityOf(playerId);
    if (previous === city) return;
    if (previous !== undefined) {
      const members = this.byCity.get(previous);
      members?.delete(socket);
      if (members?.size === 0) this.byCity.delete(previous);
      this.cityByPlayer.delete(playerId);
    }
    if (city !== undefined) {
      let members = this.byCity.get(city);
      if (!members) { members = new Map(); this.byCity.set(city, members); }
      members.set(socket, playerId);
      this.cityByPlayer.set(playerId, city);
    }
  }
}
