# UI, UX and spectator pass: report

Branch `ui-spectator`, from 2048c8c, 29 to 30 September 2026. Research with sources: `docs/overhaul/ui-research.md`. Evidence: `docs/overhaul/evidence/ui/` (1280x720 or smaller, real Chrome with ANGLE Metal).

## 1. Death and spectator camera (the user's complaint)

### What was wrong (reproduced before any change)

Live practice and two-client runs with a new QA-only damage hook (`__capivara.qaDamage`, VITE_QA builds only) showed:

1. **The view froze after death.** Eliminated in battle royale, the UI released the mouse, and an unlocked game renders only "dirty" frames at 10 fps. Spectating was a still image until you clicked a button.
2. **The spectated view stepped at 20 Hz.** The camera read the watched capybara from the raw snapshot, not from the interpolated pose its body is drawn with: in the two-client measurement below, 120 of 180 frames did not move at all, and the view was also about 100 ms ahead of every body on screen.
3. **First person inside someone else's head with no weapon**, their 20 Hz aim applied directly: choppy, and you could not tell who you were watching.
4. **No target information**: nothing said who you watched, their health or weapon; the big eliminated panel stayed in the middle of the screen the whole time (`before-spectate.jpg`).
5. **Only forward cycling** (Space), no previous; cycling order was the raw actor list.
6. **The watched capybara falling cut instantly** to the next one in the list, with no beat and no link to who got it.
7. **Respawn swooped**: the death cam blend flew across the island into the new spawn in 0.6 s.
8. **Arena modes froze the camera** after the 1.8 s death cam until the respawn.
9. **Results showed nothing in particular** behind the panel (a frozen view).
10. **Minimap and safe-zone cues kept showing your own dead position** while watching.

### What it does now

- **Watch order and hand-off** (`src/spectate.ts`, `SpectateDirector`, pure and clocked by the caller): after the death cam you watch your eliminator if it is still standing, otherwise whoever is nearest to where you fell (storm and fall deaths). Order: people before bots, dropped connections last, stable. Forward with Space or left mouse, back with right mouse, the wheel both ways, the on-screen arrows or the arrow keys when the mouse is released. When the watched capybara falls the camera holds 1.8 s on the body ("Pega por X"), then follows its eliminator, or the nearest one. A player who leaves is held, then skipped; a dropped friend stays on screen when nobody else is left. A kill event that arrives after the one-second fallback redirects to the eliminator unless the player already switched by hand.
- **Third-person follow camera** (`src/render/follow-camera.ts`): over the right shoulder of the interpolated pose, aim damped against the 20 Hz steps, a sphere cast (AABBs grown by the probe radius) from the head to the shoulder and then to the lens, in at once when blocked, out at 3.5 m/s, terrain marched so the lens never dips under a slope, mouse orbit that drifts back after 2.2 s idle, a slow high orbit over a fallen target, the body hidden if the lens is squeezed under 0.7 m. Chosen over first person because the aim arrives at 20 Hz and a stylized character game should show the character (Fortnite does the same); a first-person option is listed below as follow-up.
- **Hops between targets travel along an arc** lifted with distance (up to 14 m) that rises over terrain, rocks and roofs (the first recording flew through a hill: `death-sequence-before-hop-fix.jpg`); reduced motion cuts.
- **Death cam** keeps its 1.8 s beat (jump or fire skips it) and now keeps tracking the eliminator after the beat until watching starts, a respawn, or the results. **Respawns cut** back into the eyes. **Results** orbit the champion's celebration behind the panel.
- **Watching is live play**: full frame rate with or without the mouse captured; the mouse is no longer released at death (Esc opens a watching menu: "Continuar assistindo", "Configurações", "Voltar ao menu", with the watch keys listed).
- **HUD while down**: a death card (placement, killer portrait in their kit colour, weapon, distance, and what the eliminator had left: health and armour, the TF2 and Valorant idea; storm and fall have their own cards; a late joiner is told the match is under way), then the watch bar at the bottom: "ASSISTINDO", n of N, portrait, name, Bot or Da turma or Sem conexão, weapon, eliminations, health and armour bars, previous and next with their keys, "Mouse gira a câmera · Esc menu". Arena modes show the respawn countdown ring on the card. Map, compass, district name and safe-zone mark follow the watched capybara.

### Evidence

- Two real clients over the local signaling server (host and guest browsers, room code, BR with bots): the guest is eliminated by the host, watches "Ana Host · Da turma" (`after-mp-guest-watches-host.jpg`), steps forward and back through the order, holds when the host falls to a bot and then follows that bot; the host, eliminated, watches its own eliminator. Lobby, loading and results checked on both clients (`after-results-guest.jpg`).
- Smoothness while the host runs, guest camera sampled every frame for 3 s (180 frames): the follow camera moved in 174 frames, p95 frame-to-frame speed change 12.3 m/s; the raw snapshot position (what the old camera followed) was still in 120 of 180 frames, p95 speed change 34.9 m/s.
- Recordings at 4 fps before and after the hop fix; practice runs of the storm death card, kill confirmation and the watching menu (`after-storm-card.jpg`, `after-kill-confirm.jpg`, `after-menu-watching.jpg`); Correria death card with the respawn ring (`after-respawn-card.jpg`).

## 2. HUD rebuilt toward the mockup

