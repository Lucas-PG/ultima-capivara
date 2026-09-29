import { Simulation } from '../../src/simulation';
import { terrainHeight } from '../../src/shared/terrain';
import { moveActor } from '../../src/shared/collision';
import { emptyInput, rng } from '../../src/shared/math';
import { EMOTES, EMOTE_IDS } from '../../src/shared/emotes';
import { closestInteraction } from '../../src/shared/interaction';
import { mudBathAt } from '../../src/shared/recreation';
import { chooseSupplyLanding, SUPPLY_APPROACH_SECONDS, SUPPLY_DESCENT_SECONDS } from '../../src/shared/supply-drops';
import { walkableHeight, walkableSegment } from '../../src/shared/navigation';
import { KIT_PIECES } from '../../src/shared/kit-collision';
import { buildingPoint, routesToFloor } from '../helpers/building-paths';
import { walkTraversal } from '../helpers/traversal-probe';
import { placedBuildingRoutes } from '../helpers/placed-building-routes';
import { buildingRole, buildingRooms, roomVariant } from '../../src/shared/building-interiors';
import { waterAt } from '../../src/shared/water';
import { CORRENTE_LADDER, WEAPONS as WEAPON_DEFS } from '../../src/shared/weapons';
import { DEFAULT_CONFIG, PLAYER_COLORS, type InputFrame, type Settings, type Vec3, type WeaponId, type WorldSnapshot, type WorldSpec } from '../../src/shared/types';
import type { GameRenderer } from '../../src/render/renderer';
import type { GameUI } from '../../src/ui/ui';
import type { InputController } from '../../src/input';

type Quality = Settings['graphics'];
type QaApi = {
  start(): Promise<void>;
  pose(name: string): Promise<{ camera: { x: number; y: number; z: number }; drawCalls: number; triangles: number }>;
  quality(quality: Quality): void;
  actors(count: number): void;
  loading(on: boolean): void;
  loop(on: boolean): void;
  stats(): { drawCalls: number; triangles: number; renderedFrames: number };
  names(): string[];
  motion(weapon: WeaponId, action: 'reload' | 'reload-partial' | 'inspect' | 'swing-right' | 'swing-left' | 'hit-right' | 'hit-left' | 'equip' | 'sprint' | 'ads' | 'land' | 'fire', seconds: number): Promise<void>;
  buildings(): { id: string; piece: string; role: string }[];
  tpMotion(weapon: WeaponId, action: 'run' | 'walk' | 'strafe' | 'backpedal' | 'reload' | 'death' | 'crouch' | 'jump' | 'idle' | 'hit', seconds: number): Promise<void>;
  walkBuilding(pieceId: string, direction?: 'up' | 'down'): Promise<{ ok: boolean; ticks: number; position: { x: number; y: number; z: number } }>;
};

declare global { interface Window { __capyQA?: QaApi } }

const WEAPONS: WeaponId[] = ['pistol', 'revolver', 'smg', 'm4', 'shotgun', 'coco', 'dmr', 'sniper', 'machete'];
const MUD_POSES = ['mudPrompt', 'mudSoak', 'mudFull'];
const TRAMPOLINE_POSES = ['trampolineBounce', 'trampolineAir'];
const SUPPLY_POSES = ['supplyIncoming', 'supplyDescending', 'supplyLanded', 'supplyOpened'];
const BUILDING_POSES = ['houseGround', 'houseStairBottom', 'houseStairTop', 'houseUpper'];
const ACCESS_POSES = ['fortStairBottom', 'fortStairTop', 'fortWallNorth', 'lighthouseGround',
  'lighthouseStairBottom', 'lighthouseStairTop', 'lighthouseBalcony', 'dockStairBottom', 'dockStairTop', 'dockPorto', 'dockMangue'];
const ROOM_POSES = ['home', 'bakery', 'cafe', 'tailor', 'clinic', 'fisher', 'fishmonger', 'workshop', 'kiosk',
  'church', 'market_hall', 'warehouse', 'beach_kiosk', 'barracks',
  'upper-home', 'upper-tailor', 'upper-clinic', 'upper-workshop', 'upper-barracks',
  'home-0', 'home-1', 'home-2', 'upper-home-0', 'upper-home-1', 'upper-home-2', 'home-back', 'cafe-back', 'upper-home-back'].map(role => `room-${role}`);
