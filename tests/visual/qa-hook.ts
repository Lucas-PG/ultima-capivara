import { Simulation } from '../../src/simulation';
import { terrainHeight } from '../../src/shared/terrain';
import { clearSpawn, hasLineOfSight, moveActor, raycastWorld } from '../../src/shared/collision';
import { emptyInput, rng } from '../../src/shared/math';
import { EMOTES, EMOTE_IDS } from '../../src/shared/emotes';
import { closestInteraction } from '../../src/shared/interaction';
import { mudBathAt } from '../../src/shared/recreation';
import { chooseSupplyLanding, supplyPlanePosition, supplyDropPosition, SUPPLY_APPROACH_SECONDS, SUPPLY_DESCENT_SECONDS } from '../../src/shared/supply-drops';
import { walkableHeight, walkableSegment } from '../../src/shared/navigation';
import { KIT_PIECES } from '../../src/shared/kit-collision';
import { buildingPoint, routesToFloor } from '../helpers/building-paths';
import { walkTraversal } from '../helpers/traversal-probe';
import { placedBuildingRoutes } from '../helpers/placed-building-routes';
import { buildingRole, buildingRooms, roomVariant } from '../../src/shared/building-interiors';
import { foliageSpan, plantCrown } from '../../src/shared/vegetation-crowns';
import { waterAt } from '../../src/shared/water';
import { CORRENTE_LADDER, WEAPONS as WEAPON_DEFS } from '../../src/shared/weapons';
import { DEFAULT_CONFIG, PLAYER_COLORS, type GameEvent, type InputFrame, type LootSpawn, type Settings, type Vec3, type WeaponId, type WorldSnapshot, type WorldSpec } from '../../src/shared/types';
import type { GameRenderer } from '../../src/render/renderer';
import { gpuPasses } from '../../src/render/gpu-passes';
import { PRESET_DENSITY } from '../../src/render/resolution';
import { gpuFrameTimer } from '../../src/render/gpu-frame-timer';
import * as THREE from 'three';
import type { GameUI } from '../../src/ui/ui';
import type { InputController } from '../../src/input';
import { DISTRICT_VIEWS, VIEWS, viewStance, type WorldView } from './qa-views';

type Quality = Settings['graphics'];
type QaApi = {
  start(): Promise<void>;
  pose(name: string): Promise<{ camera: { x: number; y: number; z: number }; drawCalls: number; triangles: number }>;
  quality(quality: Quality): void;
  /** Experiments: overrides every preset's render pixel ratio cap (null restores the shipped caps). */
  density(ratio: number | null): void;
  actors(count: number, positions?: Pick<Vec3, 'x' | 'z'>[]): void;
  loading(on: boolean): void;
  loop(on: boolean): void;
  stats(): { drawCalls: number; triangles: number; renderedFrames: number };
  /** Uncapped cost of one frame: CPU submission plus GPU completion, median of `frames`. */
  bench(frames: number): Promise<{ medianMs: number; p90Ms: number; gpuMedianMs: number | null; gpuP90Ms: number | null }>;
  /** GPU milliseconds per render pass, each pass timed alone on an idle GPU (needs ?gpu=1). */
  passes(frames: number): Promise<ReturnType<typeof gpuPasses.summary>>;
  /** GPU cost of one part of the frame, as paired back-to-back benches with and without it (median of rounds). */
  ab(toggle: string, frames: number, rounds: number): Promise<{ toggle: string; baseMs: number; withoutMs: number; costMs: number; rounds: number[] }>;
  names(): string[];
  event(event: GameEvent): void;
  motion(weapon: WeaponId, action: 'reload' | 'reload-partial' | 'reload-chain' | 'inspect' | 'chop' | 'swing-right' | 'swing-left' | 'hit-right' | 'hit-left' | 'equip' | 'sprint' | 'ads' | 'land' | 'fire', seconds: number, hz?: number): Promise<void>;
  /** Program lookups per frame by material: each one is a program parameter rebuild (garbage) in three. */
  programChurn(frames: number): Record<string, number>;
  /** The view a motion ends on: camera transform and the first-person model's world matrices (frame-rate checks). */
  viewState(): { camera: number[]; viewmodel: number[] };
  buildings(): { id: string; piece: string; role: string }[];
  tpMotion(weapon: WeaponId, action: 'run' | 'walk' | 'strafe' | 'backpedal' | 'reload' | 'reload-partial' | 'death' | 'crouch' | 'jump' | 'idle' | 'hit' | 'slash' | 'slash-left' | 'chop', seconds: number): Promise<void>;
  walkBuilding(pieceId: string, direction?: 'up' | 'down'): Promise<{ ok: boolean; ticks: number; position: { x: number; y: number; z: number } }>;
};

declare global { interface Window { __capyQA?: QaApi } }

const WEAPONS: WeaponId[] = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'coco', 'dmr', 'sniper', 'machete'];
const MUD_POSES = ['mudPrompt', 'mudSoak', 'mudFull'];
// Every pickup kind in a row on the ground: at 3 m from eye height, 3 m looking down, and at 18 m (far models).
const LOOT_POSES = ['loot-eye', 'loot-down', 'loot-far'];
// The busiest HUD states, for layout review at every window size and interface scale: a full battle royale
// loadout with a prompt, the feed, a banner and the storm; watching after elimination; the Corrente ladder.
const HUD_POSES = ['hud-full', 'hud-watch', 'hud-corrente'];
const TRAMPOLINE_POSES = ['trampolineBounce', 'trampolineAir'];
const SUPPLY_POSES = ['supplyIncoming', 'supplyDescending', 'supplyLanded', 'supplyOpened'];
const BUILDING_POSES = ['houseGround', 'houseStairBottom', 'houseStairTop', 'houseUpper'];
const ACCESS_POSES = ['fortStairBottom', 'fortStairTop', 'fortWallNorth', 'lighthouseGround',
  'lighthouseStairBottom', 'lighthouseStairTop', 'lighthouseBalcony', 'dockStairBottom', 'dockStairTop', 'dockPorto', 'dockMangue'];
const ROOM_POSES = ['home', 'bakery', 'cafe', 'fisher', 'fishmonger', 'workshop', 'kiosk',
  'church', 'market_hall', 'warehouse', 'beach_kiosk', 'barracks',
  'upper-home', 'upper-barracks',
  'home-0', 'home-1', 'home-2', 'upper-home-0', 'upper-home-1', 'upper-home-2', 'home-back', 'cafe-back', 'upper-home-back'].map(role => `room-${role}`);
