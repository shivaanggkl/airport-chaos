import { SpeciesRegistry, standardAbilities, type Species } from './titan/definitions.js';
import { armoredApexModel as model } from '../../shared/armored-apex-model.mjs';
import { armoredApexGeometry as geometry } from '../../shared/armored-apex-geometry.mjs';
import { journeyDallas20 } from '../../shared/journey-mission.mjs';
import { createM19Encounter, type DistrictBuilding } from './m19-titan.js';
const height = 960;
const joints: Species['joints'] = Object.fromEntries(Object.entries(model.anchors).map(([id, p]) => [id, { bone: model.bones[id], position: { x: p[0] * height, y: p[1] * height, z: p[2] * height }, foot: id.startsWith('foot'), gaitPhase: id.endsWith('right') ? .5 : 0, reach: 345, angularSpeed: 2.2, aimWeight: id === 'neck' ? .35 : undefined }]));
const regions = geometry.spheres.map((v, i) => { const key = `volume-${i}`; (joints as Record<string, Species['joints'][string]>)[key] = { bone: v.part.replace(/\d+$/, ''), position: { x: -v.x * height, y: v.y * height, z: -v.z * height } }; return { id: key, joint: key, radius: v.radius * height, radii: { x: v.radii.x * height, y: v.radii.y * height, z: v.radii.z * height }, multiplier: 1, stagger: 85 }; });
export const apexSpecies = new SpeciesRegistry().register({ id: 'armored-apex', model: model.url, lods: model.lods, scale: height, height, radius: 420, health: 3000, contactDamage: 20, joints,
    animations: ['strike', 'smash', 'charge', 'roar'], level: 'HARD', personality: 'aggressive',
    movement: { walk: 65, run: 105, chargeSpeed: 135, acceleration: 20, deceleration: 32, turnRate: .40, turnAcceleration: .3, stepHeight: 24, stride: 220, reverseStride: 45, lateralStride: 55, turnStrideRadius: 1050, jumpSpeed: 0, gravity: 40, sidestep: true, independentAim: true },
    senses: { range: 9000, fov: Math.PI * 2 }, arena: { minWidth: 2500, maxSlope: .15 },
    regions: [...regions, { id: 'chest-gem', joint: 'gem', radius: 31, radii: { x: 31, y: 40, z: 15 }, multiplier: 1.5, stagger: 60 }],
    abilities: standardAbilities.filter(a => ['hand-strike', 'ground-smash', 'charging-rampage', 'roaring-shockwave'].includes(a.id)).map(a => {
        const b = { ...a, interruptible: false, maxRange: 1600, maxAltitude: 1400 };
        if (a.id === 'hand-strike') {
            b.pivot = joints['shoulder-left'].position;
            b.reach = 310;
            b.lift = 190;
            b.radius = 70;
            b.maxRange = 850;
            b.cone = Math.PI;
            b.warning = .9;
            b.active = 1.2;
            b.cooldown = 3.5;
            b.damage = 25;
        }
        if (a.id === 'ground-smash') {
            b.requires = ['hand-left', 'hand-right'];
            b.impactJoint = 'hand-left';
            b.cone = Math.PI;
            b.maxRange = 900;
            b.maxAltitude = 180;
            b.radius = 450;
            b.warning = 1.2;
            b.cooldown = 8;
            b.damage = 25;
            b.crouch = 290;
            b.limbTargets = Object.fromEntries(['left', 'right'].map((side) => { const sign = side === 'left' ? -1 : 1, rest = joints[`hand-${side}`].position; return [`hand-${side}`, { warning: { x: sign * 220, y: 790, z: 90 }, windup: { x: sign * 230, y: 400, z: 200 }, active: { x: sign * 230, y: 400, z: 200 } }]; }));
        }
        if (a.id === 'charging-rampage') {
            b.maxRange = 900;
            b.maxAltitude = 550;
            b.radius = 270;
            b.warning = 1;
            b.cooldown = 9;
            b.active = 6;
            b.damage = 20;
        }
        if (a.id === 'roaring-shockwave') {
            b.directional = false;
            b.maxRange = 1400;
            b.radius = 1250;
            b.warning = 1.3;
            b.cooldown = 8;
            b.damage = 20;
        }
        return b;
    }) });
export function createApexEncounter(id: string, playerId: string, started: number, ground: (x: number, z: number) => number, buildings: readonly DistrictBuilding[], health = 3000) {
    return createM19Encounter(id, playerId, started, ground, buildings, health, apexSpecies, { geometry, spawn: journeyDallas20.monster, environmentDamage: false });
}
