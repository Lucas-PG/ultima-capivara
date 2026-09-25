import { Simulation as M1Simulation } from '/src/simulation/index.ts';
import { terrainHeight as m1Ground } from '/src/shared/terrain.ts';
import { DEFAULT_CONFIG as M1_CONFIG } from '/src/shared/types.ts';

const m1Fixture = new M1Simulation(world, { ...M1_CONFIG, bots: false },
  [{ id: 'practice', name: 'Capivara', color: '#bd8956', ready: true, connected: true }], 'm1-pose-seed', 0x5eed2026).snapshot();
const m1SunYaw = Math.atan2(55, 38);
const m1Grass = { x: -20, z: -50 };
const m1OliveHouse = { x: 88, z: 94 };
let m1Camera = null;
let m1Prepared = false;
let m1WorldChildren = null;

function m1Plan(name) {
  const atGround = (x, z, lift = 1.62) => ({ x, y: m1Ground(x, z) + lift, z });
  const look = (from, yaw, pitch = 0) => ({
    x: from.x - Math.sin(yaw) * 120,
    y: from.y + Math.tan(pitch) * 120,
    z: from.z - Math.cos(yaw) * 120,
  });
  const baseViews = {
    plaza: [-35, 61, -.7], bakery: [-77, 34, .4],
    beach: [41, -105, -.7], hill: [-18, 100, -.7],
  };
  if (name in baseViews) {
    const [x, z, yaw] = baseViews[name], camera = atGround(x, z);
    return { camera, target: look(camera, yaw), yaw, weapon: false };
  }
  if (name === 'water') {
    const camera = atGround(-34, -8);
    return { camera, target: { x: -34, y: -.05, z: 6 }, yaw: Math.PI, weapon: false };
  }
  if (name === 'grass-toward-sun' || name === 'grass-away-sun') {
    const yaw = m1SunYaw + (name.endsWith('away-sun') ? Math.PI : 0);
    const camera = atGround(m1Grass.x, m1Grass.z);
    return { camera, target: look(camera, yaw), yaw, weapon: false };
  }
  if (name === 'olive-house-interior') {
    const camera = atGround(m1OliveHouse.x - 1.2, m1OliveHouse.z + .6);
    return { camera, target: atGround(m1OliveHouse.x + 2, m1OliveHouse.z - 1, 1.5), yaw: -.9, weapon: false };
  }
  if (name === 'plane-120m') {
    return { camera: { x: -120, y: 120, z: 0 }, target: { x: 0, y: 115, z: 0 }, yaw: -Math.PI / 2,
      weapon: false, plane: true, measuredDistance: Math.hypot(120, 5) };
  }
  if (name === 'storm-edge-inside' || name === 'storm-edge-outside') {
    const outside = name.endsWith('outside');
    const camera = atGround(25, outside ? -84 : -52);
    const yaw = outside ? Math.PI : 0;
    return { camera, target: look(camera, yaw), yaw, weapon: false,
      stormEdge: outside ? 'outside' : 'inside', zone: { x: 25, z: -50, radius: 30 } };
  }
  if (name.startsWith('plaza-pan-')) {
    const index = Number(name.slice('plaza-pan-'.length));
    if (!Number.isInteger(index) || index < 0 || index > 7) throw new Error('Invalid plaza pan frame: ' + name);
    const camera = atGround(-35, 61), yaw = index * Math.PI / 4;
    return { camera, target: look(camera, yaw), yaw, weapon: false, panDegrees: index * 45 };
  }
  if (name.startsWith('capy-')) {
    const match = /^capy-(3|30|60)m-(sky|grass)$/.exec(name);
    if (!match) throw new Error('Invalid capy pose: ' + name);
    const distance = Number(match[1]), backdrop = match[2];
    const origin = { x: 35, z: -45, yaw: Math.PI };
    const yaw = origin.yaw;
    const actor = { x: origin.x - Math.sin(yaw) * distance,
      z: origin.z - Math.cos(yaw) * distance };
    const camera = atGround(origin.x, origin.z, backdrop === 'sky' ? .25 : 3.4 + distance * .07);
    return { camera, target: atGround(actor.x, actor.z, 1.25), yaw, weapon: false,
      bot: actor, actorDistance: distance, backdrop, isolatedBackdrop: true };
  }
  if (name === 'fp-m4-sky') {
    const camera = atGround(25, -50);
    return { camera, target: look(camera, 0, .32), yaw: 0, weapon: true };
  }
  throw new Error('Unknown M1 pose: ' + name);
}

