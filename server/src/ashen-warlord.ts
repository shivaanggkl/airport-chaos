import { createAshenPose } from './ashen-warlord-pose.js';
import { SpeciesRegistry, standardAbilities, type Species } from './titan/definitions.js';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import { ashenWarlordGeometry as geometry } from '../../shared/ashen-warlord-geometry.mjs';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { createM19Encounter, type DistrictBuilding } from './m19-titan.js';
const height = 960;
const joints: Species['joints'] = Object.fromEntries(Object.entries(model.anchors).map(([id, p]) => [id, { bone: model.bones[id]!, position: { x: p[0]! * height, y: p[1]! * height, z: p[2]! * height }, foot: id.startsWith('foot'), gaitPhase: id.endsWith('right') ? .5 : 0, reach: 365, angularSpeed: 2.2, aimWeight: id === 'neck' ? .25 : undefined }]));
const regions = geometry.spheres.map((v, i) => { const id = `volume-${i}`; (joints as Record<string, Species['joints'][string]>)[id] = { bone: v.part.replace(/\d+$/, ''), position: { x: -v.x * height, y: v.y * height, z: -v.z * height } }; return { id, joint: id, radius: v.radius * height, radii: { x: v.radii.x * height, y: v.radii.y * height, z: v.radii.z * height }, multiplier: 1, stagger: 100 }; });
export const ashenWarlordSpecies = new SpeciesRegistry().register({
    id: 'ashen-warlord', model: model.url, lods: model.lods, scale: height, height, radius: 260, health: 2500, contactDamage: 20, joints,
    animations: ['beam', 'ranged', 'strike', 'smash', 'charge', 'roar', 'clap', 'jump'], personality: 'aggressive', level: 'HARD',
    movement: { walk: 55, run: 100, chargeSpeed: 135, acceleration: 20, deceleration: 32, turnRate: .38, turnAcceleration: .3, stepHeight: 24, stride: 145, reverseStride: 35, lateralStride: 40, turnStrideRadius: 850, jumpSpeed: 120, gravity: 40, sidestep: true, independentAim: true, traversalLeap: true },
    senses: { range: 9000, fov: Math.PI * 2 }, arena: { minWidth: 2500, maxSlope: .15 },
    regions: [{ id: 'charged-core', joint: 'gem', radius: 24, radii: { x: 24, y: 36, z: 16 }, multiplier: 2, stagger: 60, weakDuring: 'energy-beam' }, { id: 'chest-core', joint: 'gem', radius: 24, radii: { x: 24, y: 36, z: 16 }, multiplier: 1.25, stagger: 100 }, ...regions],
    abilities: standardAbilities.filter(a => ['energy-beam', 'fireball-barrage', 'hand-strike', 'ground-smash', 'charging-rampage', 'roaring-shockwave', 'two-hand-clap'].includes(a.id)).map(a => {
        const b = { ...a, maxRange: 6000, maxAltitude: 5000, unlockBelow: 1 };
        if (a.id === 'energy-beam') {
            b.requires = ['gem'];
            b.damage = 30;
            b.warning = 1.5;
            b.cooldown = 15;
            b.radius = 24;
            b.tracking = .22;
            b.active = 1.5;
            b.unlockBelow = .65;
        }
        if (a.id === 'fireball-barrage') {
            b.requires = ['gem'];
            b.count = 3;
            b.damage = 20;
            b.warning = .9;
            b.cooldown = 4.5;
            b.radius = 20;
            b.projectileSpeed = 1600;
        }
        if (a.id === 'hand-strike' || a.id === 'two-hand-clap') {
            b.pivot = joints['shoulder-left']!.position;
            b.contactBounds = model.attackBounds[a.id === 'hand-strike' ? 'punch' : 'clap'];
            b.reach = 275;
            b.lift = 80;
            b.radius = 45;
            b.maxRange = 700;
            b.cone = Math.PI;
            b.active = 1.1;
            b.damage = a.id === 'hand-strike' ? 25 : 30;
            b.warning = a.id === 'hand-strike' ? .75 : 1;
            b.cooldown = a.id === 'hand-strike' ? 3.5 : 7;
            b.arcStart = a.id === 'two-hand-clap' ? -.4 : -.9;
            b.arcEnd = a.id === 'two-hand-clap' ? .55 : .6;
            if (a.id === 'two-hand-clap')
                b.unlockBelow = .3;
        }
        if (a.id === 'ground-smash') {
            b.mechanism = 'leap';
            b.animation = 'jump';
            b.requires = ['foot-left', 'foot-right'];
            b.radius = 350;
            b.maxRange = 400;
            b.maxAltitude = 180;
            b.cone = Math.PI;
            b.damage = 20;
            b.warning = 1.1;
            b.windup = .3;
            b.active = 6.4;
            b.recovery = 1.3;
            b.cooldown = 12;
            b.moving = false;
        }
        if (a.id === 'charging-rampage') {
            b.damage = 20;
            b.warning = .9;
            b.cooldown = 10;
            b.active = 7.5;
            b.radius = 120;
            b.impactJoint = 'body';
            b.maxRange = 1100;
            b.maxAltitude = 700;
        }
        if (a.id === 'roaring-shockwave') {
            b.damage = 15;
            b.warning = 1.2;
            b.cooldown = 11;
            b.radius = 1100;
            b.maxRange = 1100;
            b.cone = .9;
            b.directional = true;
            b.limbTargets = Object.fromEntries(['left', 'right'].map(side => { const s = side === 'left' ? -1 : 1; return [`hand-${side}`, { warning: { x: s * 130, y: 650, z: 150 }, windup: { x: s * 180, y: 660, z: 230 }, active: { x: s * 80, y: 650, z: 125 } }]; }));
        }
        return b;
    })
});
export function createAshenWarlordEncounter(id: string, playerId: string, started: number, ground: (x: number, z: number) => number, buildings: readonly DistrictBuilding[], health = 2500) {
    return createM19Encounter(id, playerId, started, ground, buildings, health, ashenWarlordSpecies, { geometry, spawn: journeyDallas19.monster, environmentDamage: true, articulate: createAshenPose(health) });
}
