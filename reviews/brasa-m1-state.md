# Brasa M1 state

Updated 2026-09-25. Worktree: `/Users/lucas_gaspe/dev/capivara-floors/brasa`, branch `v3/gameplay`.

## Current handoff

- Runtime `ee9ddb670f8a124afe74379ed9c550189a9fbd41` LANDED as `be86110` on `v2-renan`. Brasa branch fast-forwarded to `be86110`; its tree is identical to verified `ee9ddb6`. Includes landed combined Direction A `6f54cac` / Forja `c7e1c26` through merge `83b4d78`, plus default capybara/nameplates `fc3c242`.
- Focused death-cam fix: `84c6c82`. Retains a kill that precedes the dead snapshot, starts the full 1.8 s beat on the dead view, expires an unmatched kill after 3 s, and preserves respawn/spectator cancellation. Main waits for the kill/camera before automatically spectating, with a missing-event fallback.
- Existing VFX review fixes retained: `aa8f540` and `5a563ff`. Headshot card floor 38 px, flash card floor 20 px. The shipped star's alpha >= 128 bounds are 90x87 in a 128 px cell, projecting to 26.72x25.83 px at the 38 px floor before rotation/postprocessing. Pincel final pass on `ee9ddb6` approved the 30 m star, FP M4/shotgun flashes (no depth crop), tracers and casings. The TP flash at 40 m was about 9 px wide, below the 12 px floor; fix-forward `3802f17` raises only its card minimum from 20 to 28 px. Formiga reported the star at about 32x30 px at 1080p and 21x20 px at 720p. Pincel clarified both targets are 1080-referenced, so the original 720p star already passed. `9d58e96` conservatively raises the star card minimum from 38 to 46 px; Pincel accepts this provided the 6 m star stays <=72 px and the unchanged 240 ms lifetime is retained. Fresh captures on `9d58e96` are complete: Brasa inspected the 720p far star/flash and 1080p close star/hostile flash. Close star is roughly 50 px, below 72 px; the 240 ms lifetime is unchanged. Pincel has the final paths.
- Shared-file changes in `src/main.ts` are small and additive: death-cam handoff state and frame scheduling, combined with Forja's timing instrumentation. No simulation or network contract changed by this continuation.

## Merge contract

- `src/render/storm.ts` is byte-identical to landed Forja, including BackSide wall and exposure API.
- Brasa atlas remains exactly 1024x512, 148876 bytes; one matching manifest entry. Removed photo texture manifest entries stay removed.
- Forja's painted sky/light/materials, FXAA, first-person post target, warmup, bounded character mask and samples=0 presets remain intact.
- Screen feedback retains Direction A saturation 1.12 with outside-storm multiplier 0.75 and violet edge/pulse.
- VFX additive alpha suppresses both world and character ink behind effects. FP cards beyond weapon depth survive the post pass and composite with their alpha, avoiding a new muzzle crop at the weapon silhouette.
- Both asset histories are retained in `docs/assets.md`. Duplicate storm test fixtures from the automatic merge were removed.

## Verification

- Focused death-cam tests: 8/8 PASS, including both delivery orders and missing dead snapshot.
- Merged runtime TypeScript check: PASS.
- Exact `ee9ddb6` clean detached Node 24.20.0 gate: npm ci, check, 33 files / 231 tests, build PASS. Logs: `/tmp/formiga-brasa-ee9ddb6-gate-logs/`. Sentinela issued final landable PASS.
- Forja source review: PASS exact `83b4d78`; no blocking defect. This does not claim GPU/art/perf approval.
- Sentinela breakage review: PASS exact `83b4d78`; 45/45 focused tests across death cam, feedback events, audio, bots and renderer lifecycle. Shared review: `reviews/sentinela-review-brasa-83b4d78.md`. Sentinela marked the event-order defect closed.
- Sentinela delta review: PASS exact `ee9ddb6`; check and 33/33 focused tests, clean diff. Default capybara, font warmup, nameplates and reaction hooks preserved. Shared review: `reviews/sentinela-review-brasa-ee9ddb6.md`.
- Fresh headshot 30 m, enemy flash 40 m, FP M4 and shotgun evidence at 720p and 1080p: captured on `ee9ddb6`, medium preset, under `/Users/lucas_gaspe/dev/capivara-team/reviews/brasa-resume/{1280x720,1920x1080}/`. Stills at 17 ms for flashes and 67 ms for the star; full strips also present.
- Detail crops: `brasa-resume/headshot-star-30m-crop.png`, `muzzle-flash-m4-1920-crop.png`, `muzzle-flash-shotgun-1920-crop.png` in shared reviews. Brasa inspected full 720p star/M4/shotgun/enemy-flash and 1080p star, including the star crop. No cropped FP card silhouette is visible.
- Browser capture logs: `/tmp/formiga-brasa-ee9ddb6-capture-logs/`. Each size logged one `/favicon.ico` 404 from the developer harness, confirmed by Formiga. No page exception or shader error occurred.

## Remaining scope

Gameplay integration is complete and landed. Follow-up `9d58e96` is verified: clean Node 24.20.0 npm ci/check, 33 files / 231 tests, build PASS. Logs: `/tmp/formiga-brasa-9d58e96-gate-logs/`. Targeted 720p/1080p headshot and TP-flash captures plus 1080p close headshot are under shared `reviews/brasa-tp-flash-fix/`; source remains frozen. FAST TRACK supersedes the previous extended visual gate; Pincel's final pass is recorded in shared `reviews/pincel-final-pass.md`; the world smear belongs to Forja/Jangada. Tatu's default capybara and nameplates are integrated. Tatu is wiring rig reactions as a separate fix-forward task against `ee9ddb6`: preserve AvatarView.react(id, AvatarReaction), reset on respawn/new match; local InputController.onInspect() hook; initial victory emote from authoritative results winner once per match, no new protocol event. No new perf timing claim is made for this merge. Forja has independently supplied the cached EffectsFrame follow-up to the orchestrator.