const VIEWS: Record<string, [number, number, number, number]> = {
  plaza: [-1, -10, .48, .02], bakery: [-43, -36, Math.PI, .02],
  river: [4, 22, .28, -.03], forteBeach: [60, -86, 1.13, .24],
  fortApproach: [4, -62, 0, .2], morroApproach: [-54, -38, Math.PI / 2, .2],
  quayNorth: [-13, .3, Math.PI, -.55], quaySouth: [27, 23.5, 0, -.55],
  bathVila: [19, 31, 0, -.13], bathFazenda: [55, 51, Math.PI / 2, -.28], bathMangue: [108, 63, Math.PI / 2, -.2],
  trampolineVila: [18, -7, -Math.PI / 2, -.13], trampolineForte: [51, -101, Math.atan2(-4, 6), -.13],
  trampolinePraia: [-38, 101, Math.PI, -.13],
  vilaStreet: [-40, -38, Math.PI - .3, .03],
  capyFront: [-1, -10, 0, 0], capySide: [-1, -10, 0, 0],
  redentoraVila: [-6, -26, 1.62, .1], redentoraNear: [-70, -40, 1.95, .22], redentoraPlinth: [-97, -29, 1.95, .5],
  morroStreet: [-97, -45, 0, .12], morroRoofs: [-75, -40, 2.2, .05], lajeRoof: [-58, -54, 0, -.1], varandaFazenda: [47, 52, 0, .02],
  sobradoPlaza: [-20, -21, 2.3, .15], clinicSobrado: [6, -4, 0, .18],
  swimWaterline: [-60, 2, 0, .04], swimRemote: [-60, 2, 0, .04], swimExit: [-60, 2, Math.PI, .12],
};
const DISTRICT_VIEWS: Record<string, [number, number, number, number]> = {
  vila: [-1, -10, .48, .02], centro: [36, -6, .42, .02],
  forte: [4, -80, 0, .12], cachoeira: [-83, -13, 1.72, .08],
  morro: [-97, -66, Math.atan2(-2, -31), .08], porto: [78, -23, -1.84, 0],
  posto: [-22, 38, Math.PI, 0], farol: [3, 98, Math.PI, .25],
  praia: [-31, 95, Math.PI, 0], fazenda: [47, 80, -.63, 0],
  mangue: [86, 54, -1.2, 0], lagoa: [-65, 9, 1.22, .04],
};

