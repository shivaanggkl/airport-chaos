import { readFileSync } from 'node:fs';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import { readTitanAnimationAsset, titanGaitTime, TitanAnimationSampler, transformTitanPoint, type AuthoredAnimation } from '../../shared/titan-animation.mjs';
import { titanAnchor } from '../../shared/titan-pose.mjs';
import type { Environment, AuthoredPoseContext } from './titan/engine.js';
const asset = readTitanAnimationAsset(readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb', import.meta.url)));
const H = model.height, clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
/** One sampler/transition state per encounter. All bone motion comes from supplied animation tracks. */
export function createAshenPose(initialHealth = 2500): Environment['articulate'] {
    const sampler = new TitanAnimationSampler(asset);
    const coreMatrix = new Float64Array(16);
    let old: AuthoredAnimation | undefined, transition: AuthoredAnimation | undefined, transitionAt = 0, lastTime = 0, gaitPhase = 0, turnTime = 0, lastRoot: {
        x: number;
        z: number;
    } | undefined, lastHealth = initialHealth, hitAt = -10, landAt = -10, wasAirborne = false;
    const select = (c: AuthoredPoseContext, root: {
        x: number;
        z: number;
    }, yaw: number): AuthoredAnimation => {
        const dt = clamp(c.time - lastTime, 0, .1), distance = lastRoot ? Math.hypot(root.x - lastRoot.x, root.z - lastRoot.z) / H : 0;
        lastRoot = { x: root.x, z: root.z };
        lastTime = c.time;
        if (c.health < lastHealth && c.time - hitAt > 1.2 && (!c.ability || c.ability.stage === 'RECOVERY'))
            hitAt = c.time;
        lastHealth = c.health;
        if (wasAirborne && !c.airborne)
            landAt = c.time;
        wasAirborne = c.airborne;
        const speed = Math.hypot(c.velocity.x, c.velocity.z), forward = c.velocity.x * Math.sin(yaw) + c.velocity.z * Math.cos(yaw), gait = forward > 0 && speed > H * model.clips.walk!.stride! / model.clips.walk!.duration * 1.1 ? 'run' : 'walk';
        if (!c.airborne && speed > .5)
            gaitPhase = (gaitPhase + (forward < 0 ? -1 : 1) * distance / model.clips[gait]!.stride! + 1) % 1;
        const a = c.ability;
        let key = 'idle', time = c.time;
        if (c.time - landAt < 1.55) {
            key = 'landing';
            time = 2.2 + c.time - landAt;
        }
        else if (a?.id === 'ground-smash') {
            key = 'jump';
            time = c.airborne ? .35 + clamp((a.elapsed - a.warning - a.windup) / 6, 0, 1) * 1.5 : Math.min(.35, a.elapsed / (a.warning + a.windup) * .35);
            if (!c.airborne && a.stage !== 'WARNING' && a.stage !== 'WINDUP') {
                key = 'idle';
                time = c.time;
            }
        }
        else if (a && a.stage !== 'COOLDOWN') {
            key = ({ 'energy-beam': 'charge', 'fireball-barrage': 'shoot', 'hand-strike': 'punch', 'roaring-shockwave': 'roar', 'two-hand-clap': 'clap', 'charging-rampage': 'run' } as Record<string, string>)[a.id] ?? 'idle';
            if (key === 'run') {
                key = speed > .5 ? gait : 'idle';
                time = key === 'idle' ? c.time : titanGaitTime(model.clips[key]!, gaitPhase);
            }
            else if (key === 'clap' && a.stage === 'WARNING') {
                key = 'idle';
                time = c.time;
            }
            else {
                const windows: Record<string, number[]> = { punch: [0, .35, .55, .85, 2.25], clap: [0, 0, .1, .35, .9], charge: [0, 1.5, 2.4, 3.9, 5.4], shoot: [0, .9, 1.3, 2.3, 3.1], roar: [0, 1.2, 1.6, 2.8, 3.625] };
                const w = windows[key]!, i = ({ WARNING: 0, WINDUP: 1, ACTIVE: 2, RECOVERY: 3 } as Record<string, number>)[a.stage] ?? 3;
                time = w[i]! + (w[i + 1]! - w[i]!) * a.progress;
            }
        }
        else if (c.time - hitAt < model.clips.hit!.duration) {
            key = 'hit';
            time = c.time - hitAt;
        }
        else if (speed > .5) {
            key = gait;
            time = titanGaitTime(model.clips[key]!, gaitPhase);
        }
        else if (Math.abs(c.yawVelocity) > .015) {
            key = 'turn';
            turnTime -= dt * c.yawVelocity / (3.1997298216058336 / model.clips.turn!.duration);
            time = turnTime;
        }
        const clip = model.clips[key]!, frame: AuthoredAnimation = { clip: clip.name, time: ['walk', 'run', 'idle', 'turn'].includes(key) ? (time % clip.duration + clip.duration) % clip.duration : clamp(time, 0, clip.duration), blend: 1, offsetY: 0 };
        if (!c.airborne && speed > .5)
            frame.locomotion = { clip: model.clips[gait]!.name, time: titanGaitTime(model.clips[gait]!, gaitPhase) };
        if (key !== 'defeat')
            frame.aim = [{ node: model.boneNodes.neck!, yaw: clamp(c.headYaw ?? 0, -.7, .7) * .2, pitch: -clamp(c.headPitch ?? 0, -.6, .6) * .15 }, { node: model.boneNodes.head!, yaw: clamp(c.headYaw ?? 0, -.7, .7) * .3, pitch: -clamp(c.headPitch ?? 0, -.6, .6) * .25 }];
        return frame;
    };
    return (limbs, feet, root, yaw, axes, context) => {
        const next = select(context, root, yaw);
        if (old && old.clip !== next.clip) {
            transition = { ...old };
            transitionAt = context.time;
        }
        if (transition && context.time - transitionAt < .18) {
            next.previousClip = transition.clip;
            const duration = asset.clips[transition.clip]!.duration;
            next.previousTime = (transition.time + context.time - transitionAt) % duration;
            next.blend = clamp((context.time - transitionAt) / .18, 0, 1);
        }
        else
            transition = undefined;
        sampler.evaluate(next);
        let low = Infinity;
        for (const v of model.support)
            low = Math.min(low, sampler.point(v).y);
        next.offsetY = -low;
        const local = (p: {
            x: number;
            y: number;
            z: number;
        }) => ({ x: p.x * H, y: (p.y + next.offsetY) * H, z: p.z * H });
        for (const [key, node] of Object.entries(model.boneNodes)) {
            const m = sampler.world[node]!;
            limbs[key] = titanAnchor(root, yaw, local({ x: m[12]!, y: m[13]!, z: m[14]! }));
            if (key.startsWith('foot'))
                feet[key] = limbs[key]!;
        }
        let x = 0, y = 0, z = 0;
        for (const v of model.coreSupport) {
            const p = sampler.point(v);
            x += p.x / model.coreSupport.length;
            y += p.y / model.coreSupport.length;
            z += p.z / model.coreSupport.length;
        }
        limbs.gem = titanAnchor(root, yaw, local({ x, y, z }));
        for (const side of ['left', 'right']) {
            const points = model.handSupport[side]!;
            let x = 0, y = 0, z = 0;
            for (const v of points) {
                const p = sampler.point(v);
                x += p.x / points.length;
                y += p.y / points.length;
                z += p.z / points.length;
            }
            limbs[`hand-${side}`] = titanAnchor(root, yaw, local({ x, y, z }));
        }
        let mx = 0, my = 0, mz = 0;
        for (const v of model.mouthSupport) {
            const p = sampler.point(v);
            mx += p.x / model.mouthSupport.length;
            my += p.y / model.mouthSupport.length;
            mz += p.z / model.mouthSupport.length;
        }
        limbs.mouth = titanAnchor(root, yaw, local({ x: mx, y: my, z: mz }));
        const c = Math.cos(yaw), s = Math.sin(yaw), rotate = (x: number, y: number, z: number) => ({ x: c * x + s * z, y, z: -s * x + c * z });
        model.regions.forEach((r, i) => { const m = sampler.world[r.node]!, id = `volume-${i}`; limbs[id] = titanAnchor(root, yaw, local(transformTitanPoint(m, r.offset))); const basis = (k: number) => { const len = Math.hypot(m[k]!, m[k + 1]!, m[k + 2]!) || 1; return rotate(m[k]! / len, m[k + 1]! / len, m[k + 2]! / len); }; axes[id] = { x: basis(0), y: basis(4), z: basis(8) }; });
        const skin = coreMatrix;
        skin.fill(0);
        for (const v of model.coreSupport)
            for (let j = 0; j < 4; j++) {
                const weight = v.weights[j]! / model.coreSupport.length;
                if (!weight)
                    continue;
                const m = sampler.skin[v.joints[j]!]!;
                for (let k = 0; k < 16; k++)
                    skin[k]! += m[k]! * weight;
            }
        const axis = (k: number) => { const length = Math.hypot(skin[k]!, skin[k + 1]!, skin[k + 2]!) || 1; return rotate(skin[k]! / length, skin[k + 1]! / length, skin[k + 2]! / length); };
        axes.gem = { x: axis(0), y: axis(4), z: axis(8) };
        old = { ...next };
        return next;
    };
}
