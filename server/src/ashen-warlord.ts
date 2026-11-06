import {indexBuildingsForOcclusion} from './monster-arrival.js';
import {cityAirports} from '../../shared/city-airports.mjs';
import { cityRegistry } from '../../shared/city-registry.mjs';
import { createAshenPose } from './ashen-warlord-pose.js';
import { SpeciesRegistry, standardAbilities, type Species } from './titan/definitions.js';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import { ashenWarlordGeometry as geometry } from '../../shared/ashen-warlord-geometry.mjs';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { createM19Encounter, type DistrictBuilding } from './m19-titan.js';
const height = model.height;
const runSpeed=height*model.clips.run!.stride!/model.clips.run!.duration*.65;
const runwayCombatBuildingsCache=new WeakMap<readonly DistrictBuilding[],readonly DistrictBuilding[]>();
const cityHalfSize = Number(cityRegistry.dallas.worldSize) / 2;
const joints: Species['joints'] = Object.fromEntries(Object.entries(model.anchors).map(([id, p]) => [id, { bone: model.bones[id]!, position: { x: p[0]! * height, y: p[1]! * height, z: p[2]! * height }, foot: id.startsWith('foot'), gaitPhase: id.endsWith('right') ? .5 : 0, reach: 730, angularSpeed: 2.2, aimWeight: id === 'neck' ? .25 : undefined }]));
const regions = geometry.spheres.map((v, i) => { const id = `volume-${i}`; (joints as Record<string, Species['joints'][string]>)[id] = { bone: v.part.replace(/\d+$/, ''), position: { x: -v.x * height, y: v.y * height, z: -v.z * height } }; return { id, joint: id, radius: v.radius * height, radii: { x: v.radii.x * height, y: v.radii.y * height, z: v.radii.z * height }, multiplier: 1, stagger: 100 }; });
export const ashenWarlordSpecies = new SpeciesRegistry().register({
    id: 'ashen-warlord', model: model.url, lods: model.lods, scale: height, height, radius: 520, health: 2500, contactDamage: 20, joints,
    animations: ['ranged', 'strike', 'charge'], personality: 'aggressive', level: 'HARD',
    director: {groundApproachHeight:80,commitment:2.5,retreatMin:4000,retreatMax:7000,retreatDuration:8,reengageDuration:6,attackSpacing:.6,pressureThreshold:100,facing:.65},
    movement: { runOnly:true, walk: runSpeed, run: runSpeed, chargeSpeed: runSpeed*1.15, acceleration: runSpeed/3, deceleration: runSpeed/2.4, turnRate: .5, turnAcceleration: .65, stepHeight:24,stride:height*model.clips.run!.stride!,runStride:height*model.clips.run!.stride!, jumpSpeed:120,gravity:40,sidestep:false,independentAim:true,traversalLeap:false,repositionDistance:5000,intentDuration:2.5 },
    senses: { range: 160000, fov: Math.PI * 2, pursueOccluded: true }, arena: { minWidth: 2500, maxSlope: .15 },
    regions: [{ id: 'chest-core', joint: 'gem', radius: 48, radii: { x: 48, y: 72, z: 32 }, multiplier: 1.25, stagger: 100 }, ...regions],
    abilities: standardAbilities.filter(a => ['fireball-barrage', 'hand-strike', 'charging-rampage'].includes(a.id)).map(a => {
        const b = { ...a, maxRange: 6000, maxAltitude: 5000, unlockBelow: 1 };
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
        if (a.id === 'hand-strike') {
            b.pivot = joints['shoulder-left']!.position;
            b.contactBounds = model.attackBounds.punch;
            b.reach = 550;
            b.lift = 160;
            b.radius = 90;
            b.maxRange = 1400;
            b.cone = .75;
            b.windup=.2;
            b.active=.3;
            b.recovery=1.4;
            b.damage = 25;
            b.warning = .75;
            b.cooldown = 3.5;
            b.arcStart = -.9;
            b.arcEnd = .6;
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
        b.moving = a.mechanism==='projectile';
        return b;
    })
});
export function createAshenWarlordEncounter(id: string, playerId: string, started: number, ground: (x: number, z: number) => number, buildings: readonly DistrictBuilding[], health = 2500) {
    // Authored runways replace raw map footprints. A low OSM footprint inside
    // the DFW runway must not shelter a parked aircraft from the boss.
    let combatBuildings=runwayCombatBuildingsCache.get(buildings);
    if(!combatBuildings){combatBuildings=buildings.filter(b=>!cityAirports.dallas.some(airport=>{
        const x=(b.minX+b.maxX)/2-airport.x,z=(b.minZ+b.maxZ)/2-airport.z;
        const halfX=(b.maxX-b.minX)/2,halfZ=(b.maxZ-b.minZ)/2,c=Math.cos(airport.heading),s=Math.sin(airport.heading);
        return Math.abs(c*x-s*z)<=airport.runwayWidth/2+Math.abs(c)*halfX+Math.abs(s)*halfZ&&Math.abs(s*x+c*z)<=airport.runwayLength/2+Math.abs(s)*halfX+Math.abs(c)*halfZ;
    }));indexBuildingsForOcclusion(combatBuildings);runwayCombatBuildingsCache.set(buildings,combatBuildings);}
    return createM19Encounter(id, playerId, started, ground, combatBuildings, health, ashenWarlordSpecies, { geometry, spawn: journeyDallas19.monster, environmentDamage: true, navigation:'city-bounds', articulate: createAshenPose(health), bounds: {minX:-cityHalfSize,maxX:cityHalfSize,minZ:-cityHalfSize,maxZ:cityHalfSize} });
}