// Review frames hold the preset's full render density: dynamic resolution never reacts to the
// slow, synchronised frames of a capture or a bench.
const QA_BUDGET = Infinity;
const shippedDensity = structuredClone(PRESET_DENSITY);
export function installQa(deps: { world: WorldSpec; ui: GameUI; input: InputController; settings: Settings; begin(): Promise<GameRenderer> }) {
  const fixture = new Simulation(deps.world, { ...DEFAULT_CONFIG, bots: false },
    [{ id: 'practice', name: 'Capivara', color: '#bd8956', ready: true, connected: true }], 'qa-seed-2026', 0x5eed2026);
  const base = fixture.snapshot();
  let reviews = 0;
  let renderer: GameRenderer | null = null, current: WorldSnapshot | null = null, looping = false, actorCount = 1, renderedFrames = 0;
  let pendingFrame: number | null = null;
  let actorPositions: Pick<Vec3, 'x' | 'z'>[] = [];
  let preparedIdentities = '', watchedPose = false;
  let placedRoutes: Map<string, Vec3[]> | undefined;
  const names = [...Object.keys(VIEWS), 'cocoBlast', ...WEAPONS.flatMap(id => [`fp-${id}`, `ads-${id}`, `tp-${id}`, `world-${id}`]), ...EMOTE_IDS.map(id => `emote-${id}`), 'emote-wheel', 'scope',
    ...CORRENTE_LADDER.map(id => `corrente-${id}`), 'corrente-upgrade', ...MUD_POSES, ...TRAMPOLINE_POSES, ...SUPPLY_POSES, ...BUILDING_POSES, ...ACCESS_POSES, ...ROOM_POSES,
    ...deps.world.districts.map(d => `district-${d.id}`), ...deps.world.districts.map(d => `spawn-${d.id}`), 'hud', 'pause', 'results', 'results-correria', ...LOOT_POSES, ...HUD_POSES];

  function draw() {
    if (!renderer || !current) return;
    renderer.update({ frameBudgetMs: QA_BUDGET, snapshot: current, playerId: 'practice', input: deps.input.frame as InputFrame,
      dt: looping ? 1 / 60 : 0, playing: true, spectateId: null });
    renderedFrames++;
  }
  function tick() {
    pendingFrame = null;
    if (!looping) return;
    draw();
    if (looping && pendingFrame === null) pendingFrame = requestAnimationFrame(tick);
  }
  async function pose(name: string) {
    // Each review starts without the previous results layer.
    document.querySelector('#victory')?.remove();
    // The results screen marks the HUD as ended, which hides every plate: a match pose after it starts clean.
    document.querySelector('#hud')?.classList.remove('ended');
    if (!renderer) throw new Error('Call start first');
    deps.ui.closeEmoteWheel();
    const district = name.startsWith('district-') ? deps.world.districts.find(d => `district-${d.id}` === name) : null;
    const spawn = name.startsWith('spawn-') ? deps.world.spawns.find(point => `spawn-${point.district}` === name) : null;
    const bath = MUD_POSES.includes(name) ? deps.world.mudBaths?.[0] : undefined;
    const trampoline = TRAMPOLINE_POSES.includes(name) ? deps.world.trampolines?.[0] : undefined;
    const supply = SUPPLY_POSES.includes(name) ? chooseSupplyLanding(deps.world,
      { ...base.zone, nextX: 4, nextZ: -20, nextRadius: 28 }, rng(0x74756361)) : null;
    if (MUD_POSES.includes(name) && !bath) throw new Error('A revisão precisa de um banho de lama no mapa.');
    if (TRAMPOLINE_POSES.includes(name) && !trampoline) throw new Error('A revisão precisa de um trampolim no mapa.');
    if (SUPPLY_POSES.includes(name) && !supply) throw new Error('A revisão precisa de uma entrega em solo seco e acessível.');
    // Named world views stand on the real walking surface (a deck, a roof terrace), not the terrain under it.
    const named: WorldView | undefined = trampoline || bath || spawn ? undefined : district ? DISTRICT_VIEWS[district.id] ?? [district.x - 8, district.z + 8, -.7, 0] :
      VIEWS[name.startsWith('tp-') ? 'capySide' : /^(fp|ads)-/.test(name) || name === 'loot-far' ? 'vilaStreet' : name === 'cocoBlast' ? 'plaza' : name === 'scope' ? 'vilaStreet' : name] || VIEWS.plaza;
    const view = trampoline ? [trampoline.x - 7, trampoline.z, -Math.PI / 2, .12] : bath ? [bath.x, bath.z, Math.PI / 2, name === 'mudPrompt' ? -.5 : 0] : spawn ? [spawn.x, spawn.z, spawn.yaw, .04] : named!;
    if (!names.includes(name)) throw new Error(`Unknown pose: ${name}`);
    // QA: window.__qaStance = [x, z, yaw, pitch] stands the reviewing capybara anywhere, in any pose.
    const qaStance = (globalThis as { __qaStance?: [number, number, number, number] }).__qaStance;
    let [x, z, yaw, pitch] = qaStance ?? view;
    const stance = qaStance ? { x, y: walkableHeight(x, z, deps.world), z } : named ? viewStance(deps.world, named) : undefined;
    if (name.startsWith('world-')) pitch = -.5;
    const s = structuredClone(base), me = s.actors[0];
    // Each review is its own match to the renderer, so smoke, decals and poses from the previous one never linger.
    s.matchId = `${base.matchId}:${name}:${++reviews}`;
    s.phase = 'playing'; s.time = 30; s.countdown = 0; s.config.bots = false;
    if (spawn) s.config.mode = 'battle-royale';
    if (supply) {
      s.config.mode = 'battle-royale'; s.remaining = 8;
      const district = [...deps.world.districts].sort((a, b) => Math.hypot(a.x - supply.x, a.z - supply.z) - Math.hypot(b.x - supply.x, b.z - supply.z))[0];
      const announcedAt = 45, releaseAt = announcedAt + SUPPLY_APPROACH_SECONDS, landsAt = releaseAt + SUPPLY_DESCENT_SECONDS;
      s.time = name === 'supplyIncoming' ? announcedAt + 2.5 : name === 'supplyDescending' ? releaseAt + 7 : landsAt + 1;
      const drop = { id: 'supply-1', pos: supply, district: district?.id ?? '', heading: Math.PI / 2,
        announcedAt, releaseAt, landsAt, opened: false };
      s.supplyDrops = [drop];
      const close = name === 'supplyLanded' || name === 'supplyOpened';
      const prospective = close ? { ...s, time: landsAt + 1 } : s;
      const target = name === 'supplyIncoming' ? supplyPlanePosition(drop, s.time) : supplyDropPosition(drop, s.time);
      target.y += close ? .5 : 1;
      const crowns = deps.world.objects.flatMap(o => { const crown = plantCrown(o); return crown ? [crown] : []; });
      const observer = (close ? [2.4] : [18, 16, 20, 14, 22]).flatMap(distance =>
        Array.from({ length: 16 }, (_, i) => [Math.sin(i * Math.PI / 8), Math.cos(i * Math.PI / 8)]).map(([dx, dz]) => {
          const x = supply.x + dx * distance, z = supply.z + dz * distance;
          return { x, y: terrainHeight(x, z), z };
        })).find(to => {
        // Check the actual prompt and eye-to-crate LOS, not only a walkable path.
        const actor = { ...base.actors[0], pos: to, stage: 'ground' as const, grounded: true };
        const interaction = closestInteraction(deps.world, prospective, actor, { id: '', name: '' });
        if (waterAt(to.x, to.z) || !walkableSegment(deps.world, supply, to) || (close ? interaction?.id !== drop.id : !!interaction)) return false;
        const eye = { ...to, y: to.y + 1.62 };
        if (!hasLineOfSight(eye, target, deps.world)) return false;
        // Nothing solid may fill the frame close to the camera (an eave, a lamp, a wall corner).
        const lookYaw = Math.atan2(to.x - target.x, to.z - target.z), lookPitch = Math.atan2(target.y - eye.y, Math.hypot(target.x - to.x, target.z - to.z));
        if (!close) for (const dy of [-.45, 0, .45]) for (const dp of [-.3, 0, .3]) {
          const y = lookYaw + dy, p = lookPitch + dp;
          if (raycastWorld(eye, { x: -Math.sin(y) * Math.cos(p), y: Math.sin(p), z: -Math.cos(y) * Math.cos(p) }, 2.5, deps.world)) return false;
        }
        // A clear ground route alone can still put the plane behind a flowering crown.
        const length = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
        for (let distance = 1; distance < length; distance++) {
          const t = distance / length, point = { x: eye.x + (target.x - eye.x) * t, y: eye.y + (target.y - eye.y) * t, z: eye.z + (target.z - eye.z) * t };
          if (crowns.some(crown => { const span = foliageSpan(crown, point.x, point.z); return span && point.y > span[0] - 1 && point.y < span[1] + 1; })) return false;
        }
        return true;
      });
      if (!observer) throw new Error('A câmera da entrega precisa de uma aproximação livre.');
      x = observer.x; z = observer.z;
      yaw = Math.atan2(x - target.x, z - target.z);
      pitch = Math.atan2(target.y - terrainHeight(x, z) - 1.62, Math.hypot(x - target.x, z - target.z));
      drop.opened = name === 'supplyOpened';
      if (name === 'supplyOpened') s.loot.push({ id: 'supply-qa-weapon', kind: 'weapon', weapon: 'm4', rarity: 3, active: true, respawnAt: 0,
        x: supply.x - .9, y: terrainHeight(supply.x - .9, supply.z), z: supply.z, from: { ...supply, y: supply.y + .6 }, spawnedAt: s.time - .7 });
    }
    me.pos = { x, y: bath?.y ?? spawn?.y ?? (stance && !supply ? stance.y : terrainHeight(x, z)), z }; me.velocity = { x: 0, y: 0, z: 0 };
    me.stage = 'ground'; me.grounded = true; me.yaw = yaw; me.pitch = pitch;
    if (BUILDING_POSES.includes(name)) {
      const piece = deps.world.pieces!.find(piece => piece.piece === 'house_tall')!;
      const access = KIT_PIECES[piece.piece].traversal!;
      const local = routesToFloor(access, name === 'houseGround' ? 'ground-room' : 'upper-room')[0];
      const stair = access.routes.find(route => route.id === 'stairs')!;
      const stop = name === 'houseStairBottom' ? stair.points[2] : name === 'houseStairTop' ? stair.points.at(-1)! : local.at(-1)!;
      const end = local.findIndex(point => point.every((value, axis) => Math.abs(value - stop[axis]) < .001));
      const route = local.slice(0, end + 1).map(point => buildingPoint(piece, point));
      route[0].y = walkableHeight(route[0].x, route[0].z, deps.world);
      const walked = walkTraversal(deps.world, me, route);
      if (!walked.ok) throw new Error(`Building review cannot walk to ${name}: ${walked.reason}`);
      Object.assign(me, walked.actor);
      me.velocity = { x: 0, y: 0, z: 0 };
      yaw = piece.yaw + (name === 'houseStairBottom' ? Math.PI : name === 'houseStairTop' ? .2 : name === 'houseGround' ? 1.1 : -2.1);
      pitch = name === 'houseStairBottom' ? .2 : name === 'houseStairTop' ? -.45 : -.12;
      me.yaw = yaw; me.pitch = pitch;
    }
    if (ACCESS_POSES.includes(name)) {
      const kind = name.startsWith('lighthouse') ? 'lighthouse' : name.startsWith('dockStair') ? 'dock_steps' :
        name.startsWith('dock') ? 'dock_wood' : name === 'fortWallNorth' ? 'fort_wall' : 'fort_stairs';
      const piece = deps.world.pieces!.filter(piece => piece.piece === kind)
        .filter(piece => !name.startsWith('dock') || kind === 'dock_steps' || (name === 'dockMangue' ? piece.z > 30 : piece.z < 0))
        .sort((a, b) => kind === 'fort_wall' ? a.z - b.z || a.x - b.x : a.x - b.x || a.z - b.z)[0];
      if (!piece) throw new Error(`Missing access piece for ${name}`);
      const floor = kind === 'dock_steps' ? 'upper-landing' : kind === 'dock_wood' ? 'deck' : name === 'fortStairBottom' ? 'foot' : name === 'fortStairTop' ? 'landing' :
        name === 'fortWallNorth' ? 'wall-walk' : name === 'lighthouseGround' || name === 'lighthouseStairBottom' ? 'ground-room' : 'balcony-back';
      placedRoutes ??= placedBuildingRoutes(deps.world, me);
      let route = placedRoutes.get(`${piece.id}/${floor}`);
      if (!route) throw new Error(`No ground route for ${name}`);
      if (name === 'dockStairBottom') route = route.slice(0, 2);
      if (name === 'lighthouseGround') {
        const entry = KIT_PIECES[piece.piece].traversal!.routes.find(route => route.id === 'entry')!;
        const stop = buildingPoint(piece, entry.points[2]);
        const end = route.findIndex(point => Math.hypot(point.x - stop.x, point.y - stop.y, point.z - stop.z) < .001);
        if (end < 0) throw new Error('Lighthouse review lost its furnished entrance');
        route = route.slice(0, end + 1);
      }
      const walked = walkTraversal(deps.world, me, route);
      if (!walked.ok) throw new Error(`Access review cannot walk to ${name}: ${walked.reason}`);
      Object.assign(me, walked.actor); me.velocity = { x: 0, y: 0, z: 0 };
      yaw = name === 'fortStairBottom' || name === 'lighthouseBalcony' ? 0 :
        name === 'lighthouseGround' ? piece.yaw + 1.65 : name === 'lighthouseStairBottom' ? 1.5 : name === 'lighthouseStairTop' ? 2.35 : Math.PI;
      if (name.startsWith('dock')) yaw = name === 'dockStairBottom' ? -Math.PI / 2 : name === 'dockStairTop' ? Math.PI / 2 : -.6;
      pitch = name === 'lighthouseGround' ? -.35 : name === 'lighthouseStairBottom' ? -.28 : name === 'lighthouseStairTop' ? -.8 :
        name === 'dockStairBottom' ? -.3 : name.endsWith('Bottom') ? .24 : name.endsWith('Top') ? -.48 : -.08;
      me.yaw = yaw; me.pitch = pitch;
    }
    if (ROOM_POSES.includes(name)) {
      const upper = name.startsWith('room-upper-'), requested = /-([012])$/.exec(name)?.[1], back = name.endsWith('-back');
      const role = name.slice(upper ? 11 : 5).replace(/-[012]$/, '').replace(/-back$/, '');
      const piece = deps.world.pieces!.filter(piece => requested === undefined || roomVariant(piece) === Number(requested))
        .find(piece => ['church', 'market_hall', 'warehouse', 'beach_kiosk'].includes(role) ?
        piece.piece === role : (upper ? piece.piece === 'house_tall' : piece.piece.startsWith('house_')) && buildingRole(piece) === role);
      if (!piece) throw new Error(`Missing furnished building for ${name}`);
      placedRoutes ??= placedBuildingRoutes(deps.world, me);
      const route = placedRoutes.get(`${piece.id}/${upper ? 'upper-room' : 'ground-room'}`);
      if (!route) throw new Error(`No ground entrance for ${name}`);
      const floor = buildingRooms(piece).find(floor => floor.id === (upper ? 'upper-room' : 'ground-room'))!;
      const reviewPoint = buildingPoint(piece, [upper ? 1 : 0, floor.y, back ? floor.bounds[1] + .6 : floor.bounds[3] - .6]);
      const walked = walkTraversal(deps.world, me, [...route, reviewPoint]);
      if (!walked.ok) throw new Error(`Room review cannot walk to ${name}: ${walked.reason}`);
      Object.assign(me, walked.actor); me.velocity = { x: 0, y: 0, z: 0 };
      yaw = piece.yaw + (upper ? -.12 : 0) + (back ? Math.PI : 0); pitch = -.15;
      me.yaw = yaw; me.pitch = pitch;
    }
    const weaponReview = /^(?:fp|ads|tp|world)-(.+)$/.exec(name)?.[1] as WeaponId | undefined;
    const held = name === 'scope' ? 'sniper' : weaponReview || 'pistol';
    me.ads = name === 'scope' || name.startsWith('ads-');
    me.weapons = [{ id: held, ammo: Math.min(12, WEAPON_DEFS[held].magazine), reserve: held === 'machete' ? 0 : 50, rarity: 0,
      box: held === 'machete' ? 3 : held === 'pistol' || held === 'revolver' ? 2 : 0 }];
    me.slot = 0;
    const emote = EMOTE_IDS.find(id => name === `emote-${id}`);
    if (emote) { me.emote = emote; me.emoteUntil = s.time + EMOTES[emote].duration; me.crouch = emote === 'sit' || emote === 'chill'; }
    if (bath) {
      for (let i = 0; i < 60; i++) moveActor(me, { ...emptyInput(), yaw, pitch }, deps.world, 1 / 60);
      if (!me.grounded || me.swimming || mudBathAt(me.pos, deps.world)?.id !== bath.id)
        throw new Error('A revisão precisa tocar a superfície real do banho.');
      me.hp = name === 'mudFull' ? 100 : 52;
      if (name !== 'mudPrompt') { me.emote = 'chill'; me.emoteUntil = s.time + EMOTES.chill.duration; me.crouch = me.soaking = true; }
    }
    const level = name === 'corrente-upgrade' ? 2 : CORRENTE_LADDER.findIndex(id => name === `corrente-${id}`);
    if (level >= 0) {
      const id = CORRENTE_LADDER[level];
      s.config.mode = 'corrente'; s.remaining = CORRENTE_LADDER.length - level;
      s.loot.forEach(item => { item.active = false; }); s.openedChests = deps.world.chests.map(chest => chest.id);
      me.weaponLevel = me.kills = level; me.weapons = [{ id, ammo: WEAPON_DEFS[id].magazine, reserve: id === 'machete' ? 0 : 60, rarity: 0, box: 0 }];
    }
    s.actors = [me];
    for (let i = 1; i < actorCount; i++) {
      const bot = structuredClone(me), angle = i * Math.PI * 2 / (actorCount - 1), radius = 12 + i % 4 * 4;
      bot.id = `bot-qa-${i}`; bot.name = `Bot ${i}`; bot.bot = true; bot.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const bx = actorPositions[i - 1]?.x ?? x + Math.cos(angle) * radius, bz = actorPositions[i - 1]?.z ?? z + Math.sin(angle) * radius;
      bot.pos = { x: bx, y: actorPositions[i - 1] ? walkableHeight(bx, bz, deps.world) : terrainHeight(bx, bz), z: bz }; bot.yaw = angle + Math.PI;
      s.actors.push(bot);
    }
    if (name === 'capyFront' || name === 'capySide' || name.startsWith('tp-')) {
      const bot = structuredClone(me); bot.id = 'bot-qa'; bot.name = 'Capivara'; bot.bot = true;
      bot.pos = { x, y: me.pos.y, z: z - 2 }; bot.yaw = name === 'capyFront' ? Math.PI : Math.PI / 2;
      // The reviewed capybara must stand in the open, never through a bench or a wall.
      if (!clearSpawn(bot.pos, deps.world)) throw new Error(`The ${name} capybara stands inside a solid.`);
      s.actors.push(bot);
    }
    let hudPrompt: WorldSnapshot['loot'][number] | null = null;
    if (HUD_POSES.includes(name)) {
      const bots = ['Tico', 'Bento', 'Caju', 'Pipoca', 'Dendê', 'Tapioca', 'Zeca', 'Juju', 'Nino', 'Balu', 'Lola', 'Pingo', 'Tuca'];
      bots.forEach((botName, i) => {
        const bot = structuredClone(me), angle = yaw + Math.PI + (i - 6) * .22, bx = x + Math.sin(angle) * (22 + i % 3 * 5), bz = z + Math.cos(angle) * (22 + i % 3 * 5);
        bot.id = `bot-hud-${i}`; bot.name = botName; bot.bot = true; bot.color = '#ae825e'; bot.kills = i % 4;
        bot.pos = { x: bx, y: walkableHeight(bx, bz, deps.world), z: bz };
        bot.weapons = [{ id: WEAPONS[(i + 2) % 8], ammo: 8, reserve: 40, rarity: i % 4, box: 0 }]; bot.slot = 0; bot.hp = 40 + i * 4; bot.armor = i % 2 ? 50 : 0;
        s.actors.push(bot);
      });
      s.loot.forEach(item => { item.active = false; });
      me.kills = 3; me.damage = 412;
      if (name === 'hud-corrente') {
        s.config.mode = 'corrente'; me.weaponLevel = 5; s.remaining = 4;
        me.weapons = [{ id: CORRENTE_LADDER[5], ammo: 3, reserve: 30, rarity: 0, box: 0 }]; me.slot = 0; me.hp = 48; me.protectionUntil = s.time + 2;
      } else {
        s.config.mode = 'battle-royale';
        // The storm is closing and the player stands outside the next circle.
        s.zone = { ...s.zone, x, z, radius: 70, nextX: x + 60, nextZ: z - 40, nextRadius: 30, phase: 2, shrinking: true, timeLeft: 22, damage: 3 };
        me.hp = 62; me.armor = 75; me.helmet = 40;
        me.consumables = { bandage: 3, medkit: 1, guarana: 2, acai: 1, rapadura: 2 };
        me.weapons = [{ id: 'm4', ammo: 7, reserve: 120, rarity: 3, box: 0 }, { id: 'sniper', ammo: 5, reserve: 20, rarity: 2, box: 1 },
          { id: 'pistol', ammo: 17, reserve: 51, rarity: 0, box: 2 }, { id: 'machete', ammo: 0, reserve: 0, rarity: 0, box: 3 }];
        me.slot = 0;
        if (name === 'hud-watch') { me.alive = false; me.hp = 0; me.deaths = 1; }
        else {
          const lx = x - Math.sin(yaw) * 1.4, lz = z - Math.cos(yaw) * 1.4;
          hudPrompt = { id: 'hud-review-loot', kind: 'weapon', weapon: 'shotgun', rarity: 3, x: lx, y: walkableHeight(lx, lz, deps.world), z: lz, active: true, respawnAt: 0 };
          s.loot.push(hudPrompt);
        }
      }
    }
    if (LOOT_POSES.includes(name)) {
      s.loot.forEach(item => { item.active = false; });
      const kinds: [LootSpawn['kind'], WeaponId?][] = [['armor'], ['helmet'], ['ammo'], ['medkit'], ['bandage'], ['guarana'], ['acai'], ['rapadura'], ['weapon', 'm4'], ['weapon', 'shotgun']];
      const reach = name === 'loot-far' ? 18 : 3, spread = name === 'loot-far' ? .8 : .75;
      if (name === 'loot-down') pitch = -.45; else pitch = name === 'loot-far' ? -.1 : -.18;
      kinds.forEach(([kind, weapon], i) => {
        const across = (i - (kinds.length - 1) / 2) * spread, lx = x - Math.sin(yaw) * reach + Math.cos(yaw) * across, lz = z - Math.cos(yaw) * reach - Math.sin(yaw) * across;
        s.loot.push({ id: `loot-review-${i}`, kind, ...(weapon ? { weapon } : {}), rarity: weapon ? i % 4 : 0, x: lx, y: walkableHeight(lx, lz, deps.world), z: lz, active: true, respawnAt: 0 });
      });
    }
    if (name.startsWith('world-') && weaponReview) {
      s.loot.forEach(item => { item.active = false; });
      const lx = x - Math.sin(yaw) * 1.8, lz = z - Math.cos(yaw) * 1.8;
      s.loot.push({ id: 'painted-weapon-review', kind: 'weapon', weapon: weaponReview, rarity: 3,
        x: lx, y: terrainHeight(lx, lz), z: lz, active: true, respawnAt: 0 });
    }
    if (name.startsWith('swim')) {
      // Use the real island collision and water sampling, including the shore
      // transition. A guessed floating height would hide integration defects.
      const settle = (actor: typeof me) => {
        actor.yaw = 0;
        for (let i = 0; i < 60; i++) moveActor(actor, emptyInput(), deps.world, 1 / 60);
        if (!actor.swimming) throw new Error('O ponto de revisão precisa estar dentro do rio.');
        actor.wetUntil = s.time + 8;
      };
      settle(me);
      if (name === 'swimExit') {
        for (let i = 0; i < 300; i++) moveActor(me, { ...emptyInput(), moveZ: 1 }, deps.world, 1 / 60);
        if (me.swimming || !me.grounded) throw new Error('A revisão precisa sair do rio pela margem.');
        me.velocity = { x: 0, y: 0, z: 0 };
        const wet = structuredClone(me); wet.id = 'bot-qa-wet'; wet.name = 'Capivara'; wet.bot = true;
        wet.pos.x += 1; wet.pos.z += 2; wet.pos.y = terrainHeight(wet.pos.x, wet.pos.z); wet.yaw = 0;
        s.actors.push(wet);
      } else if (name === 'swimRemote') {
        const swimmer = structuredClone(me); swimmer.id = 'bot-qa-swimmer'; swimmer.name = 'Capivara'; swimmer.bot = true;
        swimmer.pos.x -= .5; swimmer.pos.z -= 2.2; swimmer.pos.y = terrainHeight(swimmer.pos.x, swimmer.pos.z);
        settle(swimmer); swimmer.yaw = Math.PI; swimmer.velocity.z = .8;
        s.actors.push(swimmer);
      }
      me.yaw = yaw; me.pitch = pitch;
    }
    const bounceTicks = name === 'trampolineAir' ? 20 : 5;
    if (trampoline) {
      const jumper = structuredClone(me); jumper.id = 'bot-qa-bounce'; jumper.name = 'Capivara'; jumper.bot = true;
      jumper.pos = { x: trampoline.x, y: trampoline.y, z: trampoline.z }; jumper.yaw = Math.PI / 2;
      // Consecutive review poses reuse this avatar. Preserve its launch sequence
      // so each real new bounce restarts the one-shot exactly once.
      jumper.bounceSeq = current?.actors.find(actor => actor.id === jumper.id)?.bounceSeq ?? 0;
      jumper.grounded = true; jumper.velocity = { x: 0, y: 0, z: 0 };
      s.actors.push(jumper);
    }
    if (name === 'results') {
      s.phase = 'results'; s.results = [{ id: me.id, name: me.name, color: me.color, bot: false, kills: 1, deaths: 0, damage: 100, place: 1, winner: true,
        shots: 3, hits: 1, headshots: 0, survived: 30, chests: 0, longestShot: 12.4 }];
    }
    if (name === 'results-correria') {
      // A lost Correria round: respawns mean everyone lasted the whole clock.
      s.phase = 'results'; s.config.mode = 'deathmatch';
      const row = (id: string, rowName: string, kills: number, deaths: number, place: number) => ({ id, name: rowName, color: id === me.id ? me.color : '#ae825e', bot: id !== me.id,
        kills, deaths, damage: kills * 95, place, winner: place === 1, shots: kills * 20, hits: kills * 9, headshots: kills, survived: 480, chests: id === me.id ? 2 : 0, longestShot: 41 });
      s.results = [row('bot-qa-1', 'Bento', 32, 20, 1), row(me.id, me.name, 26, 6, 2), row('bot-qa-2', 'Tico', 21, 14, 3)];
    }
    // The asset pipeline added match-specific avatar uploads after the initial
    // renderer warmup. Wait for those uploads before taking a fixed frame.
    const identities = JSON.stringify(s.actors.map(actor => [actor.id, actor.name, actor.color]));
    if (identities !== preparedIdentities) {
      const prepare = (renderer as GameRenderer & { prepareMatch?: (snapshot: WorldSnapshot) => Promise<void> }).prepareMatch;
      if (prepare) await prepare.call(renderer, s);
      preparedIdentities = identities;
    }
    current = s;
    deps.input.frame.yaw = yaw; deps.input.frame.pitch = pitch;
    for (let i = 0; i < 20; i++) renderer.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: 'practice', input: deps.input.frame, dt: .05, playing: true, spectateId: null }, i === 19);
    // A rapid pose switch can otherwise keep the preceding HUD and scope state.
    await new Promise(resolve => setTimeout(resolve, 80));
    deps.ui.scopeReady = renderer.scoped;
    if (HUD_POSES.includes(name)) {
      // Feed lines, a banner and (watching) the death card and watch bar, through the same calls a match makes.
      const at = { x: me.pos.x, y: me.pos.y, z: me.pos.z };
      deps.ui.update(s, 'practice', 0, false, 60, null);
      const kills: GameEvent[] = [
        { type: 'kill', id: 9001, actor: 'bot-hud-0', target: 'bot-hud-5', weapon: 'shotgun', from: at, distance: 9 },
        { type: 'kill', id: 9002, actor: 'practice', target: 'bot-hud-7', weapon: 'm4', from: at, distance: 47 },
        { type: 'kill', id: 9003, actor: null, target: 'bot-hud-9', weapon: 'storm' },
        { type: 'kill', id: 9004, actor: 'bot-hud-2', target: name === 'hud-watch' ? 'practice' : 'bot-hud-11', weapon: 'sniper', from: at, distance: 112 }];
      for (const event of kills) deps.ui.event(event);
      if (name === 'hud-full') deps.ui.event({ type: 'supply', id: 9005, drop: 'supply-1', pos: at, district: deps.world.districts[0]?.id ?? '', stage: 'incoming' });
      deps.ui.setSpectate(name === 'hud-watch' ? { target: 'bot-hud-2', hold: null, index: 1, count: 13 } : null);
      watchedPose = name === 'hud-watch';
      // The HUD refreshes at most every 75 ms: let the next update through.
      await new Promise(resolve => setTimeout(resolve, 90));
    } else if (watchedPose) { deps.ui.setSpectate(null); watchedPose = false; }
    deps.ui.update(s, 'practice', 0, false, 60, hudPrompt ? closestInteraction(deps.world, s, me, { id: '', name: '' }) : bath || supply ? closestInteraction(deps.world, s, me, { id: '', name: '' }) : null);
    deps.ui.frameCompass(renderer.heading);
    deps.ui.setPaused(name === 'pause');
    if (name === 'emote-wheel') deps.ui.openEmoteWheel();
    if (name === 'corrente-upgrade') {
      const upgrade = { type: 'upgrade' as const, id: 1, actor: me.id, weapon: CORRENTE_LADDER[level], level };
      renderer.event(upgrade); deps.ui.event(upgrade); draw();
    }
    if (supply) {
      const drop = s.supplyDrops[0], stage = name === 'supplyOpened' ? 'opened' : name === 'supplyLanded' ? 'landed' : 'incoming';
      const event = { type: 'supply', id: 3, drop: drop.id, pos: drop.pos, district: drop.district, stage } as const;
      renderer.event(event); deps.ui.event(event); draw();
    }
    if (trampoline) {
      // Warm the grounded actor above, then advance physics and presentation
      // together. A frozen rising snapshot would finish a one-shot during warmup.
      const jumper = s.actors.find(actor => actor.id === 'bot-qa-bounce')!;
      const initialBounce = jumper.bounceSeq;
      for (let i = 0; i < bounceTicks; i++) {
        const previous = jumper.bounceSeq;
        s.time += 1 / 60;
        moveActor(jumper, emptyInput(), deps.world, 1 / 60);
        if (jumper.bounceSeq !== previous)
          renderer.event({ type: 'bounce', id: 2, actor: jumper.id, pos: { x: trampoline.x, y: trampoline.y, z: trampoline.z } });
        renderer.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: 'practice', input: deps.input.frame,
          dt: 1 / 60, playing: true, spectateId: null }, i === bounceTicks - 1);
      }
      if (jumper.bounceSeq !== initialBounce + 1 || jumper.grounded || !jumper.bounceProtected)
        throw new Error('A revisão precisa lançar uma capivara pelo contato real do trampolim.');
    }
    if (name.startsWith('ads-') || name.startsWith('fp-')) {
      // Settle the weapon: draw, sway and the aim-down-sights blend run on real frame time.
      for (let i = 0; i < 45; i++) { s.time += 1 / 60; renderer.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: 'practice', input: deps.input.frame, dt: 1 / 60, playing: true, spectateId: null }, i === 44); }
    }
    if (name === 'cocoBlast') {
      // A real coconut impact 9 m ahead, rendered 0.15 s into the burst.
      const x = me.pos.x - Math.sin(yaw) * 7, z = me.pos.z - Math.cos(yaw) * 7;
      renderer.event({ type: 'impact', id: 3, actor: 'bot', weapon: 'coco', pos: { x, y: terrainHeight(x, z), z }, surface: 'dirt', normal: { x: 0, y: 1, z: 0 } });
      for (let i = 0; i < 9; i++) { s.time += 1 / 60; renderer.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: 'practice', input: deps.input.frame, dt: 1 / 60, playing: true, spectateId: null }, i === 8); }
    }
    if (!name.startsWith('results')) document.querySelector('#victory')?.remove();
    return { camera: renderer.cameraPosition, ...renderer.stats };
  }
  window.__capyQA = {
    async start() { renderer ||= await deps.begin(); },
    pose,
    event(event) { renderer?.event(event); deps.ui.event(event); },
    programChurn(frames) {
      const env = globalThis as { churnDetail?: boolean };
      const counts: Record<string, number> = {}, proto = THREE.Material.prototype, original = proto.customProgramCacheKey;
      const label = (material: THREE.Material) => `${material.type}:${material.name || '-'}:${material.uuid.slice(0, 4)}`;
      proto.customProgramCacheKey = function (this: THREE.Material) { counts[label(this)] = (counts[label(this)] ?? 0) + 1; return original.call(this); };
      const wrapped: [THREE.Material, () => string][] = [];
      const internals = renderer as unknown as { scene: THREE.Scene; weaponView: { scene: THREE.Scene } };
      for (const root of [internals.scene, internals.weaponView.scene]) root.traverse(object => {
        const materials = (object as THREE.Mesh).material; if (!materials) return;
        for (const material of Array.isArray(materials) ? materials : [materials]) if (Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey') && !wrapped.some(([m]) => m === material)) {
          const own = material.customProgramCacheKey; wrapped.push([material, own]);
          material.customProgramCacheKey = () => { counts[label(material)] = (counts[label(material)] ?? 0) + 1; return own.call(material); };
        }
      });
      try { for (let i = 0; i < frames; i++) draw(); } finally {
        proto.customProgramCacheKey = original;
        for (const [material, own] of wrapped) material.customProgramCacheKey = own;
      }
      // The kinds of mesh sharing each churning material (a shared material switching between them rebuilds).
      const users = new Map<string, Set<string>>();
      for (const root of [internals.scene, internals.weaponView.scene]) root.traverse(object => {
        const materials = (object as THREE.Mesh).material; if (!materials) return;
        const mesh = object as THREE.Mesh, kind = `${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 'skinned' : (mesh as THREE.InstancedMesh).isInstancedMesh ? 'instanced' : (mesh as THREE.BatchedMesh).isBatchedMesh ? 'batched' : mesh.type}` +
          `${mesh.geometry?.morphAttributes?.position ? '+morph' + mesh.geometry.morphAttributes.position.length : ''}${mesh.geometry?.attributes?.color ? '+color' + mesh.geometry.attributes.color.itemSize : ''}${root === internals.scene ? '' : '@fp'}` +
          (env.churnDetail ? `[${mesh.name}|${Object.keys(mesh.geometry?.attributes ?? {}).sort().join('+')}|${mesh.receiveShadow ? 'r' : ''}${mesh.castShadow ? 'c' : ''}|${(() => { const chain: string[] = []; let at = mesh.parent; while (at && chain.length < 4) { chain.push(at.name || at.type); at = at.parent; } return chain.join('<'); })()}]` : '');
        for (const material of Array.isArray(materials) ? materials : [materials]) { const key = label(material); if (!users.has(key)) users.set(key, new Set()); users.get(key)!.add(kind); }
      });
      const perFrame: [string, number][] = Object.entries(counts).map(([k, v]) => [`${k} (${[...(users.get(k) ?? [])].join(' ')})`, +(v / frames).toFixed(1)]);
      return Object.fromEntries(perFrame.sort((a, b) => b[1] - a[1]));
    },
    viewState() {
      const internals = renderer as unknown as { camera: THREE.PerspectiveCamera; weaponView: { scene: THREE.Scene } };
      const viewmodel: number[] = [];
      internals.weaponView.scene.traverse(object => { if ((object as THREE.Mesh).isMesh && object.visible && viewmodel.length < 16 * 24) viewmodel.push(...object.matrixWorld.elements); });
      return { camera: [...internals.camera.position.toArray(), ...internals.camera.quaternion.toArray()], viewmodel };
    },
    async motion(weapon, action, seconds, hz = 120) {
      if (!WEAPONS.includes(weapon) || !Number.isFinite(seconds) || seconds < 0 || seconds > 4) throw new Error('Invalid motion review');
      await pose(`fp-${weapon}`);
      const s = current!, me = s.actors.find(actor => actor.id === 'practice')!;
      const frame = (dt: number, draw = false, playing = true) => renderer!.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: me.id,
        input: deps.input.frame, dt, playing, spectateId: null, simulationTime: s.time }, draw);
      frame(0, false, false); // Reset transient motion, then establish a dry, still grip.
      for (let i = 0; i < 30; i++) frame(1 / 60);
      const advance = (duration: number) => {
        const end = s.time + duration; let elapsed = 0;
        while (elapsed < duration - 1e-8) {
          const dt = Math.min(1 / hz, duration - elapsed); elapsed += dt; s.time += dt;
          if ((action === 'reload' || action === 'reload-partial' || action === 'reload-chain') && me.reloadUntil > 0 && s.time >= me.reloadUntil) {
            if (action === 'reload-chain' && weapon === 'shotgun') {
              me.weapons[0].ammo++; me.weapons[0].reserve--;
              me.reloadUntil = me.weapons[0].ammo < WEAPON_DEFS.shotgun.magazine ? me.reloadUntil + WEAPON_DEFS.shotgun.reload : 0;
            } else {
              const loaded = weapon === 'shotgun' ? 1 : WEAPON_DEFS[weapon].magazine - me.weapons[0].ammo;
              me.reloadUntil = 0; me.weapons[0].ammo += loaded; me.weapons[0].reserve -= loaded;
            }
          }
          frame(dt);
        }
        s.time = end;
      };
      const swing = () => {
        const origin = { x: me.pos.x, y: me.pos.y + 1.55, z: me.pos.z };
        renderer!.event({ type: 'shot', id: 200 + (action.endsWith('left') ? 1 : 0), actor: me.id, weapon: 'machete', origin,
          end: { x: origin.x - Math.sin(me.yaw) * 1.7, y: origin.y, z: origin.z - Math.cos(me.yaw) * 1.7 },
          hit: action.startsWith('hit') });
      };
      if (action === 'reload' || action === 'reload-partial' || action === 'reload-chain') {
        me.weapons[0].ammo = action !== 'reload-partial' ? 0 : Math.max(1, Math.floor(WEAPON_DEFS[weapon].magazine / 2));
        me.reloadUntil = s.time + WEAPON_DEFS[weapon].reload;
      }
      else if (action === 'inspect') renderer!.inspectWeapon();
      else if (action === 'fire') {
        const origin = { x: me.pos.x, y: me.pos.y + 1.62, z: me.pos.z };
        renderer!.event({ type: 'shot', id: 300, actor: me.id, weapon, origin,
          end: { x: origin.x - Math.sin(me.yaw) * 30, y: origin.y, z: origin.z - Math.cos(me.yaw) * 30 }, hit: false });
      }
      else if (action === 'chop') {
        if (weapon !== 'machete') throw new Error('Chop review requires machete');
        swing(); advance(.6); swing(); advance(.6); swing();
      } else if (action.includes('right') || action.includes('left')) {
        if (weapon !== 'machete') throw new Error('Swing review requires machete');
        if (action.endsWith('left')) { swing(); advance(.6); }
        swing();
      } else if (action === 'sprint') { me.sprint = true; me.velocity.z = -7; }
      else if (action === 'ads') me.ads = true;
      else if (action === 'equip') {
        me.weapons.push({ id: weapon === 'pistol' ? 'm4' : 'pistol', rarity: 0, ammo: 12, reserve: 30, box: 1 }); me.slot = 1;
      } else if (action === 'land') {
        me.grounded = false; me.velocity.y = -10; frame(1 / 60);
        me.grounded = true; me.velocity.y = 0;
      }
      advance(seconds);
      if ((action === 'reload' || action === 'reload-partial') && seconds >= WEAPON_DEFS[weapon].reload) {
        // Complete the displayed fixture too. These strips review the pose;
        // authoritative inventory completion has separate simulation intents.
        me.reloadUntil = 0; me.weapons[0].ammo = weapon === 'shotgun' ? 1 : WEAPON_DEFS[weapon].magazine;
        me.weapons[0].reserve -= me.weapons[0].ammo;
      }
      frame(0, true);
      // The game HUD deliberately updates at a lower cadence. Let the pose's
      // earlier HUD write expire before capturing this action's ammo/progress.
      await new Promise(resolve => setTimeout(resolve, 80));
      deps.ui.update(s, me.id, 0, false, 60, null);
    },
    async tpMotion(weapon, action, seconds) {
      await pose(`tp-${weapon}`);
      const s = current!, bot = s.actors.find(actor => actor.id === 'bot-qa')!;
      // Review on the open, level campinho pitch, facing -x.
      bot.pos = { x: 84, y: terrainHeight(84, -58), z: -58 }; bot.yaw = Math.PI / 2;
      bot.weapons = [{ id: weapon, ammo: 10, reserve: 30, rarity: 0, box: 0 }]; bot.slot = 0;
      const speed = action === 'run' ? 6.4 : action === 'crouch' ? 2.1 : ['walk', 'strafe', 'backpedal'].includes(action) ? 3.9 : 0;
      bot.sprint = action === 'run'; bot.crouch = action === 'crouch';
      const heading = bot.yaw + (action === 'strafe' ? Math.PI / 2 : action === 'backpedal' ? Math.PI : 0);
      const dir = { x: -Math.sin(heading), z: -Math.cos(heading) };
      const start = { ...bot.pos };
      if (action === 'reload' || action === 'reload-partial') {
        bot.weapons[0].ammo = action === 'reload' ? 0 : Math.max(1, Math.floor(WEAPON_DEFS[weapon].magazine / 2));
        bot.reloadUntil = s.time + WEAPON_DEFS[weapon].reload;
      }
      if (action === 'slash' || action === 'slash-left' || action === 'chop') {
        if (weapon !== 'machete') throw new Error('Cut review requires machete');
        const update = () => renderer!.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: 'practice', input: deps.input.frame, dt: 0, playing: true, spectateId: null, simulationTime: s.time }, false);
        bot.weapons[0].id = 'pistol'; update(); bot.weapons[0].id = 'machete'; update();
        const origin = { x: bot.pos.x, y: bot.pos.y + 1.55, z: bot.pos.z };
        for (let i = 0; i < (action === 'chop' ? 3 : action === 'slash-left' ? 2 : 1); i++) {
          renderer!.event({ type: 'shot', id: 910 + i, actor: bot.id, weapon: 'machete', origin,
            end: { x: origin.x - 1.7, y: origin.y, z: origin.z }, hit: false });
        }
      }
      if (action === 'jump') { bot.grounded = false; bot.velocity.y = 6; }
      const step = 1 / 60;
      let hurt = false;
      for (let t = 0; t < seconds - 1e-6; t += step) {
        s.time += step;
        if (speed) {
          // The actor slides in place on a treadmill so the camera frames it; animation reads velocity.
          bot.velocity.x = dir.x * speed; bot.velocity.z = dir.z * speed;
          bot.pos = { ...start };
        }
        if (action === 'jump') {
          bot.velocity.y -= 20 * step; bot.pos = { ...bot.pos, y: bot.pos.y + bot.velocity.y * step };
          if (bot.pos.y <= start.y) { bot.pos.y = start.y; bot.grounded = true; bot.velocity.y = 0; }
        }
        if (action === 'death' && bot.alive && t > .05) {
          bot.alive = false; bot.hp = 0;
          renderer!.event({ type: 'kill', id: 900, actor: 'practice', target: bot.id, weapon: 'm4', head: false } as never);
        }
        if (action === 'hit' && !hurt && t > .05) {
          hurt = true;
          renderer!.event({ type: 'damage', id: 901, actor: 'practice', target: bot.id, amount: 30, head: false, pos: bot.pos } as never);
        }
        renderer!.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: 'practice', input: deps.input.frame, dt: step, playing: true, spectateId: null, simulationTime: s.time }, false);
      }
      renderer!.update({ frameBudgetMs: QA_BUDGET, snapshot: s, playerId: 'practice', input: deps.input.frame, dt: 0, playing: true, spectateId: null, simulationTime: s.time }, true);
    },
    quality(quality) { if (!renderer) throw new Error('Call start first'); deps.settings.graphics = quality; renderer.setSettings(deps.settings); draw(); },
    density(ratio) {
      for (const name of Object.keys(PRESET_DENSITY) as Quality[]) PRESET_DENSITY[name] = ratio === null ? { ...shippedDensity[name] } : { min: ratio, max: ratio };
      this.quality(deps.settings.graphics);
    },
    actors(count, positions) { if (!Number.isInteger(count) || count < 1 || count > 16) throw new Error('Expected 1 to 16 actors'); actorCount = count; actorPositions = positions ?? []; },
    loading(on) { deps.ui.setLoading(on); },
    loop(on) {
      if (on === looping) return;
      looping = on;
      if (on) pendingFrame = requestAnimationFrame(tick);
      else if (pendingFrame !== null) { cancelAnimationFrame(pendingFrame); pendingFrame = null; }
    },
    stats() { return { ...(renderer?.stats || { drawCalls: 0, triangles: 0 }), renderedFrames }; },
    async bench(frames) {
      // A 1-pixel read waits for the GPU, so each sample is a whole frame, free of vsync.
      // A timer query, where the browser exposes one, isolates the GPU share from CPU load.
      const gl = document.querySelector('canvas')!.getContext('webgl2')!, pixel = new Uint8Array(4), samples: number[] = [], gpu: number[] = [];
      const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      // Pass and frame timing would open their own queries inside this frame's query.
      gpuPasses.suspended = true; gpuFrameTimer.suspended = true;
      try {
        draw(); sync();
        const queries: WebGLQuery[] = [];
        for (let i = 0; i < frames; i++) {
          const query = timer ? gl.createQuery() : null, started = performance.now();
          if (query) { gl.beginQuery(timer!.TIME_ELAPSED_EXT, query); queries.push(query); }
          draw();
          // ANGLE Metal times only command buffers committed while the query is open: complete the frame first.
          sync();
          if (query) gl.endQuery(timer!.TIME_ELAPSED_EXT);
          samples.push(performance.now() - started);
        }
        // Results arrive a little after completion; a disjoint event voids the batch.
        for (let wait = 0; wait < 40 && queries.some(query => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)); wait++)
          await new Promise(resolve => setTimeout(resolve, 25));
        const disjoint = timer ? gl.getParameter(timer.GPU_DISJOINT_EXT) : true;
        for (const query of queries) {
          if (!disjoint && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(query);
        }
        const at = (values: number[], q: number) => values.length ? values.sort((a, b) => a - b)[Math.floor(values.length * q)] : null;
        return { medianMs: at(samples, .5)!, p90Ms: at(samples, .9)!, gpuMedianMs: at(gpu, .5), gpuP90Ms: at(gpu, .9) };
      } finally { gpuPasses.suspended = false; gpuFrameTimer.suspended = false; }
    },
    async passes(frames) {
      if (!gpuPasses.supported) throw new Error('Open the page with ?gpu=1 on a browser with timer queries');
      const gl = document.querySelector('canvas')!.getContext('webgl2')!, pixel = new Uint8Array(4);
      draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      await gpuPasses.drain(); gpuPasses.reset(); gpuPasses.calibrate(); gpuPasses.sync = true;
      try { for (let i = 0; i < frames; i++) { draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); } await gpuPasses.drain(); }
      finally { gpuPasses.sync = false; }
      const summary = gpuPasses.summary(); gpuPasses.reset(); return summary;
    },
    async ab(toggle, frames, rounds) {
      if (!renderer) throw new Error('Call start first');
      const internals = renderer as unknown as { scene: THREE.Scene; gl: THREE.WebGLRenderer; worldView: { water: THREE.Object3D; group: THREE.Group }; weaponView: { scene: THREE.Scene }; sky: { group: THREE.Group };
        interiorLight: THREE.PointLight; pipeline: { atmosphere: { enabled: boolean } | null } };
      const scene = internals.scene, named = (test: (object: THREE.Object3D) => boolean) => {
        const found: THREE.Object3D[] = []; scene.traverse(object => { if (object.visible && test(object)) found.push(object); }); return found; };
      const materialName = (object: THREE.Object3D) => ((object as THREE.Mesh).material as THREE.Material | undefined)?.name ?? '';
      const hide = (objects: THREE.Object3D[]) => ({ apply: () => objects.forEach(o => { o.visible = false; }), revert: () => objects.forEach(o => { o.visible = true; }) });
      const basic = new THREE.MeshBasicMaterial({ color: '#888888' });
      const toggles: Record<string, () => { apply(): void; revert(): void }> = {
        terrain: () => hide(named(o => materialName(o) === 'paint:terrain')),
        vegetation: () => hide(named(o => o.name === 'vegetation-root' || o.name === 'ground-cover')),
        groundCover: () => hide(named(o => o.name === 'ground-cover')),
        trees: () => hide(named(o => o.name === 'vegetation-root')),
        kit: () => hide(named(o => o.name === 'Ilha_modular')),
        characters: () => hide(named(o => o.name.startsWith('Capivara_'))),
        water: () => hide(named(o => o === internals.worldView.water || materialName(o).includes('water'))),
        backdrop: () => hide(named(o => o.name === 'Ilhas distantes')),
        sky: () => hide([internals.sky.group]),
        streets: () => hide(named(o => o.name === 'vida-das-ruas')),
        firstPerson: () => hide(internals.weaponView.scene.children.filter(child => child.visible)),
        shading: () => ({ apply: () => { scene.overrideMaterial = basic; }, revert: () => { scene.overrideMaterial = null; } }),
        shadows: () => ({ apply: () => { internals.gl.shadowMap.enabled = false; }, revert: () => { internals.gl.shadowMap.enabled = true; } }),
        pointLight: () => hide([internals.interiorLight]),
        atmosphere: () => ({ apply: () => { if (internals.pipeline.atmosphere) internals.pipeline.atmosphere.enabled = false; },
          revert: () => { if (internals.pipeline.atmosphere) internals.pipeline.atmosphere.enabled = true; } }),
        fpFur: () => { const shells: THREE.Object3D[] = []; internals.weaponView.scene.traverse(o => { if (o.visible && (o as THREE.Mesh).geometry?.userData.shellIndices) shells.push(o); }); return hide(shells); },
        characterFur: () => hide(named(o => (o as THREE.Mesh).geometry?.userData.shellIndices !== undefined || o.name.includes('fur'))),
        treesAfter: () => { const trees = named(o => o.name === 'vegetation-root'), meshes: THREE.Object3D[] = [];
          trees.forEach(root => root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o); }));
          return { apply: () => meshes.forEach(o => { o.renderOrder = .25; }), revert: () => meshes.forEach(o => { o.renderOrder = 0; }) }; },
        treesSorted: () => { const batches: THREE.BatchedMesh[] = []; scene.traverse(o => { if ((o as THREE.BatchedMesh).isBatchedMesh && o.name === 'vegetation') batches.push(o as THREE.BatchedMesh); });
          return { apply: () => batches.forEach(o => { o.sortObjects = true; }), revert: () => batches.forEach(o => { o.sortObjects = false; }) }; },
        terrainLast: () => { const ground = named(o => materialName(o) === 'paint:terrain');
          return { apply: () => ground.forEach(o => { o.renderOrder = .5; }), revert: () => ground.forEach(o => { o.renderOrder = 0; }) }; },
      };
      if (!toggles[toggle]) throw new Error(`Unknown toggle ${toggle}: ${Object.keys(toggles).join(', ')}`);
      const change = toggles[toggle]();
      const results: { base: number; without: number }[] = [];
      // One unmeasured round compiles any program the toggle needs.
      change.apply(); await this.bench(2); change.revert();
      for (let round = 0; round < rounds; round++) {
        const base = (await this.bench(frames)).gpuMedianMs ?? NaN;
        change.apply();
        try { results.push({ base, without: (await this.bench(frames)).gpuMedianMs ?? NaN }); } finally { change.revert(); }
      }
      const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];
      const costs = results.map(r => r.base - r.without);
      return { toggle, baseMs: +median(results.map(r => r.base)).toFixed(2), withoutMs: +median(results.map(r => r.without)).toFixed(2),
        costMs: +median([...costs]).toFixed(2), rounds: costs.map(n => +n.toFixed(2)) };
    },
    names: () => names,
    buildings: () => deps.world.pieces!.filter(piece => KIT_PIECES[piece.piece].traversal)
      .map(piece => ({ id: piece.id, piece: piece.piece, role: buildingRole(piece) })),
    async walkBuilding(pieceId, direction = 'up') {
      if (!renderer) throw new Error('Call start first');
      if (looping) throw new Error('Stop the QA loop before walking a building');
      await pose('houseGround');
      const piece = deps.world.pieces!.find(piece => piece.id === pieceId);
      if (!piece) throw new Error(`Unknown building: ${pieceId}`);
      const access = KIT_PIECES[piece.piece].traversal;
      if (!access) throw new Error(`No generated access contract: ${pieceId}`);
      const upper = access.floors.find(floor => floor.id === 'upper-room') ?? [...access.floors].sort((a, b) => b.y - a.y)[0];
      placedRoutes ??= placedBuildingRoutes(deps.world, current!.actors[0]);
      const groundRoute = placedRoutes.get(`${piece.id}/${upper.id}`);
      if (!groundRoute) throw new Error(`No ground route to ${pieceId}/${upper.id}`);
      const route = [...groundRoute];
      if (direction === 'down') route.reverse();
      const me = current!.actors[0], frames: typeof me[] = [];
      let ticks = 0;
      const result = walkTraversal(deps.world, me, route, actor => {
        if (++ticks % 3 === 0) frames.push(structuredClone(actor));
      });
      if (!result.ok) throw new Error(`${pieceId} ${direction}: ${result.reason}`);
      frames.push(result.actor);
      for (const actor of frames) {
        Object.assign(me, actor); me.pitch = -.08;
        current!.time += 3 / 60;
        deps.input.frame.yaw = me.yaw; deps.input.frame.pitch = me.pitch;
        renderer.update({ frameBudgetMs: QA_BUDGET, snapshot: current!, playerId: me.id, input: deps.input.frame,
          dt: 3 / 60, playing: true, spectateId: null });
        renderedFrames++;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      return { ok: true, ticks: result.ticks, position: { ...me.pos } };
    },
  };
}
