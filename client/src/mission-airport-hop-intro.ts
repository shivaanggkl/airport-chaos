import * as THREE from 'three';

type IntroAirport = Readonly<{ id: string; name: string; x: number; z: number }>;

/** A presentation of the real airports only; never moves aircraft or mission state. */
export class AirportHopIntro {
  readonly focus: THREE.Vector3;
  private readonly radius: number;
  private readonly points: THREE.Vector3[];
  private readonly projected = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly overlay: HTMLDivElement;
  private readonly labels: HTMLDivElement[] = [];
  private readonly legs: SVGLineElement[] = [];

  constructor(airports: readonly IntroAirport[], heightAt: (x: number, z: number) => number, host: HTMLElement) {
    this.points = ['dfw', 'love', 'addison'].map(id => {
      const airport = airports.find(item => item.id === id)!;
      return new THREE.Vector3(airport.x, heightAt(airport.x, airport.z) + 40, airport.z);
    });
    const bounds = new THREE.Box3().setFromPoints(this.points);
    this.focus = bounds.getCenter(new THREE.Vector3());
    this.radius = Math.max(...this.points.map(point => point.distanceTo(this.focus)));
    this.overlay = document.createElement('div');
    this.overlay.className = 'airport-hop-route';
    this.overlay.setAttribute('aria-label', 'Airport Hop route: take off, land and take off again, then land to finish.');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<defs><marker id="airport-hop-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#ffe49a"/></marker></defs>';
    for (let index = 0; index < 2; index++) {
      const leg = document.createElementNS(ns, 'line');
      leg.setAttribute('marker-end', 'url(#airport-hop-arrow)');
      svg.append(leg); this.legs.push(leg);
    }
    this.overlay.append(svg);
    const actions = ['TAKE OFF', 'LAND · TAKE OFF AGAIN', 'LAND · FINISH'];
    for (const [index, id] of ['dfw', 'love', 'addison'].entries()) {
      const label = document.createElement('div'); label.className = 'airport-hop-stop';
      const number = document.createElement('b'); number.className = 'airport-hop-number'; number.textContent = String(index + 1);
      const name = document.createElement('strong'); name.textContent = airports.find(item => item.id === id)!.name;
      const action = document.createElement('span'); action.textContent = actions[index];
      label.append(number, name, action); this.overlay.append(label); this.labels.push(label);
    }
    host.append(this.overlay);
  }

  sample(elapsed: number, position: THREE.Vector3, target: THREE.Vector3,
    chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3, aspect: number, handoff: number): void {
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) * Math.min(1, Math.max(.3, aspect)));
    const distance = this.radius / Math.sin(halfFov) * 1.65;
    const angle = THREE.MathUtils.lerp(-.3, .15, THREE.MathUtils.clamp(elapsed / 10_500, 0, 1));
    position.set(this.focus.x + Math.sin(angle) * distance * .4,
      this.focus.y + distance * Math.sqrt(1 - .4 ** 2), this.focus.z + Math.cos(angle) * distance * .4);
    target.copy(this.focus);
    position.lerp(chasePosition, handoff); target.lerp(chaseTarget, handoff);
  }

  update(camera: THREE.PerspectiveCamera, handoff: number): void {
    camera.updateMatrixWorld();
    this.overlay.style.opacity = String(1 - handoff);
    for (let index = 0; index < 3; index++) {
      const projected = this.projected[index].copy(this.points[index]).project(camera);
      this.labels[index].style.left = `${(projected.x + 1) * 50}%`;
      this.labels[index].style.top = `${(1 - projected.y) * 50}%`;
    }
    for (let index = 0; index < 2; index++) {
      const from = this.projected[index], to = this.projected[index + 1];
      // Leave space around the numbered pins so arrows remain readable.
      const dx = to.x - from.x, dy = to.y - from.y;
      const inset = Math.min(.15, .07 / Math.max(.01, Math.hypot(dx, dy)));
      const leg = this.legs[index];
      leg.setAttribute('x1', String((from.x + dx * inset + 1) * 500));
      leg.setAttribute('y1', String((1 - from.y - dy * inset) * 500));
      leg.setAttribute('x2', String((to.x - dx * inset + 1) * 500));
      leg.setAttribute('y2', String((1 - to.y + dy * inset) * 500));
    }
  }

  dispose(): void { this.overlay.remove(); }
}
