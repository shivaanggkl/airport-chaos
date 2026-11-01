import * as THREE from 'three';
import { airAssaultAirports, type AssaultSnapshot, type AssaultEnemy } from '../../shared/air-assault.mjs';
import './air-assault.css';
type Options = {
  root: HTMLElement;
  scene: THREE.Scene;
  template: () => THREE.Group;
  send: (type: string) => void;
  back: () => void;
  tone: () => void;
};
export class AirAssaultUi {
  state?: AssaultSnapshot;
  private panel = document.createElement('aside');
  private overlay = document.createElement('section');
  private title = document.createElement('h2');
  private detail = document.createElement('p');
  private skip = document.createElement('button');
  private results = document.createElement('div');
  private clock = document.createElement('strong');
  private tally = document.createElement('span');
  private hull = document.createElement('span');
  private warning = document.createElement('span');
  private staging = new THREE.Group();
  private queued = new Map<string, THREE.Group>();
  private roster: AssaultEnemy[] = [];
  private template?: THREE.Group;
  private readyId?: string;
  private loadingId?: string;
  private readyStartedAt = 0;
  private offset = 0;
  private goUntil = 0;
  private lastCountdown = '';
  private disposed = false;
  constructor(private options: Options) {
    this.panel.className = 'air-assault-hud';
    this.panel.setAttribute('role', 'status');
    this.panel.append(this.clock, this.tally, this.hull, this.warning);
    this.overlay.className = 'air-assault-overlay';
    this.overlay.setAttribute('aria-label', 'Air Assault');
    this.title.textContent = 'AIR ASSAULT';
    this.detail.textContent = '30 ENEMY AIRCRAFT · DESTROY ALL OR SURVIVE 8:00';
    this.skip.type = 'button';
    this.skip.textContent = 'SKIP';
    this.skip.hidden = true;
    this.skip.className = 'context-action context-action--gold';
    this.skip.addEventListener('click', () => options.send('airAssaultSkip'));
    this.results.className = 'air-assault-results';
    this.results.hidden = true;
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.textContent = 'REPLAY';
    replay.className = 'context-action context-action--gold';
    replay.addEventListener('click', () => window.location.reload());
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'BACK';
    back.className = 'context-action context-action--blue';
    back.addEventListener('click', () => { options.send('airAssaultExit'); options.back(); });
    this.results.append(replay, back);
    this.overlay.append(this.title, this.detail, this.skip, this.results);
    options.root.append(this.panel, this.overlay);
    options.scene.add(this.staging);
  }
  blocked(): boolean { return !this.state || this.state.phase === 'intro' || this.state.phase === 'countdown' || this.state.phase === 'finished'; }
  handle(state: AssaultSnapshot): void {
    if (this.disposed)
      return;
    if (this.state?.phase === 'countdown' && state.phase === 'takeoff') {
      this.goUntil = performance.now() + 650;
      this.title.textContent = 'GO';
      this.detail.textContent = 'TAKE OFF';
      this.options.tone();
    }
    if (state.enemies.length === 30)
      this.roster = state.enemies;
    this.state = state;
    this.offset = state.serverNow - Date.now();
    if (state.phase === 'intro' && this.readyId !== state.id && this.loadingId !== state.id) {
      this.loadingId = state.id;
      this.template ??= this.options.template();
      Promise.resolve(this.template.userData.assetReady).then(() => {
        if (this.disposed || this.state?.id !== state.id || this.state.phase !== 'intro')
          return;
        const runtime = this.template!.userData;
        this.template!.userData = {};
        for (const enemy of this.roster) {
          const plane = this.template!.clone(true);
          plane.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
          plane.rotation.set(0, enemy.rotation.y, 0, 'YXZ');
          this.staging.add(plane);
          this.queued.set(enemy.id, plane);
        }
        this.template!.userData = runtime;
        this.readyId = state.id;
        this.readyStartedAt = performance.now();
        this.options.send('airAssaultReady');
      });
    }
    for (const id of state.destroyedIds) {
      this.queued.get(id)?.removeFromParent();
      this.queued.delete(id);
    }
    for (const enemy of state.enemies)
      if (enemy.phase !== 'queued') {
        const plane = this.queued.get(enemy.id);
        if (plane) {
          plane.removeFromParent();
          this.queued.delete(enemy.id);
        }
      }
    this.overlay.hidden = state.phase === 'takeoff' && performance.now() >= this.goUntil || state.phase === 'active';
    this.panel.hidden = state.phase === 'intro' || state.phase === 'countdown' || state.phase === 'finished';
    if (state.phase === 'finished') {
      this.staging.clear();
      this.queued.clear();
      this.skip.hidden = true;
      this.results.hidden = false;
      this.title.textContent = state.result === 'full' ? '30 ENEMIES DESTROYED' : state.result === 'survival' ? 'YOU SURVIVED' : state.result === 'boundary' ? 'COMBAT AREA LEFT' : state.result === 'grounded' ? 'SURVIVAL REQUIRES FLIGHT' : state.result === 'disconnected' ? 'CONNECTION LOST' : state.result === 'exit' ? 'BATTLE ENDED' : 'AIRCRAFT DESTROYED';
      const elapsed = state.startedAt === null ? 0 : Math.min(480, Math.floor((state.phaseAt - state.startedAt) / 1000));
      this.detail.textContent = `${state.destroyed}/30 DESTROYED · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} · ${state.reward} CREDITS${state.dailyClaimed ? ' · TODAY’S VICTORY REWARD ALREADY CLAIMED' : ''}`;
    }
  }
  update(camera: THREE.PerspectiveCamera, player: THREE.Group): void {
    const s = this.state;
    if (!s)
      return;
    const now = Date.now() + this.offset;
    if (s.phase === 'intro') {
      this.skip.hidden = this.readyId !== s.id || now - s.phaseAt < 1000;
      if (this.readyId !== s.id)
        return;
      const t = Math.min(15, (performance.now() - this.readyStartedAt) / 1000);
      const dfw = player.position;
      let focus = new THREE.Vector3().copy(dfw), from = new THREE.Vector3(), to = new THREE.Vector3(), u = 0;
      if (t < 2) {
        from.copy(dfw).add(new THREE.Vector3(500, 400, 700));
        to.copy(dfw).add(new THREE.Vector3(130, 65, 230));
        u = t / 2;
      }
      else if (t < 11) {
        const i = Math.min(2, Math.floor((t - 2) / 3)), airport = airAssaultAirports[i]!;
        const first = this.roster.find(e => e.airportId === airport.id)!;
        focus.set(airport.x, first.position.y + 8, first.position.z + 292);
        from.copy(focus).add(new THREE.Vector3(420, 110, 420));
        to.copy(focus).add(new THREE.Vector3(-200, 50, -220));
        u = ((t - 2) % 3) / 3;
      }
      else if (t < 13) {
        const first = this.roster[Math.min(29, Math.floor((t - 11) * 2) * 7)]!;
        focus.set(first.position.x, first.position.y + 5, first.position.z);
        from.copy(focus).add(new THREE.Vector3(30, 9, -80));
        to.copy(focus).add(new THREE.Vector3(65, 15, -35));
        u = ((t - 11) * 2) % 1;
      }
      else {
        from.copy(dfw).add(new THREE.Vector3(200, 90, 300));
        to.copy(dfw).add(new THREE.Vector3(0, 20, 85));
        focus.copy(dfw).add(new THREE.Vector3(0, 4, -40));
        u = (t - 13) / 2;
      }
      u = u * u * (3 - 2 * u);
      camera.position.lerpVectors(from, to, u);
      camera.lookAt(focus);
    }
    else if (s.phase === 'countdown') {
      this.skip.hidden = true;
      const count = String(Math.max(1, 3 - Math.floor((now - s.phaseAt) / 1000)));
      this.title.textContent = count;
      this.detail.textContent = 'GET READY';
      if (count !== this.lastCountdown) {
        this.lastCountdown = count;
        this.options.tone();
      }
    }
    else if (s.phase !== 'finished') {
      if (s.phase === 'takeoff')
        this.overlay.hidden = performance.now() >= this.goUntil;
      const seconds = s.deadlineAt === null ? 480 : Math.max(0, Math.ceil((s.deadlineAt - now) / 1000));
      this.clock.textContent = s.phase === 'takeoff' ? 'TAKE OFF' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      this.tally.textContent = `DESTROYED ${s.destroyed}/30`;
      this.hull.textContent = `HEALTH ${Math.ceil(s.health)}/${s.maxHealth}`;
      const legendary = s.enemies.some(e => e.tier === 'legendary' && e.phase === 'combat');
      this.warning.textContent = s.outsideAt !== null ? `RETURN TO COMBAT · ${Math.max(0, 10 - Math.floor((now - s.outsideAt) / 1000))}s` : legendary ? '★ LEGENDARY INBOUND' : s.enemies.some(e => e.phase === 'takeoff') ? 'ENEMY DEPARTING' : '';
    }
  }
  activeEnemies(): AssaultEnemy[] { return this.state?.phase === 'active' ? this.state.enemies.filter(e => e.phase === 'combat' || e.phase === 'takeoff') : []; }
  dispose(): void { this.disposed = true; this.staging.clear(); this.staging.removeFromParent(); this.queued.clear(); this.panel.remove(); this.overlay.remove(); }
}
