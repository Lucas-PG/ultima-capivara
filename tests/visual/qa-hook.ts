import { Simulation } from '../../src/simulation';
import { terrainHeight } from '../../src/shared/terrain';
import { moveActor } from '../../src/shared/collision';
import { emptyInput } from '../../src/shared/math';
import { EMOTES, EMOTE_IDS } from '../../src/shared/emotes';
import { CORRENTE_LADDER, WEAPONS as WEAPON_DEFS } from '../../src/shared/weapons';
import { DEFAULT_CONFIG, PLAYER_COLORS, type InputFrame, type Settings, type WeaponId, type WorldSnapshot, type WorldSpec } from '../../src/shared/types';
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
};

declare global { interface Window { __capyQA?: QaApi } }

const WEAPONS: WeaponId[] = ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'slingshot'];
const VIEWS: Record<string, [number, number, number, number]> = {
  plaza: [-1, -10, .48, .02], bakery: [-43, -36, Math.PI, .02],
  river: [4, 22, .28, -.03], forteBeach: [60, -86, 1.13, .24],
  quayNorth: [-13, .3, Math.PI, -.55], quaySouth: [27, 23.5, 0, -.55],
  bathVila: [19, 31, 0, -.13], bathFazenda: [55, 51, Math.PI / 2, -.28], bathMangue: [108, 63, Math.PI / 2, -.2],
  trampolineVila: [18, -7, -Math.PI / 2, -.13], trampolineForte: [51, -101, Math.atan2(-4, 6), -.13],
  trampolinePraia: [-38, 101, Math.PI, -.13],
  vilaStreet: [-40, -38, Math.PI - .3, .03],
  capyFront: [-1, -10, 0, 0], capySide: [-1, -10, 0, 0],
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
  let preparedIdentities = '';
  const names = [...Object.keys(VIEWS), ...WEAPONS.map(id => `fp-${id}`), ...EMOTE_IDS.map(id => `emote-${id}`), 'emote-wheel', 'scope',
    ...CORRENTE_LADDER.map(id => `corrente-${id}`), 'corrente-upgrade',
    ...deps.world.districts.map(d => `district-${d.id}`), ...deps.world.districts.map(d => `spawn-${d.id}`), 'hud', 'pause', 'results'];

  function draw() {
    if (!renderer || !current) return;
    renderer.update({ snapshot: current, playerId: 'practice', input: deps.input.frame as InputFrame,
      dt: looping ? 1 / 60 : 0, playing: true, spectateId: null });
    renderedFrames++;
  }
  function tick() { if (!looping) return; draw(); requestAnimationFrame(tick); }
  async function pose(name: string) {
    if (!renderer) throw new Error('Call start first');
    deps.ui.closeEmoteWheel();
    const district = name.startsWith('district-') ? deps.world.districts.find(d => `district-${d.id}` === name) : null;
    const spawn = name.startsWith('spawn-') ? deps.world.spawns.find(point => `spawn-${point.district}` === name) : null;
    const view = spawn ? [spawn.x, spawn.z, spawn.yaw, .04] : district ? DISTRICT_VIEWS[district.id] || [district.x - 8, district.z + 8, -.7, 0] : VIEWS[name] || VIEWS.plaza;
    if (!names.includes(name)) throw new Error(`Unknown pose: ${name}`);
    const [x, z, yaw, pitch] = view;
    const s = structuredClone(base), me = s.actors[0];
    s.phase = 'playing'; s.time = 30; s.countdown = 0; s.config.bots = false;
    if (spawn) s.config.mode = 'battle-royale';
    me.pos = { x, y: spawn?.y ?? terrainHeight(x, z), z }; me.velocity = { x: 0, y: 0, z: 0 };
    me.stage = 'ground'; me.grounded = true; me.yaw = yaw; me.pitch = pitch;
    me.ads = name === 'scope'; me.weapons = [{ id: name === 'scope' ? 'sniper' : name.startsWith('fp-') ? name.slice(3) as WeaponId : 'pistol', ammo: 12, reserve: 50, rarity: 0 }];
    me.slot = 0;
    const emote = EMOTE_IDS.find(id => name === `emote-${id}`);
    if (emote) { me.emote = emote; me.emoteUntil = s.time + EMOTES[emote].duration; me.crouch = emote === 'sit' || emote === 'chill'; }
    const level = name === 'corrente-upgrade' ? 2 : CORRENTE_LADDER.findIndex(id => name === `corrente-${id}`);
    if (level >= 0) {
      const id = CORRENTE_LADDER[level];
      s.config.mode = 'corrente'; s.remaining = CORRENTE_LADDER.length - level;
      s.loot.forEach(item => { item.active = false; }); s.openedChests = deps.world.chests.map(chest => chest.id);
      me.weaponLevel = me.kills = level; me.weapons = [{ id, ammo: WEAPON_DEFS[id].magazine, reserve: id === 'machete' ? 0 : 60, rarity: 0 }];
    }
    s.actors = [me];
    for (let i = 1; i < actorCount; i++) {
      const bot = structuredClone(me), angle = i * Math.PI * 2 / (actorCount - 1), radius = 12 + i % 4 * 4;
      bot.id = `bot-qa-${i}`; bot.name = `Bot ${i}`; bot.bot = true; bot.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const bx = x + Math.cos(angle) * radius, bz = z + Math.sin(angle) * radius;
      bot.pos = { x: bx, y: terrainHeight(bx, bz), z: bz }; bot.yaw = angle + Math.PI;
      s.actors.push(bot);
    }
    if (name === 'capyFront' || name === 'capySide') {
      const bot = structuredClone(me); bot.id = 'bot-qa'; bot.name = 'Capivara'; bot.bot = true;
      bot.pos = { x, y: me.pos.y, z: z - 2 }; bot.yaw = name === 'capyFront' ? Math.PI : Math.PI / 2;
      s.actors.push(bot);
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
    for (let i = 0; i < 20; i++) renderer.update({ snapshot: s, playerId: 'practice', input: deps.input.frame, dt: .05, playing: true, spectateId: null });
    deps.ui.update(s, 'practice', 0, false, 60, null);
    deps.ui.setPaused(name === 'pause');
    if (name === 'emote-wheel') deps.ui.openEmoteWheel();
    if (name === 'corrente-upgrade') {
      const upgrade = { type: 'upgrade' as const, id: 1, actor: me.id, weapon: CORRENTE_LADDER[level], level };
      renderer.event(upgrade); deps.ui.event(upgrade);
    }
    if (name !== 'results') document.querySelector('#victory')?.remove();
    return { camera: renderer.cameraPosition, ...renderer.stats };
  }
  window.__capyQA = {
    async start() { renderer ||= await deps.begin(); },
    pose,
    quality(quality) { if (!renderer) throw new Error('Call start first'); deps.settings.graphics = quality; renderer.setSettings(deps.settings); draw(); },
    actors(count) { if (!Number.isInteger(count) || count < 1 || count > 16) throw new Error('Expected 1 to 16 actors'); actorCount = count; },
    loading(on) { deps.ui.setLoading(on); },
    loop(on) { if (on === looping) return; looping = on; if (on) requestAnimationFrame(tick); },
    stats() { return { ...(renderer?.stats || { drawCalls: 0, triangles: 0 }), renderedFrames }; },
    names: () => names,
  };
}
