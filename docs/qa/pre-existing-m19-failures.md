# Pre-existing M19 test failures — Dallas memory P0

Baseline: staging `8d8758f` (same gameplay source as QA `330abaa`).
The following six `server/src/m19-titan.test.mjs` cases fail on both the original staging implementation and the compact collision implementation:

- Ten M19 powers produce real timed attacks with compatible model poses.
- Real Dallas navigation remains clear and can reposition.
- Anatomical weakpoints, beam interruption and duplicate protection.
- Bluejay body projectiles and first-clear ledger.
- All ten warned powers avoided by 400 m/s flight.
- Reconnect stable pilot target without repeat beam impact.

Original and candidate each produced 9 passes / 6 failures. These are outside the memory-optimization scope; no M19 gameplay corrections or weakened expectations are included. Separate exact-record, collision-segment, monster-motion and transport-altitude equivalence checks pass.
