# Turning-target combat QA

## Verified defects and correction

- Automatic aim samples were aircraft-local offsets reused after the aircraft rotated. The same saved sample therefore pointed elsewhere in world space during banks/turns. Automatic samples now carry the server-issued orientation; client display and server firing re-express each contributing sample in the current validated aircraft frame before interpolation. Accepted movement also re-expresses the active aim before checking whether a lock was lost.
- Acquired targets repeatedly inherited initial acquisition steering lag as their predicted lead moved. Once acquired, the same eligible target tracks fresh bounded lead goals. New targets still acquire normally; manual input remains aircraft-relative. Occlusion, lost eligibility, target changes and protection continue to clear/prevent locks.

The shared conversion matches Three.js YXZ rotations through tested pitch/yaw/bank combinations. The old calculation produces more than the lock-angle error in those examples; the correction preserves world direction within 1e-6 radians. Reusable client outputs avoid per-frame allocation. Weapon travel and acquisition limits are unchanged.

## Validation

**55 tests passed; zero failures/skips/cancellations.** Client, server and native iOS builds passed.

Real local authoritative-server scenarios verified:

- Curving opponent positions and bank changes while tracking, including actual two-axis authoritative displacement.
- Off-centre acquisition, moving-target bullet damage and confirmed locks at 80 metres.
- A saved automatic aim sample fired after a validated player bank/pitch/turn: no false lock release, preserved world direction, and actual projectile impact/damage.
- Mission 8/9/10 transport/escort switching.
- Sky Duel combat, reconnects, surrender, payouts and isolated practice fallback.
- Forged fire geometry, stale samples, duplicate intents, transform bounds, spawn protection and authority regressions.

An older integration assertion assumed a newly approached contact must always first appear unlocked. With stabilized aim, it may already be aligned. The test now checks every reported confirmed sample against its published orientation, muzzle and intercept, then still requires actual travelling-bullet damage. No collision/damage assertion was removed.

[Full test results](combat-turning-qa-evidence/regressions.tap). These are automated local-server scenarios and math checks, not manual physical-device gameplay or a 100-aircraft performance approval. A target can still dodge after a straight round is fired; red does not grant automatic damage.

## Delivery and preservation

Protocol **30** coordinates the automatic aim orientation across client/server. A client/server mismatch is rejected by the existing protocol gate. Fire requests still reference only server-issued sample IDs/blend; caller-supplied aim geometry cannot authorize hits. No homing, wider cone, additional damage, economy change or new UI controls.

The combat deployment is isolated from pending local mission-time defaults and fixed-centre-marker removal. Those local changes are preserved and included in the latest locally built iPhone QA client. A mission-time test was preserved as an `.mjs` test so the server TypeScript build does not compile a client source outside its root directory. No production deployment.