export function installQa(deps: { world: WorldSpec; ui: GameUI; input: InputController; settings: Settings; begin(): Promise<GameRenderer> }) {
  const fixture = new Simulation(deps.world, { ...DEFAULT_CONFIG, bots: false },
    [{ id: 'practice', name: 'Capivara', color: '#bd8956', ready: true, connected: true }], 'qa-seed-2026', 0x5eed2026);
  const base = fixture.snapshot();
  let renderer: GameRenderer | null = null, current: WorldSnapshot | null = null, looping = false, actorCount = 1, renderedFrames = 0;
  let pendingFrame: number | null = null;
  let preparedIdentities = '';
  let placedRoutes: Map<string, Vec3[]> | undefined;
  const names = [...Object.keys(VIEWS), 'cocoBlast', ...WEAPONS.flatMap(id => [`fp-${id}`, `ads-${id}`, `tp-${id}`, `world-${id}`]), ...EMOTE_IDS.map(id => `emote-${id}`), 'emote-wheel', 'scope',
    ...CORRENTE_LADDER.map(id => `corrente-${id}`), 'corrente-upgrade', ...MUD_POSES, ...TRAMPOLINE_POSES, ...SUPPLY_POSES, ...BUILDING_POSES, ...ACCESS_POSES, ...ROOM_POSES,
    ...deps.world.districts.map(d => `district-${d.id}`), ...deps.world.districts.map(d => `spawn-${d.id}`), 'hud', 'pause', 'results'];

  function draw() {
    if (!renderer || !current) return;
    renderer.update({ snapshot: current, playerId: 'practice', input: deps.input.frame as InputFrame,
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
    const view = trampoline ? [trampoline.x - 7, trampoline.z, -Math.PI / 2, .12] : bath ? [bath.x, bath.z, 0, name === 'mudPrompt' ? -.5 : 0] : spawn ? [spawn.x, spawn.z, spawn.yaw, .04] : district ? DISTRICT_VIEWS[district.id] || [district.x - 8, district.z + 8, -.7, 0] : VIEWS[name.startsWith('tp-') ? 'capySide' : /^(fp|ads)-/.test(name) ? 'vilaStreet' : name === 'cocoBlast' ? 'plaza' : name] || VIEWS.plaza;
    if (!names.includes(name)) throw new Error(`Unknown pose: ${name}`);
    let [x, z, yaw, pitch] = view;
    if (name.startsWith('world-')) pitch = -.5;
    const s = structuredClone(base), me = s.actors[0];
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
      const observer = (close ? [2.4] : [18, 16, 20]).flatMap(distance =>
        [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz]) => {
          const x = supply.x + dx * distance, z = supply.z + dz * distance;
          return { x, y: terrainHeight(x, z), z };
        })).find(to => {
        // Check the actual prompt and eye-to-crate LOS, not only a walkable path.
        const actor = { ...base.actors[0], pos: to, stage: 'ground' as const, grounded: true };
        const interaction = closestInteraction(deps.world, prospective, actor, { id: '', name: '' });
        return !waterAt(to.x, to.z) && walkableSegment(deps.world, supply, to) &&
          (close ? interaction?.id === drop.id : !interaction);
      });
      if (!observer) throw new Error('A câmera da entrega precisa de uma aproximação livre.');
      x = observer.x; z = observer.z;
      // At the middle of its approach the eastbound carrier is still 30 m
      // behind the landing point. The observer remains on the same dry ground.
      const targetX = supply.x - (name === 'supplyIncoming' ? SUPPLY_APPROACH_SECONDS / 2 * 12 : 0);
      yaw = Math.atan2(x - targetX, z - supply.z);
      pitch = Math.atan2(supply.y + (close ? .5 : name === 'supplyIncoming' ? 34 : 14) - terrainHeight(x, z) - 1.62,
        Math.hypot(x - targetX, z - supply.z));
      drop.opened = name === 'supplyOpened';
      if (name === 'supplyOpened') s.loot.push({ id: 'supply-qa-weapon', kind: 'weapon', weapon: 'm4', rarity: 3, active: true, respawnAt: 0,
        x: supply.x - .9, y: terrainHeight(supply.x - .9, supply.z), z: supply.z, from: { ...supply, y: supply.y + .6 }, spawnedAt: s.time - .7 });
    }
    me.pos = { x, y: bath?.y ?? spawn?.y ?? terrainHeight(x, z), z }; me.velocity = { x: 0, y: 0, z: 0 };
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
    me.ads = name === 'scope' || name.startsWith('ads-'); me.weapons = [{ id: name === 'scope' ? 'sniper' : weaponReview || 'pistol', ammo: 12, reserve: 50, rarity: 0, box: 0 }];
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
      const bx = x + Math.cos(angle) * radius, bz = z + Math.sin(angle) * radius;
      bot.pos = { x: bx, y: terrainHeight(bx, bz), z: bz }; bot.yaw = angle + Math.PI;
      s.actors.push(bot);
    }
    if (name === 'capyFront' || name === 'capySide' || name.startsWith('tp-')) {
      const bot = structuredClone(me); bot.id = 'bot-qa'; bot.name = 'Capivara'; bot.bot = true;
      bot.pos = { x, y: me.pos.y, z: z - 2 }; bot.yaw = name === 'capyFront' ? Math.PI : Math.PI / 2;
      s.actors.push(bot);
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
    for (let i = 0; i < 20; i++) renderer.update({ snapshot: s, playerId: 'practice', input: deps.input.frame, dt: .05, playing: true, spectateId: null }, i === 19);
    deps.ui.update(s, 'practice', 0, false, 60, bath || supply ? closestInteraction(deps.world, s, me, { id: '', name: '' }) : null);
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
        renderer.update({ snapshot: s, playerId: 'practice', input: deps.input.frame,
          dt: 1 / 60, playing: true, spectateId: null }, i === bounceTicks - 1);
      }
      if (jumper.bounceSeq !== initialBounce + 1 || jumper.grounded || !jumper.bounceProtected)
        throw new Error('A revisão precisa lançar uma capivara pelo contato real do trampolim.');
    }
    if (name.startsWith('ads-') || name.startsWith('fp-')) {
      // Settle the weapon: draw, sway and the aim-down-sights blend run on real frame time.
      for (let i = 0; i < 45; i++) { s.time += 1 / 60; renderer.update({ snapshot: s, playerId: 'practice', input: deps.input.frame, dt: 1 / 60, playing: true, spectateId: null }, i === 44); }
    }
    if (name === 'cocoBlast') {
      // A real coconut impact 9 m ahead, rendered 0.15 s into the burst.
      const x = me.pos.x - Math.sin(yaw) * 7, z = me.pos.z - Math.cos(yaw) * 7;
      renderer.event({ type: 'impact', id: 3, actor: 'bot', weapon: 'coco', pos: { x, y: terrainHeight(x, z), z }, surface: 'dirt', normal: { x: 0, y: 1, z: 0 } });
      for (let i = 0; i < 9; i++) { s.time += 1 / 60; renderer.update({ snapshot: s, playerId: 'practice', input: deps.input.frame, dt: 1 / 60, playing: true, spectateId: null }, i === 8); }
    }
    if (name !== 'results') document.querySelector('#victory')?.remove();
    return { camera: renderer.cameraPosition, ...renderer.stats };
  }
  window.__capyQA = {
    async start() { renderer ||= await deps.begin(); },
    pose,
    async motion(weapon, action, seconds) {
      if (!WEAPONS.includes(weapon) || !Number.isFinite(seconds) || seconds < 0 || seconds > 4) throw new Error('Invalid motion review');
      await pose(`fp-${weapon}`);
      const s = current!, me = s.actors.find(actor => actor.id === 'practice')!;
      const frame = (dt: number, draw = false, playing = true) => renderer!.update({ snapshot: s, playerId: me.id,
        input: deps.input.frame, dt, playing, spectateId: null, simulationTime: s.time }, draw);
      frame(0, false, false); // Reset transient motion, then establish a dry, still grip.
      for (let i = 0; i < 30; i++) frame(1 / 60);
      const advance = (duration: number) => {
        const end = s.time + duration; let elapsed = 0;
        while (elapsed < duration - 1e-8) {
          const dt = Math.min(1 / 120, duration - elapsed); elapsed += dt; s.time += dt; frame(dt);
        }
        s.time = end;
      };
      const swing = () => {
        const origin = { x: me.pos.x, y: me.pos.y + 1.55, z: me.pos.z };
        renderer!.event({ type: 'shot', id: 200 + (action.endsWith('left') ? 1 : 0), actor: me.id, weapon: 'machete', origin,
          end: { x: origin.x - Math.sin(me.yaw) * 1.7, y: origin.y, z: origin.z - Math.cos(me.yaw) * 1.7 },
          hit: action.startsWith('hit') });
      };
      if (action === 'reload' || action === 'reload-partial') {
        me.weapons[0].ammo = action === 'reload' ? 0 : Math.max(1, Math.floor(WEAPON_DEFS[weapon].magazine / 2));
        me.reloadUntil = s.time + WEAPON_DEFS[weapon].reload;
      }
      else if (action === 'inspect') renderer!.inspectWeapon();
      else if (action === 'fire') {
        const origin = { x: me.pos.x, y: me.pos.y + 1.62, z: me.pos.z };
        renderer!.event({ type: 'shot', id: 300, actor: me.id, weapon, origin,
          end: { x: origin.x - Math.sin(me.yaw) * 30, y: origin.y, z: origin.z - Math.cos(me.yaw) * 30 }, hit: false });
      }
      else if (action.includes('right') || action.includes('left')) {
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
      if (action === 'reload') bot.reloadUntil = s.time + WEAPON_DEFS[weapon].reload;
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
        renderer!.update({ snapshot: s, playerId: 'practice', input: deps.input.frame, dt: step, playing: true, spectateId: null, simulationTime: s.time }, false);
      }
      renderer!.update({ snapshot: s, playerId: 'practice', input: deps.input.frame, dt: 0, playing: true, spectateId: null, simulationTime: s.time }, true);
    },
    quality(quality) { if (!renderer) throw new Error('Call start first'); deps.settings.graphics = quality; renderer.setSettings(deps.settings); draw(); },
    actors(count) { if (!Number.isInteger(count) || count < 1 || count > 16) throw new Error('Expected 1 to 16 actors'); actorCount = count; },
    loading(on) { deps.ui.setLoading(on); },
    loop(on) {
      if (on === looping) return;
      looping = on;
      if (on) pendingFrame = requestAnimationFrame(tick);
      else if (pendingFrame !== null) { cancelAnimationFrame(pendingFrame); pendingFrame = null; }
    },
    stats() { return { ...(renderer?.stats || { drawCalls: 0, triangles: 0 }), renderedFrames }; },
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
        renderer.update({ snapshot: current!, playerId: me.id, input: deps.input.frame,
          dt: 3 / 60, playing: true, spectateId: null });
        renderedFrames++;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      return { ok: true, ticks: result.ticks, position: { ...me.pos } };
    },
  };
}