window.__m1Pose = {
  names() { return ['plaza', 'bakery', 'beach', 'hill', 'water',
    'grass-toward-sun', 'grass-away-sun', 'olive-house-interior', 'plane-120m',
    'storm-edge-inside', 'storm-edge-outside',
    ...Array.from({ length: 8 }, (_, i) => `plaza-pan-${i}`),
    ...[3, 30, 60].flatMap(distance => [`capy-${distance}m-sky`, `capy-${distance}m-grass`]), 'fp-m4-sky']; },
  async start() {
    ensureRenderer();
    await rendererReady;
    if (!renderer) throw new Error('Renderer unavailable after warmup');
    if (!m1Prepared) {
      const prepared = structuredClone(m1Fixture), me = prepared.actors[0], bot = structuredClone(me);
      bot.id = 'm1-bot'; bot.name = 'Capivara'; bot.bot = true;
      prepared.actors.push(bot);
      await renderer.prepareMatch(prepared);
      m1WorldChildren = renderer.worldView.group.children.map(child => [child, child.visible]);
      if (!m1WorldChildren[0]?.[0]?.isMesh) throw new Error('Expected terrain ground as first world child');
      const rig = renderer.cameraRig, original = rig.update.bind(rig);
      rig.update = (...args) => {
        original(...args);
        if (!m1Camera) return;
        rig.camera.position.set(m1Camera.camera.x, m1Camera.camera.y, m1Camera.camera.z);
        rig.camera.lookAt(m1Camera.target.x, m1Camera.target.y, m1Camera.target.z);
        rig.camera.updateProjectionMatrix();
      };
      m1Prepared = true;
    }
    ui.game('practice');
    ui.setLoading(false);
  },
  pose(name) {
    if (!m1Prepared || !renderer) throw new Error('Call start before pose');
    const plan = m1Plan(name), state = structuredClone(m1Fixture), me = state.actors[0], bot = structuredClone(me);
    state.phase = 'playing'; state.time = 30; state.countdown = 0; state.config.bots = false;
    if (plan.zone) { state.config.mode = 'battle-royale'; Object.assign(state.zone, plan.zone); }
    if (plan.isolatedBackdrop) { state.loot = []; state.chests = []; }
    state.plane = { x: 0, y: 115, z: 0 };
    me.stage = plan.plane ? 'plane' : 'ground'; me.grounded = !plan.plane;
    me.pos = { x: plan.camera.x, y: m1Ground(plan.camera.x, plan.camera.z), z: plan.camera.z };
    me.velocity = { x: 0, y: 0, z: 0 }; me.yaw = plan.yaw; me.pitch = 0;
    me.weapons = [{ id: plan.weapon ? 'm4' : 'pistol', ammo: 30, reserve: 90, rarity: 0 }]; me.slot = 0;
    bot.id = 'm1-bot'; bot.name = 'Capivara'; bot.bot = true;
    bot.stage = plan.plane ? 'plane' : 'ground'; bot.grounded = !plan.plane;
    const bx = plan.bot?.x ?? 1000, bz = plan.bot?.z ?? 1000;
    bot.pos = { x: bx, y: m1Ground(bx, bz), z: bz }; bot.yaw = plan.yaw + Math.PI;
    state.actors = [me, bot];
    m1Camera = plan;
    for (const [index, [child, visible]] of m1WorldChildren.entries()) child.visible = plan.isolatedBackdrop ? index === 0 : visible;
    input.frame.yaw = plan.yaw; input.frame.pitch = 0;
    renderer.weaponView.scene.visible = plan.weapon;
    for (let i = 0; i < 20; i++) renderer.update({ snapshot: state, playerId: 'practice', input: input.frame,
      dt: .05, playing: true, spectateId: null });
    ui.update(state, 'practice', 0, false, 60, null);
    ui.setPaused(false);
    const crosshair = document.querySelector('#cross');
    if (crosshair) crosshair.style.display = plan.bot ? 'none' : '';
    const stormHud = document.querySelector('#storm');
    if (stormHud) stormHud.style.display = plan.stormEdge ? 'none' : '';
    const banner = document.querySelector('#banner');
    if (banner) banner.style.display = plan.plane ? 'none' : '';
    document.querySelector('#flash')?.remove();
    document.querySelector('#confetti')?.remove();
    const avatar = plan.bot ? renderer.avatars.get('m1-bot') : null;
    const avatarTop = avatar?.group.position.clone();
    if (avatarTop) avatarTop.y += 1.9;
    avatarTop?.project(renderer.camera);
    return { name, camera: plan.camera, target: plan.target, sunYawRadians: m1SunYaw,
      panDegrees: plan.panDegrees ?? null, actorDistance: plan.actorDistance ?? null,
      stormEdge: plan.stormEdge ?? null, zone: plan.zone ?? null,
      stormHudHidden: !!plan.stormEdge,
      backdrop: plan.backdrop ?? null, isolatedBackdrop: !!plan.isolatedBackdrop,
      avatarNdc: avatarTop ? { x: avatarTop.x, y: avatarTop.y, z: avatarTop.z, visible: avatar.group.visible } : null,
      measuredDistance: plan.measuredDistance ?? null,
      drawCalls: renderer.stats.drawCalls, triangles: renderer.stats.triangles };
  },
};
