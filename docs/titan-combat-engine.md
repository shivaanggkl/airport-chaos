# Titan Combat Engine 2.0

Mission 19 now binds this engine through `server/src/m19-titan.ts` and the measured
`shared/m19-titan-model.mjs` rig adapter. Other gameplay does not import the engine.

## Modules and host boundary

- `server/src/titan/definitions.ts`: immutable trusted species registry, monster-only
  difficulty profiles and ten standard power templates.
- `server/src/titan/engine.ts`: encounter-owned perception, utility decisions, bounded
  observation memory, movement/navigation, combinations, damage and reusable attacks.
- `shared/titan-pose.mjs` / `.d.mts`: deterministic attack timelines, aimed joints,
  limb curves and presentation contract. Safe for future client rendering.
- `server/src/titan/engine.test.ts`: deterministic two-species headless harness.

The host owns authentication, target authorization, accepted player movement,
projectile source validation, rewards, persistence, network delivery and scene lifetime.
Never construct species or feed damage/observations directly from client messages.
No filesystem, assets, model loading, network or wallet access occurs in simulation.

## Register and run

```ts
const registry = new SpeciesRegistry();
const species = registry.register(trustedSpeciesDefinition);
const encounter = new TitanEncounter(serverEncounterId, species, spawn, environment);
const frame = encounter.step(deltaSeconds, authorizedObservations, acceptedThreats);
// Apply each frame.events damage event once, using its encounterId + stable id.
// Publish only the bounded presentation snapshot needed by the renderer.
encounter.dispose();
```

All configuration distances are **world meters**, seconds for time, radians for angles.
`scale` is the visual model scale; physical dimensions/joint anchors are already in
world meters and must match the scaled model. Root +Z faces forward; yaw rotates +Z
through +X. Root Y is terrain height; joints are local offsets.

A species supplies ID, model/optional LOD references, dimensions, health, joint-to-bone
mappings, animation capability IDs, movement limits, senses, personality, difficulty,
abilities, damage regions, and arena width/slope requirements. `body` is the required
root collision/perception anchor. Other anatomy is optional. Standard powers use
semantic keys such as `mouth`, `hand-left`, `hand-right`, `tail`, and `foot-left/right`;
custom powers may name other registered limbs. Swept limbs declare their maximum reach
and angular speed; registration rejects arcs that exceed either capability. Omit incompatible powers: registration
rejects missing joints, animations, invalid geometry and unsupported jump/charge limits.
Inputs are copied and recursively frozen. Separate encounters never share mutable state.

Movement supports accelerated walking/running, angular momentum, optional sidesteps,
ballistic leaps, charges and stagger recovery. Feet plant in world space during stance,
swing along bounded arcs and expose authoritative IK anchors. Head/mouth aim independently
when enabled. Body/limb anchors, beam direction and attack progress are included in snapshots.

## Difficulty and intelligence

| Level | Reaction | Memory | Combo limit |
|---|---:|---:|---:|
| EASY | 900 ms | 3 s | 1 |
| MEDIUM | 600 ms | 6 s | 2 |
| HARD | 350 ms | 10 s | 3 |
| VERY HARD | 200 ms | 14 s | 3 |
| LEGENDARY | 120 ms | 18 s | 4 |

These are independent of aircraft AI. Planning is capped at 5 Hz, so reactions are
quantized to planning ticks. Difficulty controls prediction, threat weighting, memory
and combination depth; physical capabilities are never increased.

Perception uses authorized, living, same-encounter targets, range, FOV and host LOS.
The utility layer compares hunt/intercept/control-space/reposition/defend/recover/attack
using observed velocity, altitude, circling, stationary flight, repeated rear pressure, incoming trajectories,
recent misses and personality. Commitment and score hysteresis stabilize choices.
Memory expires and is reset per attempt. It never observes future player inputs.

## Abilities and synchronized collision

Every power uses SELECT → WARNING → WINDUP → ACTIVE → RECOVERY → COOLDOWN.
Definitions specify anatomy, animation/event ID, durations, range/cone/altitude,
damage/radius, movement compatibility and interruption. Event IDs map to authored
visuals **and audio** in the presentation adapter; no new assets are required here.

| Mechanism | Powers |
|---|---|
| Fixed ballistic projectiles | Fireball barrage, approved debris throw |
| Angularly constrained, occluded beam | Energy beam |
| Continuous animated limb sweeps | Hand strike, tail whip, two-hand clap |
| Occluded area/cone impacts | Ground smash, roaring shockwave |
| Validated ballistic movement/landing | Giant leap |
| Accelerated movement/body sweep | Charging rampage |

The planner ranks currently practical powers; subsequent combinations are reevaluated
from real geometry and recent results after recovery. Only one physical ability runs
at a time. Independent cooldowns and difficulty depth prevent incompatible overlaps.
Projectiles already released continue during later attacks; they never home.

Use `titanTimeline`, `titanAttackPose`, `titanAimedJoint` and snapshot anchors to drive
skeletal IK. Do not author an unrelated collision curve. Stage progress is normalized;
stable attack IDs identify releases/warnings/recovery. Damage is emitted only on real
moving-sphere/segment contact, clipped by host obstruction queries. Each projectile
hits its earliest contact once; beam/melee/area contacts are once per target/activation.
Regions supply critical multipliers and stagger/interruption thresholds.

For incoming attacks call `damage` with an authenticated server source, monotonic
per-source sequence, accepted segment, delta ≤100 ms, radius and weapon damage.
Sequences include misses and must be ordered by the host (not client projectile IDs).
The engine supports 16 encounter damage sources; additional participants require an
explicit host admission limit rather than silently adding unbounded receipt storage.

## Environment, bounds and lifecycle

The environment adapter supplies indexed `traversable`, terrain, LOS and earliest
`obstruction` fraction. Traversability must include full monster dimensions, terrain
and buildings. Local navigation tries at most eight directions at 5 Hz; movement follows the server cadence; curved strikes and beams receive bounded
collision-driven substeps when required. No full-city searches are performed.

`takeDebris` atomically reserves only encounter-owned approved objects within reach.
Footstep/landing/impact events may drive localized dust, reversible building/debris
states. The host must never mutate persistent shared city data; `reset(encounterId)`
restores its encounter overlay. Reset clears combat/memory/projectiles/receipts;
time and event serials remain monotonic so delayed delivery cannot replay old events.
Dispose invalidates further stepping and restores the overlay.

Limits: 100 ms input steps, 16 target observations, 32 threats, 90 observations,
32 reusable projectile slots, 128 events/tick, 32 configured powers and 16 damage sources.
Host callbacks must be bounded and deterministic. Snapshot copies cannot mutate runtime.

## Binding another encounter (M19 reference)

1. Register the current M19 model/LODs, measured anatomy, regions and actual capabilities.
2. Bind the existing skeleton/foot planting and effects to shared pose/timing anchors.
3. Adapt existing indexed buildings/terrain and projectile authorization at the host boundary.
4. Add explicit mission lifecycle/network snapshot integration in that separate task.
5. Preserve authored mission identity/progression/rewards and validate real visual contact.

Headless engine tests remain separate from M19’s real-rig and browser integration
checks. Human combat balance remains a separate acceptance step.