New stylesheet `src/ui/hud.css` (the 330 replaced HUD rules were removed from `style.css`, which dropped from 155 KB to 128 KB before the additions). One language: deep teal plates, ivory type in Barlow Condensed (700 and 800, tabular numbers), coral health, cyan armour, gold for you and the safe zone, azulejo tiles (inline SVG) at the two bottom corners.

- Bottom left: portrait in your kit colour, segmented armour and health with the trailing damage chip, helmet and protection tags; consumables and posture above it.
- Bottom centre: the four fixed boxes with weapon thumbnails (they come from the weapon models, so new guns update the icons automatically), empty boxes show a faint silhouette of what belongs there (the old "Primária" text overflowed).
- Bottom right: magazine card (reserve, weapon name, rarity and fire mode chips, rarity stripe).
- Top centre: compass ribbon with pt-BR bearings (N, NE, L, SE, S, SO, O, NO), heading in degrees, the safe zone as a gold mark (pinned to an edge when behind you), updated every rendered frame from the camera. Refuge and storm chips under it.
- Top right: minimap with the district tab, and under it the match strip (players left, eliminations, storm clock with its six phase dots; Corrente shows the leader's remaining steps), as in Fortnite; kill feed below (5 lines, 6 s, 8 s for lines about you).
- Centre: reticle, hit markers (shape differs as well as colour), damage arcs, reload ring, prompts, and a new elimination confirmation under the reticle ("Você pegou X" with your running count).
- Toasts are teal chips above the weapon boxes (they used to cover the stamped moments); "A partida começou!" no longer toasts twice.
- Checked at 1280x720, 1280x548 (21:9), 1024x640 and 960x600 (`after-hud-*.jpg`). Narrow windows stack the boxes above the magazine; the threshold is derived from the new bottom row.
- Cost: `ui.update` p50 0 ms, p95 0.3 ms in Correria, 1.2 ms in battle royale while watching; the follow camera 0.2 ms p50, 0.3 ms p95 (timing probe, dev server, machine shared with the Codex gun agents).

## 3. Menus and flows

- **Loading**: each mode arrives on its own painted scene: the island trail (battle royale), a town skirmish for Correria and the fort rampart for Corrente (Codex image generation, style-matched to the existing art, WebP 277 KB and 286 KB, only the chosen one is requested; sources in `docs/assets.md`). Tips name the player's own keys for the map, scoreboard and aiming, and two new tips teach watching.
- **Settings**: new "Sensibilidade mirando" (0.5 to 1.5 of the hip speed while aiming), "Inverter o olhar vertical" and "Números de dano no alvo", saved and validated like the others; segmented choices no longer overlap (Equilibrada, Caprichada, Magenta).
- **Pause while watching** (above). **Results**: podium plus your row (the board used to clip at 720p), a real ordinal indicator (Dela Gothic drew "21o"), no accuracy line without shots, and a guest sees "Ana Host chama a revanche" instead of an empty dashed box.
- **Home and lobby** scroll in short windows (the mode cards were unreachable at 960x600).
- **Download budget**: the 2.6 MB cover master PNG moved from `public/` to `reference/art/` (it shipped in every build without being loaded).

## 4. Tests

`npx tsc --noEmit` clean; `npx vitest run`: 102 files, 856 tests pass. New: `tests/spectate.test.ts` (order, both directions, eliminator first, fallback to nearest, hold then eliminator, late kill event, manual switch cutting a hold, a player who leaves, position in the order) and `tests/spectator-camera.test.ts` (shoulder framing, wall pull-in and slow pull-out, shoulder pivot against a side wall, never under slopes, damped 20 Hz aim, orbit and return, fallen target, sphere versus ray, interpolated pose instead of the snapshot, arc between targets, the hop over a 30 m block (checked to fail without the fix), reduced motion cut, respawn cut after the death cam tracks the killer, results orbit), plus aiming comfort and settings loading in `tests/input.test.ts`, tips and fonts in `tests/ui.test.ts`.

E2E `tests/network-game.e2e.spec.ts` (Chrome, two clients): two full runs under heavy machine load each had one timeout in a different test (Corrente movement and emotes, then Correria gun drop); each test passed in at least one run and the Corrente one passed alone. They exercise networking, not the changed HUD elements; worth re-running on an idle machine.

## 5. Known issues and follow-ups

- Trees and bushes have no collision (pre-existing), so the follow camera can pass through foliage and a bush can fill the view for a moment; a near-camera foliage fade in the vegetation shaders would fix it (vegetation code was out of scope).
- A first-person spectating option needs the watched capybara's viewmodel; not done.
- The Playwright visual snapshots (`tests/visual`) will differ for every HUD view and need re-approval after review.
- The scoreboard, emote wheel, big map and pause keep the cream paper and wood of the menus on purpose (overlays that stop play read as menus); the always-on HUD is teal.
- The death cam's killer framing narrows the lens to at least 32 degrees, so a distant or hidden eliminator can still be small or behind a wall; the killer card names them either way.
- Only files in my scope changed, plus one-line hooks: `src/render/avatars.ts` (only your own body is hidden in first person; a squeezed follow camera hides the watched body), `src/render/renderer.ts` (compass heading getter), `src/simulation/host.worker.ts` (QA-only damage command, compiled out unless VITE_QA=1), `tools/qa/capture.mjs` (W and H environment variables).
