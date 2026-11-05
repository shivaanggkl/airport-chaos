import { cityRegistry } from '../../shared/city-registry.mjs';
import { createAshenPose } from './ashen-warlord-pose.js';
import { SpeciesRegistry, standardAbilities, type Species } from './titan/definitions.js';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import { ashenWarlordGeometry as geometry } from '../../shared/ashen-warlord-geometry.mjs';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { createM19Encounter, type DistrictBuilding } from './m19-titan.js';
const height = model.height;
const walkSpeed=height*model.clips.walk!.stride!/model.clips.walk!.duration*.65;
const runSpeed=height*model.clips.run!.stride!/model.clips.run!.duration*.65;
const cityHalfSize = Number(cityRegistry.dallas.worldSize) / 2;
const joints: Species['joints'] = Object.fromEntries(Object.entries(model.anchors).map(([id, p]) => [id, { bone: model.bones[id]!, position: { x: p[0]! * height, y: p[1]! * height, z: p[2]! * height }, foot: id.startsWith('foot'), gaitPhase: id.endsWith('right') ? .5 : 0, reach: 730, angularSpeed: 2.2, aimWeight: id === 'neck' ? .25 : undefined }]));
const regions = geometry.spheres.map((v, i) => { const id = `volume-${i}`; (joints as Record<string, Species['joints'][string]>)[id] = { bone: v.part.replace(/\d+$/, ''), position: { x: -v.x * height, y: v.y * height, z: -v.z * height } }; return { id, joint: id, radius: v.radius * height, radii: { x: v.radii.x * height, y: v.radii.y * height, z: v.radii.z * height }, multiplier: 1, stagger: 100 }; });
export const ashenWarlordSpecies = new SpeciesRegistry().register({
    id: 'ashen-warlord', model: model.url, lods: model.lods, scale: height, height, radius: 520, health: 2500, contactDamage: 20, joints,
    animations: ['beam', 'ranged', 'strike', 'smash', 'charge', 'roar', 'clap', 'jump'], personality: 'aggressive', level: 'HARD',
    director: {commitment:2.5,retreatMin:4000,retreatMax:7000,retreatDuration:8,reengageDuration:6,attackSpacing:.6,pressureThreshold:100,facing:.65},
    movement: { walk: walkSpeed, run: runSpeed, chargeSpeed: runSpeed*1.15, acceleration: runSpeed/3, deceleration: runSpeed/2.4, turnRate: .5, turnAcceleration: .65, stepHeight:24,stride:height*model.clips.walk!.stride!,runStride:height*model.clips.run!.stride!, jumpSpeed:120,gravity:40,sidestep:false,independentAim:true,traversalLeap:true,repositionDistance:5000,intentDuration:2.5,traversalOnlyWhenBlocked:true },
    senses: { range: 160000, fov: Math.PI * 2, pursueOccluded: true }, arena: { minWidth: 2500, maxSlope: .15 },
    regions: [{ id: 'charged-core', joint: 'gem', radius: 48, radii: { x: 48, y: 72, z: 32 }, multiplier: 2, stagger: 60, weakDuring: 'energy-beam' }, { id: 'chest-core', joint: 'gem', radius: 48, radii: { x: 48, y: 72, z: 32 }, multiplier: 1.25, stagger: 100 }, ...regions],
    abilities: standardAbilities.filter(a => ['energy-beam', 'fireball-barrage', 'hand-strike', 'ground-smash', 'charging-rampage', 'roaring-shockwave', 'two-hand-clap'].includes(a.id)).map(a => {
        const b = { ...a, maxRange: 6000, maxAltitude: 5000, unlockBelow: 1 };
        if (a.id === 'energy-beam') {
            b.requires = ['gem'];
            b.damage = 30;
            b.warning = 1.5;
            b.cooldown = 15;
            b.radius = 48;
            b.tracking = .22;
            b.windup=.9; b.active=1.5; b.recovery=1.5;
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
            b.maxRange = 160000;
            b.horizontalCone=true;
            b.maxAltitude = 40000; b.windup=.4;b.active=1;b.recovery=.8;
            b.cone = .75;
        }
        if (a.id === 'hand-strike' || a.id === 'two-hand-clap') {
            b.pivot = joints['shoulder-left']!.position;
            b.contactBounds = model.attackBounds[a.id === 'hand-strike' ? 'punch' : 'clap'];
            b.reach = 550;
            b.lift = 160;
            b.radius = 90;
            b.maxRange = 1400;
            b.cone = .75;
            b.windup=a.id==='hand-strike'?.2:.1;
            b.active=a.id==='hand-strike'?.3:.25;
            b.recovery=a.id==='hand-strike'?1.4:.55;
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
            b.radius = 700;
            b.maxRange = 4000;
            b.minRange = 800;
            b.maxAltitude = 360;
            b.cone = .75;
            b.damage = 20;
            b.warning = 1.1;
            b.windup = .3;
            b.active = 9;
            b.recovery = 1.6;
            b.cooldown = 12;
            b.moving = false;
        }
        if (a.id === 'charging-rampage') {
            b.damage = 20;
            b.warning = .9;
            b.cooldown = 10;
            b.active = 7.5;
            b.radius = 240;
            b.impactJoint = 'body';
            b.maxRange = 2200;
            b.maxAltitude = 1400;
        }
        if (a.id === 'roaring-shockwave') {
            b.damage = 15;
            b.warning = 1.2;
            b.cooldown = 11;
            b.radius = 2200;
            b.maxRange = 2200;
            b.cone = .9;
            b.directional = true; b.windup=.4;b.active=1.2;b.recovery=.825;
            b.limbTargets = Object.fromEntries(['left', 'right'].map(side => { const s = side === 'left' ? -1 : 1; return [`hand-${side}`, { warning: { x: s * 130, y: 650, z: 150 }, windup: { x: s * 180, y: 660, z: 230 }, active: { x: s * 80, y: 650, z: 125 } }]; }));
        }
        b.moving = a.mechanism==='projectile'||a.mechanism==='beam';
        return b;
    })
});
export function createAshenWarlordEncounter(id: string, playerId: string, started: number, ground: (x: number, z: number) => number, buildings: readonly DistrictBuilding[], health = 2500) {
    return createM19Encounter(id, playerId, started, ground, buildings, health, ashenWarlordSpecies, { geometry, spawn: journeyDallas19.monster, environmentDamage: true, articulate: createAshenPose(health), bounds: {minX:-cityHalfSize,maxX:cityHalfSize,minZ:-cityHalfSize,maxZ:cityHalfSize} });
}
