# Selected Sonniss 2026 audio

The existing Web Audio manager plays 38 selected AAC mono clips (48 kHz, 80 kbps), totaling **680,633 bytes**. No raw WAV collection is shipped. `client/src/audio-clips.ts` records each exact original filename, original SHA-256, clip duration and exported size.

Integrated: primary/back/confirmation/error UI, store tabs and swipes, confirmed aircraft selection, Credits/counting, rewards/purchases, mission checkpoints/countdowns/victory, flight wind/boost/near misses, combat hits/damage/destruction, lock/incoming/territory warnings, Dr. Boss creature/ability/footstep/landing/defeat cues, portal phases, storm/outdoor/lake ambience, and Sky Duel/Air Assault presentation. Existing authoritative event and impact guards are retained. Confirmed receipt and match/phase cues additionally use bounded deduplication.

The manager retains saved volume controls, the existing unlock and iOS lifecycle recovery, and synthesized fallbacks. UI clips load first; gameplay clips prepare with two decode workers during launch preparation. Hit/fire playback never downloads or decodes audio. Voices are capped at 16; warnings duck engines/music; loops stop on pause/background/ads, recover from logical state, and are released on leaving gameplay. Nearby opponent explosions use stereo position and distance attenuation. Creature vocalizations are not attached to individual bullet hits.

## Reproduce the exports

Requires local `ffmpeg` and `ffprobe`; no runtime dependency was added:

```sh
python3 scripts/audio/prepare-sonniss.py --source /path/to/airport-chaos/deletelater
```

The source folder may be in the main checkout when using a worktree. The script matches exact names recursively, never modifies originals, checks original hashes, trims leading silence, caps usable sections, normalizes loudness, fades one-shots, crossfades loop seams, and writes only selected AAC clips. All 38 exports succeeded. The AAC recordings decoded in Chrome with finite samples and a maximum sample peak of 0.792, below clipping.

## Remaining gaps

Professional recordings for all four aircraft engine families, rapid gunfire, runway rolling/touchdown, and complete background music remain unavailable. Existing synthesis is intentionally retained; these gaps are not solved by the supplied recordings. No clips failed automated editing/decoding checks. Subjective listening and physical iPhone/Android playback have not been verified in this pass.
