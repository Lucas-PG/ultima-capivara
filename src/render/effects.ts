import * as THREE from 'three';
import { rarityOf } from '../shared/rarity';
import { terrainHeight } from '../shared/terrain';
import { colliderSpan } from '../shared/collider-shape';
import { WATER_LEVEL } from '../shared/water';
import { MELEE_CONTACT } from '../shared/weapon-presentation';
import { WEAPONS } from '../shared/weapons';
import type { ActorState, Collider, ConsumableId, GameEvent, Surface, Vec3, WeaponId, WorldSnapshot, WorldSpec, ZoneState } from '../shared/types';
import type { AvatarView } from './avatars';
import type { WeaponView } from './weapons';
import { CELL, PAINT, PAINTED_URL, createEffectsAtlas } from './effects-atlas';
import type { AssetLoader } from './assets';
import { Card, CardSystem, CasingSystem, DecalSystem, Motion, TracerSystem } from './effects-systems';
import { itemGeometry } from './item-geometry';

// Combat and feedback VFX, style bible §11: chunky flat-tone cards with an ink
// outline, short lifetimes, one atlas and a handful of shared materials. Every
// frequent-shot visual (flash, tracer, impact burst, hit star) is gone within
// 0.5 s; marks and eliminations may linger a little longer. Nothing covers the
// crosshair for longer than a hit flash.

/** Authoritative hit and elimination reactions for the remote capybara (Tatu's runtime). */
export type AvatarReaction =
  | { kind: 'hit'; head: boolean; amount: number; from: Vec3 | null }
  | { kind: 'death'; head: boolean; weapon: WeaponId | 'storm' | 'fall'; from: Vec3 | null };

export interface EffectsFrame {
  camera: THREE.PerspectiveCamera; fpCamera: THREE.PerspectiveCamera; avatars: AvatarView;
  /** True while the first-person weapon scene is drawn for the local player. */
  firstPerson: boolean; viewportHeight: number;
  /** Accessibility: cards fade in and out without scale pops. */
  reducedMotion: boolean;
  lowQuality?: boolean;
  /** Graphics preset: particle counts and how long marks stay scale with it. */
  quality?: 'low' | 'medium' | 'high';
  /** The storm circle while a royale is on, for the drifting curtain at its edge. */
  zone?: ZoneState | null;
}

// One palette table (bible §3, §11). Values are the authored sRGB hexes.
const HEX = {
  // Muzzle flash, pow, fur, stars and chips come painted from the F2 flipbook sheet.
  flash: '#ffb84d',
  tracer: '#ffe3a1', tracerCore: '#fff4e2', tracerHostile: '#ff5a3c', tracerHostileCore: '#ffb49c',
  gold: '#ffc23d', goldLight: '#ffe7a3', cloudLight: '#fff4e2',
  heal: '#3aa35a', healLight: '#8cc453', armor: '#2f9df4', armorLight: '#bfd8e6', boost: '#e9b44c', boostLight: '#ffe7a3',
  alert: '#e5412d', alertLight: '#ffc23d', white: '#f4fbf6', storm: '#8a4dff', stormLight: '#c7a8ff',
  pebble: '#bbae98', pebbleLight: '#d8c8aa', earthPlume: '#a48c78',
  coconut: '#6b4428', coconutLight: '#a8784a', blast: '#ffab2e', blastLight: '#fff2b0', smoke: '#5d4a3e', smokeLight: '#9a8676',
} as const;

// Per surface: dust puff, flying bits, and the mark left behind.
const SURFACES: Record<Surface, { puff: string; puffLight: string; bit: string; bitLight: string; bitCell: number; bits: number; mark: string; markLight: string; markCell: number }> = {
  dirt: { puff: '#c99a62', puffLight: '#d8bc94', bit: '#9c6a42', bitLight: '#c99a62', bitCell: CELL.chip, bits: 4, mark: '#7a5234', markLight: '#9c6a42', markCell: CELL.scuff },
  sand: { puff: '#f2d9a0', puffLight: '#f8e6ba', bit: '#d9b77a', bitLight: '#f2d9a0', bitCell: CELL.chip, bits: 5, mark: '#d9b77a', markLight: '#c99a62', markCell: CELL.scuff },
  foliage: { puff: '#8cc453', puffLight: '#b0cc5e', bit: '#5fa544', bitLight: '#9cc756', bitCell: CELL.leaf, bits: 4, mark: '#4e9a45', markLight: '#3f8a4a', markCell: CELL.scuff },
  stone: { puff: '#d8c8aa', puffLight: '#e9d2ae', bit: '#bbae98', bitLight: '#d8c8aa', bitCell: CELL.chip, bits: 4, mark: '#6a6470', markLight: '#e9d2ae', markCell: CELL.hole },
  wood: { puff: '#c07a45', puffLight: '#d8bc94', bit: '#9c6a42', bitLight: '#c07a45', bitCell: CELL.splinter, bits: 4, mark: '#4a2c1c', markLight: '#c07a45', markCell: CELL.hole },
  metal: { puff: '#cfc4b0', puffLight: '#f4e7c6', bit: '#ffb84d', bitLight: '#ffe7a3', bitCell: CELL.spark, bits: 6, mark: '#3b4a57', markLight: '#7f93a3', markCell: CELL.hole },
  water: { puff: '#9fd8d2', puffLight: '#f4fbf6', bit: '#9fd8d2', bitLight: '#f4fbf6', bitCell: CELL.drop, bits: 4, mark: '#9fd8d2', markLight: '#f4fbf6', markCell: CELL.ring },
};

// Muzzle flash per gun (hud-vfx-research: shape follows the gun's use and power).
// `world` and `fp` size the front burst in metres (third person) and first-person
// scene units; `side` is the painted side-view flame, `length` its length as a
// multiple of the burst; `life` the seconds the bright core lasts (2 to 4 frames);
// `smoke` how many rounds of a burst leave a first-person barrel wisp.
// `sights` is how much the aimed burst grows to clear that gun's rear sight.
interface FlashSpec { world: number; fp: number; side: number; length: number; life: number; smoke: number; sights: number }
const FLASH: Partial<Record<WeaponId, FlashSpec>> = {
  pistol: { world: .36, fp: .12, side: PAINT.sidePistol, length: 1.3, life: .045, smoke: 1, sights: 1.1 },
  revolver: { world: .5, fp: .17, side: PAINT.sideRevolver, length: 1.5, life: .06, smoke: 1, sights: 1.1 },
  smg: { world: .3, fp: .1, side: PAINT.sideSmg, length: 1.2, life: .035, smoke: 5, sights: 3.4 },
  m4: { world: .42, fp: .135, side: PAINT.sideRifle, length: 1.6, life: .04, smoke: 5, sights: 2.4 },
  shotgun: { world: .62, fp: .22, side: PAINT.sideShotgun, length: 1.5, life: .065, smoke: 1, sights: 1.4 },
  dmr: { world: .44, fp: .145, side: PAINT.sideDmr, length: 2.1, life: .05, smoke: 1, sights: 1.1 },
  sniper: { world: .6, fp: .2, side: PAINT.sideSniper, length: 1.9, life: .07, smoke: 1, sights: 1.1 },
};
const TRACER_WIDTH: Partial<Record<WeaponId, number>> = { pistol: .018, smg: .016, m4: .02, shotgun: .016, dmr: .024, sniper: .03, revolver: .024 };
// Seconds a bullet mark stays, and particle count scale, by graphics preset.
export const MARK_LIFE = 10;
const MARK_LIFE_BY: Record<'low' | 'medium' | 'high', number> = { low: 5, medium: MARK_LIFE, high: 16 };
const COUNT_BY: Record<'low' | 'medium' | 'high', number> = { low: .5, medium: 1, high: 1.35 };

type Palette = Record<keyof typeof HEX, THREE.Color>;
type SurfacePalette = Record<Surface, { puff: THREE.Color; puffLight: THREE.Color; bit: THREE.Color; bitLight: THREE.Color; mark: THREE.Color; markLight: THREE.Color }>;
interface Pending { active: boolean; attacker: string; head: boolean; pos: THREE.Vector3 }
interface Pebble { card: Card | null; actor: string }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class EffectsView {
  private readonly atlas = createEffectsAtlas();
  private readonly painted: THREE.Texture;
  private readonly white = new THREE.Color('#ffffff');
  private readonly cards: CardSystem;
  private readonly tracers = new TracerSystem(64);
  private readonly decals: DecalSystem;
  private readonly casings: CasingSystem;
  private readonly fpCards: CardSystem;
  private readonly fpCasings = new CasingSystem(12, false, null, .7);
  private readonly systems: { update?: unknown; warm(on: boolean): void; clear(): void; dispose(): void }[];
  private readonly color = {} as Palette;
  private readonly surface = {} as SurfacePalette;
  private readonly rarity = [0, 1, 2, 3].map(r => new THREE.Color(rarityOf(r).color));
  private readonly tips = new Map<WeaponId, THREE.Vector3>();
  private burst = 0;
  private stormAt = 0;
  // Stage per actor last frame: a parachute touching down raises a dust ring.
  private readonly stages = new Map<string, ActorState['stage']>();
  private readonly grid = new Map<number, Collider[]>();
  private readonly pending: Pending[] = [];
  private readonly pebbles: Pebble[] = [];
  private frame: EffectsFrame | null = null;
  private waterTime = 0;
  private readonly waterActors = new Map<string, { next: number; seen: number }>();
  // Scratch values: events and frames reuse these instead of allocating.
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly n2 = new THREE.Vector3();
  private readonly t1 = new THREE.Vector3();
  private readonly t2 = new THREE.Vector3();
  private readonly t3 = new THREE.Vector3();
  private readonly u1 = new THREE.Vector3();
  private readonly u2 = new THREE.Vector3();
  private readonly tint = new THREE.Color();

  constructor(private readonly scene: THREE.Scene, private readonly world: WorldSpec, private readonly fpScene: THREE.Scene, assets: AssetLoader) {
    // Loaded through the asset gate, so the match never starts before the painted cards decode.
    this.painted = assets.texture(PAINTED_URL); this.painted.colorSpace = THREE.SRGBColorSpace; this.painted.anisotropy = 4;
    for (const [key, hex] of Object.entries(HEX)) this.color[key as keyof typeof HEX] = new THREE.Color(hex);
    for (const [key, s] of Object.entries(SURFACES)) this.surface[key as Surface] = {
      puff: new THREE.Color(s.puff), puffLight: new THREE.Color(s.puffLight), bit: new THREE.Color(s.bit),
      bitLight: new THREE.Color(s.bitLight), mark: new THREE.Color(s.mark), markLight: new THREE.Color(s.markLight),
    };
    this.cards = new CardSystem(this.atlas, this.painted, 900, 4, 1.5);
    this.decals = new DecalSystem(this.atlas, 160);
    this.casings = new CasingSystem(64, true, (x, z, top) => this.groundAt(x, z, top));
    this.fpCards = new CardSystem(this.atlas, this.painted, 80, 10);
    this.systems = [this.cards, this.fpCards, this.tracers, this.decals, this.casings, this.fpCasings];
    scene.add(this.decals.mesh, this.casings.mesh, this.tracers.mesh, this.cards.mesh);
    fpScene.add(this.fpCasings.mesh, this.fpCards.mesh);
    // Owned and disposed here, not by the scenes' generic disposal passes.
    for (const mesh of [this.decals.mesh, this.casings.mesh, this.tracers.mesh, this.cards.mesh, this.fpCasings.mesh, this.fpCards.mesh]) mesh.userData.effects = true;
    // Third-person barrel tips: the mean of the vertices at the front (-z) of each held model.
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const geometry = itemGeometry('weapon', id), position = geometry.getAttribute('position');
      let front = Infinity;
      for (let i = 0; i < position.count; i++) front = Math.min(front, position.getZ(i));
      const tip = new THREE.Vector3(); let count = 0;
      for (let i = 0; i < position.count; i++) if (position.getZ(i) < front + .015) { tip.x += position.getX(i); tip.y += position.getY(i); count++; }
      this.tips.set(id, tip.set(tip.x / Math.max(1, count), tip.y / Math.max(1, count), front - .02));
      geometry.dispose();
    }
    for (const collider of world.colliders) {
      for (let ix = Math.floor(collider.min.x / 4); ix <= Math.floor(collider.max.x / 4); ix++)
        for (let iz = Math.floor(collider.min.z / 4); iz <= Math.floor(collider.max.z / 4); iz++) {
          const key = (ix + 512) * 1024 + iz + 512, list = this.grid.get(key);
          if (list) list.push(collider); else this.grid.set(key, [collider]);
        }
    }
    for (let i = 0; i < 16; i++) this.pending.push({ active: false, attacker: '', head: false, pos: new THREE.Vector3() });
    for (let i = 0; i < 8; i++) this.pebbles.push({ card: null, actor: '' });
  }

  // Highest walkable top at (x, z) at or below `top`: terrain or a collider roof.
  groundAt(x: number, z: number, top: number) {
    let ground = terrainHeight(x, z);
    const list = this.grid.get((Math.floor(x / 4) + 512) * 1024 + Math.floor(z / 4) + 512);
    if (list) for (const c of list) {
      const surface = c.hull ? colliderSpan(c, x, z)?.[1] :
        x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z ? c.max.y : undefined;
      if (surface !== undefined && surface <= top && surface > ground) ground = surface;
    }
    return ground;
  }

  private readonly resolveAnchor = (id: string, out: THREE.Vector3) => {
    const visual = this.frame?.avatars.get(id);
    if (!visual || !visual.group.visible) return false;
    out.copy(visual.group.position); out.y += 2.45 * visual.group.scale.y; return true;
  };

  update(dt: number, frame: EffectsFrame, actors: readonly ActorState[] = [], simulationTime = 0, localActor?: ActorState) {
    this.frame = frame;
    this.waterTime += Math.max(0, dt);
    this.updateWater(actors, simulationTime, localActor);
    this.updateLandings(actors, localActor);
    this.updateStormEdge(dt);
    for (const p of this.pending) if (p.active) { p.active = false; this.hitStar(p.pos, p.head); }
    for (const pebble of this.pebbles) if (pebble.card && pebble.card.life <= 0) pebble.card = null;
    const px = 2 * Math.tan(THREE.MathUtils.degToRad(frame.camera.fov) / 2) / Math.max(1, frame.viewportHeight);
    const fpPx = 2 * Math.tan(THREE.MathUtils.degToRad(frame.fpCamera.fov) / 2) / Math.max(1, frame.viewportHeight);
    this.cards.update(dt, px, this.resolveAnchor, frame.reducedMotion, frame.viewportHeight);
    this.tracers.update(dt, px); this.decals.update(dt); this.casings.update(dt);
    this.fpCards.update(dt, fpPx, this.resolveAnchor, frame.reducedMotion, frame.viewportHeight); this.fpCasings.update(dt);
  }

  event(event: GameEvent, avatars: AvatarView, weaponView: WeaponView, playerId: string | undefined, snapshot: WorldSnapshot | null = null): void {
    const firstPerson = !!this.frame?.firstPerson;
    if (event.type === 'shot') this.shot(event, avatars, weaponView, playerId, snapshot);
    else if (event.type === 'upgrade') {
      const pos = this.copyActor(snapshot, event.actor, this.a);
      if (pos && (!this.frame || this.frame.camera.position.distanceToSquared(pos) < 35 * 35))
        this.upgrade(pos, event.actor === playerId && firstPerson, event.level);
    } else if (event.type === 'supply') {
      if (event.stage === 'incoming' || (this.frame && this.frame.camera.position.distanceToSquared(event.pos) > 60 * 60)) return;
      this.a.set(event.pos.x, event.pos.y + .08, event.pos.z);
      if (event.stage === 'landed') {
        if (this.frame?.reducedMotion) return;
        const count = this.frame?.lowQuality ? 3 : 8;
        for (let i = 0; i < count; i++) {
          const angle = i / count * Math.PI * 2, x = Math.cos(angle), z = Math.sin(angle);
          const puff = this.cards.spawn(); puff.pos.copy(this.a); puff.pos.x += x * .35; puff.pos.z += z * .35;
          puff.cell = PAINT.dust + i % 2; puff.life = .6; puff.fadeIn = .03; puff.fadeOut = .8;
          puff.size0 = .2; puff.size1 = .8; puff.alpha = .3; puff.minPx = 0; puff.maxPx = 54;
          puff.vel.set(x * 1.4, .4, z * 1.4); puff.drag = 2.4; puff.rot = angle;
          puff.color.copy(this.surface.sand.puff); puff.light.copy(this.surface.sand.puffLight);
        }
      } else if (!this.frame?.reducedMotion) this.sparkle(this.a, this.color.gold, this.color.goldLight, this.frame?.lowQuality ? 4 : 8, 1);
    } else if (event.type === 'bounce') {
      if (this.frame?.reducedMotion || (this.frame && this.frame.camera.position.distanceToSquared(event.pos) > 40 * 40)) return;
      this.bounceDust(event.pos);
    } else if (event.type === 'water') {
      if (this.frame && this.frame.camera.position.distanceToSquared(event.pos) > 40 * 40) return;
      this.a.set(event.pos.x, WATER_LEVEL, event.pos.z);
      this.waterRipple(this.a, event.entering ? 1.9 : 1.2, event.entering ? .65 : .4);
      this.waterDrops(this.a, this.frame?.reducedMotion ? 0 : this.frame?.lowQuality ? 3 : event.entering ? 10 : 5, event.entering ? 2.4 : 1.1);
    } else if (event.type === 'impact') {
      for (const pebble of this.pebbles) if (pebble.card && pebble.actor === event.actor) { pebble.card.life = 0; pebble.card = null; break; }
      if (event.weapon === 'coco') this.blast(this.a.copy(event.pos), this.n.copy(event.normal));
      else this.impact(this.a.copy(event.pos), event.surface, this.n.copy(event.normal), event.weapon, 1);
    } else if (event.type === 'damage') {
      avatars.react(event.target, { kind: 'hit', head: event.head, amount: event.amount, from: event.actor ? this.actorPos(snapshot, event.actor) : null });
      if (event.actor) {
        let slot = this.pending[0];
        for (const p of this.pending) if (!p.active) { slot = p; break; }
        slot.active = true; slot.attacker = event.actor; slot.head = event.head; slot.pos.copy(event.pos);
      }
      if (event.armorBreak) this.armorBreak(this.a.copy(event.pos), event.target === playerId && firstPerson);
    } else if (event.type === 'kill') {
      const visual = avatars.get(event.target);
      const pos = visual?.group.visible ? this.a.copy(visual.group.position) : this.copyActor(snapshot, event.target, this.a);
      avatars.react(event.target, { kind: 'death', head: false, weapon: event.weapon, from: event.actor ? this.actorPos(snapshot, event.actor) : null });
      if (pos && event.target !== playerId) this.elimination(pos);
    } else if (event.type === 'pickup') this.pickup(event.item, snapshot);
    else if (event.type === 'use') {
      const local = event.actor === playerId && firstPerson;
      const visual = avatars.get(event.actor);
      if (visual?.group.visible && !local) this.consumable(this.a.copy(visual.group.position), event.item);
      if (local) this.consumableFirstPerson(event.item);
    } else if (event.type === 'alert') {
      if (event.target !== playerId) return;
      const card = this.cards.spawn();
      card.anchor = event.actor; card.motion = Motion.Anchored; card.cell = CELL.alert;
      card.life = event.delay + .45; card.size0 = card.size1 = .5; card.pop = true; card.fadeOut = .2;
      card.minPx = 30; card.maxPx = 52; card.color.copy(this.color.alert); card.light.copy(this.color.alertLight);
    } else if (event.type === 'respawn') {
      const pos = this.copyActor(snapshot, event.actor, this.a);
      if (pos) this.ring(pos, this.color.white, this.color.goldLight, 1.4);
    }
  }

  private updateWater(actors: readonly ActorState[], simulationTime: number, localActor?: ActorState) {
    const frame = this.frame!;
    for (const source of actors) {
      const actor = source.id === localActor?.id ? localActor : source;
      if (!actor.alive || (!actor.swimming && actor.wetUntil <= simulationTime) || frame.camera.position.distanceToSquared(actor.pos) > 32 * 32) continue;
      let state = this.waterActors.get(actor.id);
      if (!state) { state = { next: this.waterTime, seen: this.waterTime }; this.waterActors.set(actor.id, state); }
      state.seen = this.waterTime;
      if (this.waterTime < state.next) continue;
      const moving = Math.hypot(actor.velocity.x, actor.velocity.z) > .15;
      state.next = this.waterTime + (frame.lowQuality ? 1.05 : actor.swimming && moving ? .48 : .9);
      const visual = actor === localActor ? undefined : frame.avatars.get(actor.id);
      this.a.copy(visual?.group.position || actor.pos);
      if (actor.swimming) {
        this.a.y = WATER_LEVEL;
        this.waterRipple(this.a, moving ? 1.55 : 1.05, moving ? .35 : .2);
        if (moving && !frame.reducedMotion && !frame.lowQuality) {
          this.a.x += Math.cos(actor.yaw) * .36; this.a.z -= Math.sin(actor.yaw) * .36;
          this.waterDrops(this.a, 2, .85);
        }
      } else if (!frame.reducedMotion) {
        this.a.y += .55;
        this.waterDrops(this.a, frame.lowQuality ? 1 : 2, .05);
      }
    }
    for (const [id, state] of this.waterActors) if (state.seen !== this.waterTime) this.waterActors.delete(id);
  }

  // Violet wisps rise along the storm wall near the viewer, so the edge reads as a
  // moving curtain with depth instead of only a tint. About a dozen cards a second.
  private updateStormEdge(dt: number) {
    const frame = this.frame!, zone = frame.zone;
    if (!zone || zone.radius < 2 || frame.reducedMotion) return;
    const cam = frame.camera.position, dx = cam.x - zone.x, dz = cam.z - zone.z, d = Math.hypot(dx, dz) || 1;
    if (Math.abs(d - zone.radius) > 45) return;
    this.stormAt -= dt;
    if (this.stormAt > 0) return;
    this.stormAt = frame.lowQuality ? .22 : .09;
    const base = Math.atan2(dz, dx), spread = Math.min(Math.PI, 30 / zone.radius);
    const angle = base + rand(-spread, spread), x = zone.x + Math.cos(angle) * zone.radius, z = zone.z + Math.sin(angle) * zone.radius;
    const wisp = this.cards.spawn();
    wisp.pos.set(x, this.groundAt(x, z, 200) + rand(.2, 2.2), z); wisp.cell = PAINT.smoke; wisp.life = rand(1.8, 2.6);
    wisp.fadeIn = .25; wisp.fadeOut = .5; wisp.size0 = rand(1.2, 1.8); wisp.size1 = rand(2.8, 3.8); wisp.alpha = .38; wisp.minPx = 6;
    wisp.rot = rand(0, 6.3); wisp.spin = rand(-.3, .3); wisp.vel.set(-Math.sin(angle) * rand(-.6, .6), rand(.3, .6), Math.cos(angle) * rand(-.6, .6));
    wisp.color.copy(this.color.storm); wisp.light.copy(this.color.stormLight);
  }

  private updateLandings(actors: readonly ActorState[], localActor?: ActorState) {
    const frame = this.frame!;
    for (const source of actors) {
      const actor = source.id === localActor?.id ? localActor : source, before = this.stages.get(actor.id);
      this.stages.set(actor.id, actor.stage);
      if (before !== 'parachute' || actor.stage !== 'ground' || actor.swimming || frame.reducedMotion) continue;
      if (frame.camera.position.distanceToSquared(actor.pos) > 50 * 50) continue;
      const count = Math.round(8 * this.countScale()), ground = this.groundAt(actor.pos.x, actor.pos.z, actor.pos.y + .3);
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2, puff = this.cards.spawn();
        puff.pos.set(actor.pos.x + Math.cos(a) * .4, ground + .15, actor.pos.z + Math.sin(a) * .4); puff.cell = PAINT.dust + (i & 1);
        puff.life = rand(.5, .7); puff.fadeOut = .7; puff.size0 = .25; puff.size1 = .8; puff.alpha = .45; puff.minPx = 6; puff.rot = a;
        puff.vel.set(Math.cos(a) * 2.6, .35, Math.sin(a) * 2.6); puff.drag = 3.5;
        puff.color.copy(this.surface.sand.puff); puff.light.copy(this.surface.sand.puffLight);
      }
    }
    if (this.stages.size > actors.length + 8) for (const id of this.stages.keys()) if (!actors.some(a => a.id === id)) this.stages.delete(id);
  }

  private waterRipple(pos: THREE.Vector3, size: number, alpha: number) {
    const water = this.surface.water;
    this.n.set(0, 1, 0);
    this.decals.spawn(pos, this.n, CELL.ring, .42, size, 1.3, .8, alpha, water.mark, water.markLight, rand(0, 6.3));
  }

  private bounceDust(pos: Vec3) {
    const count = this.frame?.lowQuality ? 2 : 5;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + .3, x = Math.cos(angle), z = Math.sin(angle);
      const puff = this.cards.spawn();
      puff.pos.set(pos.x + x * .28, pos.y + .09, pos.z + z * .28);
      puff.cell = PAINT.dust + i % 2; puff.life = .42; puff.fadeIn = .04; puff.fadeOut = .8;
      puff.size0 = .18; puff.size1 = .45; puff.alpha = .27; puff.minPx = 0; puff.maxPx = 36;
      puff.vel.set(x * .85, .28 + i % 2 * .12, z * .85); puff.drag = 2.4;
      puff.rot = angle; puff.color.copy(this.surface.sand.puff); puff.light.copy(this.surface.sand.puffLight);
    }
  }

  private waterDrops(pos: THREE.Vector3, count: number, speed: number) {
    const water = this.surface.water;
    for (let i = 0; i < count; i++) {
      const drop = this.cards.spawn(), angle = rand(0, Math.PI * 2);
      drop.pos.copy(pos); drop.pos.x += Math.cos(angle) * .17; drop.pos.z += Math.sin(angle) * .17;
      drop.cell = CELL.drop; drop.stretch = true; drop.aspect = 1.45;
      drop.life = rand(.35, .55); drop.fadeOut = .65; drop.alpha = .65;
      drop.vel.set(Math.cos(angle) * speed * .35, speed * rand(.65, 1.1), Math.sin(angle) * speed * .35);
      drop.gravity = 6; drop.size0 = .035 + speed * .018; drop.size1 = .018; drop.minPx = 0; drop.maxPx = 12;
      drop.color.copy(water.bit); drop.light.copy(water.bitLight);
    }
  }

  private actorPos(snapshot: WorldSnapshot | null, id: string): Vec3 | null {
    if (snapshot) for (const actor of snapshot.actors) if (actor.id === id) return actor.pos;
    return null;
  }
  private copyActor(snapshot: WorldSnapshot | null, id: string, out: THREE.Vector3) {
    const pos = this.actorPos(snapshot, id);
    return pos ? out.set(pos.x, pos.y, pos.z) : null;
  }

  private shot(event: Extract<GameEvent, { type: 'shot' }>, avatars: AvatarView, weaponView: WeaponView, playerId: string | undefined, snapshot: WorldSnapshot | null) {
    const f = this.frame, weapon = event.weapon, own = event.actor === playerId && !!f?.firstPerson;
    if (weapon === 'machete') avatars.attack(event.actor);
    const muzzle = this.b, end = this.c.set(event.end.x, event.end.y, event.end.z);
    let streak = true;
    if (own && f) {
      weaponView.shot(weapon, event.hit || !!event.surface);
      const fp = weaponView.muzzleWorld(this.t1), ads = weaponView.adsAmount;
      // The first-person camera sits at the scene origin looking down -z: the barrel points at the far aim point.
      this.flash(fp, weapon, true, ads, this.u1.set(0, 0, -60).sub(fp).normalize());
      if (weapon !== 'machete' && weapon !== 'coco' && weapon !== 'revolver') {
        const eject = weaponView.ejectWorld(this.t2);
        this.fpCasings.spawn(eject, this.n.set(rand(.9, 1.3), rand(.8, 1.2), rand(.1, .35)), weapon === 'shotgun', .7);
      }
      // Where the first-person muzzle appears on screen, 0.9 m out along that view ray.
      this.t1.project(f.fpCamera);
      muzzle.set(this.t1.x, this.t1.y, .5).unproject(f.camera).sub(f.camera.position).normalize().multiplyScalar(.9).add(f.camera.position);
      if (ads > .5) streak = false; // your own streak would cross the sight picture
    } else {
      const visual = avatars.get(event.actor);
      if (visual?.group.visible && visual.weapon.visible) {
        visual.weapon.updateWorldMatrix(true, false);
        muzzle.copy(this.tips.get(weapon)!).applyMatrix4(visual.weapon.matrixWorld);
        // Held models point their barrel down local -z.
        this.flash(muzzle, weapon, false, 0, this.u1.set(0, 0, -1).transformDirection(visual.weapon.matrixWorld));
        if (weapon !== 'machete' && weapon !== 'coco' && weapon !== 'revolver' && f && muzzle.distanceToSquared(f.camera.position) < 30 * 30) {
          // Ejected to the shooter's right from above the grip, a little behind the tip.
          const yaw = visual.group.rotation.y, g = visual.group.position;
          this.a.set(muzzle.x + (g.x - muzzle.x) * .6, muzzle.y, muzzle.z + (g.z - muzzle.z) * .6);
          this.casings.spawn(this.a, this.n.set(Math.cos(yaw) * rand(1.2, 1.8), rand(1.4, 2), -Math.sin(yaw) * rand(1.2, 1.8)), weapon === 'shotgun', 1.6);
        }
      } else {
        muzzle.set(event.origin.x, event.origin.y - .12, event.origin.z);
        // Your own shot seen through a scope: a streak from the eye would run down the crosshair.
        if (event.actor === playerId) streak = false;
      }
    }
    if (weapon === 'coco') { this.pebble(muzzle, event); return; }
    if (streak && FLASH[weapon]) {
      // Someone else's round reads a touch heavier; one that passes by your head turns red.
      const enemy = !!playerId && event.actor !== playerId, hostile = enemy && this.passesNear(muzzle, end, snapshot, playerId);
      this.tracers.spawn(muzzle, end, weapon === 'sniper' ? .16 : .11, (TRACER_WIDTH[weapon] || .018) * (enemy ? 1.25 : 1), own ? .7 : .95,
        hostile ? this.color.tracerHostile : this.color.tracer, hostile ? this.color.tracerHostileCore : this.color.tracerCore, hostile ? 2.4 : enemy ? 1.8 : 1.4);
    }
    if (!event.hit && event.surface && event.normal) {
      this.n.copy(event.normal);
      this.impact(end, event.surface, this.n, weapon, weapon === 'machete' ? .7 : 1);
      if (weapon === 'shotgun') {
        // The event carries one endpoint; scatter a few more pellets around it on the surface.
        const radius = Math.max(.15, muzzle.distanceTo(end) * .045);
        this.u1.set(this.n.y, this.n.z, this.n.x).cross(this.n).normalize(); this.u2.crossVectors(this.n, this.u1);
        for (let i = 0; i < 4; i++) {
          const angle = rand(0, Math.PI * 2), r = radius * Math.sqrt(Math.random());
          this.a.copy(end).addScaledVector(this.u1, Math.cos(angle) * r).addScaledVector(this.u2, Math.sin(angle) * r);
          this.impact(this.a, event.surface, this.n, weapon, .55);
          if (streak && i < 2) this.tracers.spawn(muzzle, this.a, .11, .012, own ? .6 : .85, this.color.tracer, this.color.tracerCore);
        }
      }
    }
    if (event.hit) {
      if (weapon === 'machete') {
        // Confirmed contact only. Reuse the small dust pool, without blood or
        // another material/draw system, and keep the centre readable.
        const puff = this.cards.spawn(); puff.pos.copy(end); puff.cell = PAINT.dust;
        puff.age = own ? -MELEE_CONTACT : 0;
        puff.life = .22; puff.size0 = .08; puff.size1 = .32; puff.alpha = .55;
        puff.minPx = 0; puff.maxPx = 38; puff.fadeOut = .85;
        puff.vel.set(0, .25, 0); puff.color.copy(this.color.goldLight); puff.light.copy(this.color.cloudLight);
      }
      let head = false, found = false;
      for (const p of this.pending) if (p.active && p.attacker === event.actor) { head ||= p.head; p.active = false; found = true; }
      if (found) this.hitStar(end, head);
    }
  }

  // A predicted own round confirmed by the host: its hit star goes where the host's round struck.
  confirmShot(event: Extract<GameEvent, { type: 'shot' }>) {
    if (!event.hit) return;
    let head = false, found = false;
    for (const p of this.pending) if (p.active && p.attacker === event.actor) { head ||= p.head; p.active = false; found = true; }
    if (found) this.hitStar(this.c.set(event.end.x, event.end.y, event.end.z), head);
  }

  // Tints enemy tracers red when their line passes within 2.5 m of your head.
  private passesNear(from: THREE.Vector3, to: THREE.Vector3, snapshot: WorldSnapshot | null, playerId: string) {
    const me = this.actorPos(snapshot, playerId);
    if (!me) return false;
    const head = this.t2.set(me.x, me.y + 1.5, me.z), line = this.t1.subVectors(to, from);
    const k = THREE.MathUtils.clamp(this.a.subVectors(head, from).dot(line) / Math.max(1e-6, line.lengthSq()), 0, 1);
    return this.a.copy(from).addScaledVector(line, k).distanceToSquared(head) < 2.5 * 2.5;
  }

  // A front burst (camera facing), the gun's side flame along the barrel and,
  // in third person, a warm puff; in first person a light barrel wisp now and then.
  // Aimed fire keeps the burst small so the sight picture stays readable.
  private flash(pos: THREE.Vector3, weapon: WeaponId, fp: boolean, ads: number, barrel?: THREE.Vector3) {
    const spec = FLASH[weapon];
    if (!spec) return;
    const system = fp ? this.fpCards : this.cards, steady = 1 - ads * .3;
    const size = (fp ? spec.fp : spec.world) * steady * rand(.92, 1.08);
    // Aimed, the muzzle hides behind the sights: the burst grows so its petals frame the
    // sights for two frames while the gun itself keeps covering the hot centre and the aim point.
    // Sized for the screen: a muzzle farther out (a long rifle aimed) keeps the same on-screen burst.
    const framing = fp ? (1 + ads * spec.sights) * THREE.MathUtils.clamp(pos.length() / .75, .8, 2) : 1;
    if (barrel) {
      // In first person the flame runs toward the aim point, so it stays short there and never
      // covers the target; from outside it is the gun's full signature.
      const side = system.spawn(), height = fp ? size * .62 : size, length = height * spec.length;
      side.pos.copy(pos).addScaledVector(barrel, length * .5); side.cell = spec.side; side.stretch = true; side.aspect = spec.length;
      // A tiny velocity only carries the barrel axis for the stretch; the card stays put.
      side.vel.copy(barrel).multiplyScalar(1e-3); side.life = spec.life * 1.1; side.fadeOut = .35;
      side.size0 = height; side.size1 = height * .8; side.alpha = fp ? .85 - ads * .35 : 1;
      side.minPx = fp ? 0 : 26; side.maxPx = fp ? 1e5 : 130; side.color.copy(this.white);
    }
    const front = system.spawn();
    front.pos.copy(pos);
    // In third person the burst sits just in front of the barrel so the gun and paws never clip it.
    if (!fp && this.frame) front.pos.add(this.t2.subVectors(this.frame.camera.position, pos).normalize().multiplyScalar(size * .5));
    front.cell = PAINT.front + (Math.random() < .5 ? 0 : 1); front.life = spec.life; front.fadeOut = .45; front.rot = rand(0, Math.PI * 2);
    front.size0 = size * (fp ? .95 * framing : .95); front.size1 = front.size0 * .55; front.alpha = fp ? 1 - ads * .25 : 1;
    front.minPx = fp ? 0 : 28; front.maxPx = fp ? 1e5 : 100; front.color.copy(this.white);
    if (!fp) {
      const smoke = this.cards.spawn();
      smoke.pos.copy(front.pos); smoke.cell = PAINT.smoke; smoke.life = weapon === 'shotgun' || weapon === 'sniper' ? .6 : .4;
      smoke.size0 = spec.world * .35; smoke.size1 = spec.world * 1.05; smoke.alpha = .55; smoke.rot = rand(-.5, .5); smoke.minPx = 6;
      smoke.vel.set(rand(-.1, .1), .45, rand(-.1, .1)); if (barrel) smoke.vel.addScaledVector(barrel, .6); smoke.drag = 2.2; smoke.fadeOut = .6;
      smoke.color.copy(this.white);
    } else if (barrel && this.burst++ % spec.smoke === 0 && !this.frame?.reducedMotion) {
      const wisp = this.fpCards.spawn();
      wisp.pos.copy(pos).addScaledVector(barrel, .03); wisp.cell = PAINT.smoke; wisp.life = rand(.55, .75); wisp.fadeIn = .08; wisp.fadeOut = .6;
      wisp.size0 = spec.fp * .3; wisp.size1 = spec.fp * .75; wisp.alpha = .17 * (1 - ads * .7); wisp.rot = rand(-.4, .4); wisp.spin = rand(-.8, .8);
      wisp.vel.set(rand(-.02, .02), .09, 0).addScaledVector(barrel, .06); wisp.drag = 1.4; wisp.color.copy(this.white);
    }
  }

  private pebble(from: THREE.Vector3, event: Extract<GameEvent, { type: 'shot' }>) {
    let slot = this.pebbles[0];
    for (const p of this.pebbles) if (!p.card) { slot = p; break; }
    const card = this.cards.spawn();
    card.pos.copy(from); card.cell = CELL.chip; card.life = 3; card.fadeOut = .02;
    const coco = event.weapon === 'coco';
    card.vel.set(event.end.x - event.origin.x, event.end.y - event.origin.y, event.end.z - event.origin.z).normalize().multiplyScalar(WEAPONS[event.weapon].speed || 50);
    card.gravity = 9.8; card.size0 = card.size1 = coco ? .34 : .07; card.minPx = coco ? 9 : 4; card.spin = coco ? 7 : 14;
    if (coco) { card.cell = PAINT.husk; card.color.copy(this.white); }
    else { card.color.copy(this.color.pebble); card.light.copy(this.color.pebbleLight); }
    if (coco && this.frame) {
      // The launch: a cream pressure puff at the tube.
      const puff = this.cards.spawn();
      puff.pos.copy(from); puff.cell = PAINT.airPuff; puff.life = .35; puff.fadeOut = .6; puff.rot = rand(-.5, .5);
      puff.size0 = .18; puff.size1 = .6; puff.alpha = .75; puff.minPx = 8; puff.drag = 3;
      puff.vel.copy(card.vel).multiplyScalar(.05); puff.color.copy(this.white);
    }
    slot.card = card; slot.actor = event.actor;
  }

  // Coconut burst (vfx-sheet: green husk, white flesh, amber puff, short pale ring):
  // a white-hot core for two frames, painted blast clouds, husk chunks that bounce,
  // a shockwave ring on the ground, a dust ring and smoke that lingers, a scorch.
  private blast(pos: THREE.Vector3, normal: THREE.Vector3) {
    const reduced = !!this.frame?.reducedMotion, q = this.countScale();
    const core = this.cards.spawn();
    core.pos.copy(pos).addScaledVector(normal, .45); core.cell = PAINT.front; core.life = .07; core.fadeOut = .5; core.rot = rand(0, 6.3);
    core.size0 = 2.6; core.size1 = 3.2; core.minPx = 30; core.maxPx = 400; core.color.copy(this.white);
    for (let i = 0; i < Math.max(2, Math.round(4 * q)); i++) {
      const fire = this.cards.spawn();
      fire.pos.copy(pos).addScaledVector(normal, .5).add(this.n2.set(rand(-.5, .5), rand(0, .5), rand(-.5, .5)));
      fire.cell = PAINT.fireball; fire.life = rand(.3, .42); fire.fadeIn = .02; fire.fadeOut = .5; fire.pop = !reduced;
      fire.size0 = rand(1.4, 1.9); fire.size1 = rand(3.3, 4.2); fire.rot = rand(-1, 1); fire.spin = rand(-1.5, 1.5); fire.minPx = 30; fire.maxPx = 360;
      fire.vel.set(rand(-1.2, 1.2), rand(1.2, 2.6), rand(-1.2, 1.2)); fire.drag = 4; fire.color.copy(this.white);
    }
    for (let i = 0; i < (reduced ? 3 : Math.round(7 * q)); i++) {
      const smoke = this.cards.spawn();
      smoke.pos.copy(pos).add(this.n2.set(rand(-.9, .9), rand(.3, 1.1), rand(-.9, .9)));
      smoke.cell = i % 3 ? PAINT.dust + (i & 1) : PAINT.smoke; smoke.life = rand(1.2, 1.9); smoke.fadeIn = .12; smoke.size0 = rand(.5, .8); smoke.size1 = rand(2.8, 3.8);
      smoke.rot = rand(-1, 1); smoke.spin = rand(-.4, .4); smoke.minPx = 16; smoke.vel.set(rand(-.8, .8), rand(1, 1.9), rand(-.8, .8)); smoke.drag = 1.8; smoke.fadeOut = .65; smoke.alpha = .55;
      smoke.color.copy(this.color.smokeLight); smoke.light.copy(this.color.cloudLight);
    }
    const floor = this.groundAt(pos.x, pos.z, pos.y + .3);
    for (let i = 0; i < Math.round(9 * q); i++) {
      const husk = this.cards.spawn();
      husk.pos.copy(pos).addScaledVector(normal, .3); husk.cell = PAINT.husk + (i & 1); husk.life = rand(.9, 1.4); husk.fadeOut = .25;
      husk.vel.set(rand(-5.5, 5.5), rand(3.5, 7.5), rand(-5.5, 5.5)); husk.gravity = 14; husk.spin = rand(-10, 10); husk.rot = rand(0, 6.3);
      husk.floor = floor + .06; husk.bounce = .35; husk.size0 = husk.size1 = rand(.2, .34); husk.minPx = 6; husk.color.copy(this.white);
    }
    const grounded = Math.abs(floor - pos.y) < 1.2;
    if (grounded) {
      this.t2.set(0, 1, 0);
      // Shockwave: a pale ring racing out to the splash radius, then a scorch that fades.
      this.decals.spawn(this.n2.set(pos.x, floor + .03, pos.z), this.t2, CELL.ring, .6, WEAPONS.coco.splash! * 1.5, .38, .7, .85, this.color.cloudLight, this.color.white, rand(0, 6.3));
      this.decals.spawn(this.n2.set(pos.x, floor + .02, pos.z), this.t2, CELL.scuff, 1.6, 2.4, this.markLife() * .8, .4, .85, this.color.smoke, this.color.coconut, rand(0, 6.3));
      if (!reduced) for (let i = 0; i < Math.round(10 * q); i++) {
        const angle = i / Math.round(10 * q) * Math.PI * 2, dust = this.cards.spawn();
        dust.pos.set(pos.x + Math.cos(angle) * .6, floor + .25, pos.z + Math.sin(angle) * .6); dust.cell = PAINT.dust + (i & 1);
        dust.life = rand(.55, .8); dust.fadeOut = .7; dust.size0 = .35; dust.size1 = 1.3; dust.alpha = .5; dust.minPx = 8; dust.rot = angle;
        dust.vel.set(Math.cos(angle) * 7, .6, Math.sin(angle) * 7); dust.drag = 4.5;
        dust.color.copy(this.surface.sand.puff); dust.light.copy(this.surface.sand.puffLight);
      }
    }
  }

  // Surface impacts (hud-vfx-research): a sharp flash for one to three frames,
  // a dust burst in the surface's colours with a slower haze that outlives it,
  // flying bits, and a mark. Stone: grey dust and chips; wood: splinters; metal:
  // sparks and a dark dent; sand: an ochre plume; foliage: leaves; water: a crown.
  private impact(pos: THREE.Vector3, surface: Surface, normal: THREE.Vector3, weapon: WeaponId, scale: number) {
    const s = this.surface[surface], spec = SURFACES[surface], q = this.countScale();
    const big = weapon === 'sniper' || weapon === 'dmr' ? 1.35 : weapon === 'shotgun' ? .7 : weapon === 'revolver' ? 1.15 : 1;
    const k = big * scale;
    if (surface === 'water') {
      this.decals.spawn(pos, normal, CELL.ring, .15 * k, 1.2 * k, .5, .6, .9, s.mark, s.markLight, rand(0, 6.3));
      const crown = this.cards.spawn();
      crown.pos.copy(pos); crown.pos.y += .3 * k; crown.cell = PAINT.crown; crown.life = .34; crown.fadeOut = .45; crown.pop = !this.frame?.reducedMotion;
      crown.size0 = .45 * k; crown.size1 = .8 * k; crown.minPx = 20; crown.maxPx = 110; crown.color.copy(this.white);
      for (let i = 0; i < Math.round((3 + k * 2) * q); i++) {
        const drop = this.cards.spawn();
        drop.pos.copy(pos); drop.cell = CELL.drop; drop.stretch = true; drop.aspect = 1.6; drop.life = rand(.32, .44);
        drop.vel.set(rand(-1.1, 1.1), rand(2.8, 4.2) * k, rand(-1.1, 1.1)); drop.gravity = 11;
        drop.size0 = .1 * k; drop.size1 = .07 * k; drop.minPx = 4; drop.color.copy(s.bit); drop.light.copy(s.bitLight);
      }
      return;
    }
    const floor = this.groundAt(pos.x, pos.z, pos.y + .05) + .01, metal = surface === 'metal';
    // Sharp phase: a bright star (sparks on metal) that is gone after three frames.
    const flash = this.cards.spawn();
    flash.pos.copy(pos).addScaledVector(normal, .05); flash.cell = metal ? PAINT.sparks : CELL.twinkle; flash.life = .05; flash.fadeOut = .5;
    flash.rot = rand(0, 6.3); flash.size0 = (metal ? .45 : .32) * k; flash.size1 = flash.size0 * .6; flash.minPx = 12; flash.maxPx = 60;
    if (metal) flash.color.copy(this.white); else { flash.color.copy(s.puffLight); flash.light.copy(this.color.white); }
    const dusty = surface === 'sand' || surface === 'dirt';
    const puff = this.cards.spawn();
    puff.pos.copy(pos).addScaledVector(normal, .08); puff.cell = dusty ? PAINT.plume : PAINT.dust + (Math.random() < .5 ? 0 : 1);
    // Capped on screen: a round into a wall at arm's length must not paint over the view.
    puff.life = rand(.38, .48); puff.rot = dusty ? rand(-.15, .15) : rand(-.4, .4); puff.minPx = 14; puff.maxPx = 80;
    puff.size0 = .5 * k; puff.size1 = (metal ? .65 : dusty ? 1.3 : 1.05) * k; puff.fadeOut = .55; puff.alpha = .92; puff.pop = !this.frame?.reducedMotion;
    puff.vel.copy(normal).multiplyScalar(dusty ? .5 : .8); puff.vel.y += dusty ? .7 : .35; puff.drag = 3;
    // The painted plume is ochre: sand keeps it, earth darkens it toward brown-grey.
    if (dusty) puff.color.copy(surface === 'sand' ? this.white : this.color.earthPlume); else puff.color.copy(s.puffLight);
    // The haze that outlives the burst.
    if (!metal) {
      const haze = this.cards.spawn();
      haze.pos.copy(pos).addScaledVector(normal, .15); haze.cell = PAINT.dust + (Math.random() < .5 ? 0 : 1); haze.life = rand(.9, 1.2);
      haze.fadeIn = .1; haze.fadeOut = .7; haze.size0 = .45 * k; haze.size1 = 1.45 * k; haze.alpha = .34; haze.minPx = 10; haze.maxPx = 90; haze.rot = rand(0, 6.3);
      haze.vel.copy(normal).multiplyScalar(.3); haze.vel.y += .22; haze.drag = 1.5; haze.color.copy(s.puffLight);
    }
    for (let i = 0; i < Math.round(spec.bits * scale * q); i++) {
      const bit = this.cards.spawn();
      bit.pos.copy(pos).addScaledVector(normal, .03); bit.cell = spec.bitCell; bit.life = rand(.3, .5);
      this.t1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).addScaledVector(normal, 1.3).normalize();
      bit.vel.copy(this.t1).multiplyScalar(metal ? rand(4, 7.5) : rand(2.2, 4)); bit.vel.y += metal ? .5 : 1.4;
      bit.gravity = metal ? 6 : surface === 'foliage' ? 4 : 10; bit.drag = surface === 'foliage' ? 2.5 : .6;
      bit.floor = floor; bit.bounce = .3;
      bit.size0 = (metal ? .07 : .1) * k; bit.size1 = bit.size0 * (metal ? .6 : .8); bit.minPx = metal ? 5 : 4;
      bit.stretch = metal || spec.bitCell === CELL.splinter; bit.aspect = metal ? 4 : spec.bitCell === CELL.splinter ? 2 : 1;
      bit.rot = rand(0, 6.3); bit.spin = metal ? 0 : rand(-12, 12); bit.fadeOut = .3;
      bit.color.copy(s.bit); bit.light.copy(s.bitLight);
      // Painted chips: wood in its own colours, generic chips tinted with the surface.
      if (spec.bitCell === CELL.splinter) { bit.cell = i % 3 === 2 ? PAINT.splinter : PAINT.wood + (i % 2); bit.stretch = false; bit.aspect = 1; bit.size0 *= 1.3; bit.size1 *= 1.3; bit.color.copy(this.white); }
      else if (spec.bitCell === CELL.chip) { bit.cell = PAINT.chip; bit.color.copy(s.bitLight); }
    }
    const mark = (spec.markCell === CELL.hole ? .11 : .15) * big * (scale < 1 ? .8 : 1);
    this.decals.spawn(pos, normal, spec.markCell, mark, mark, this.markLife(), .3, .9, s.mark, s.markLight, rand(0, 6.3));
  }

  private countScale() { return COUNT_BY[this.frame?.quality ?? (this.frame?.lowQuality ? 'low' : 'medium')]; }
  private markLife() { return MARK_LIFE_BY[this.frame?.quality ?? (this.frame?.lowQuality ? 'low' : 'medium')]; }

  // White-orange "pow" and fur tufts; a headshot adds a gold star held in front of the head.
  // Pixel floors are on the card; the painted subjects fill about two thirds of it.
  private hitStar(at: THREE.Vector3, head: boolean) {
    // Out of the body toward the viewer, past the head sphere and body cylinder surfaces.
    const pos = this.t2.copy(at);
    if (this.frame) pos.add(this.t1.subVectors(this.frame.camera.position, at).normalize().multiplyScalar(.32));
    // Sharp phase: an ivory and coral spark exactly where the round landed, two frames long.
    const spark = this.cards.spawn();
    spark.pos.copy(pos); spark.cell = PAINT.hitSpark; spark.life = .05; spark.fadeOut = .4; spark.rot = rand(-.3, .3);
    spark.size0 = .5; spark.size1 = .34; spark.minPx = 34; spark.maxPx = 90; spark.color.copy(this.white);
    const pow = this.cards.spawn();
    pow.pos.copy(pos); pow.cell = PAINT.pow + (Math.random() < .5 ? 0 : 1); pow.life = .2; pow.fadeOut = .35; pow.rot = rand(-.4, .4);
    pow.size0 = .46; pow.size1 = .52; pow.minPx = 30; pow.maxPx = 84; pow.pop = true;
    pow.color.copy(this.white);
    for (let i = 0; i < 2; i++) {
      const tuft = this.cards.spawn();
      tuft.pos.copy(pos); tuft.cell = PAINT.fur + (i % 2); tuft.life = rand(.34, .46); tuft.rot = rand(0, 6.3); tuft.spin = rand(-8, 8);
      tuft.vel.set(rand(-1.6, 1.6), rand(1, 2.4), rand(-1.6, 1.6)); tuft.gravity = 5; tuft.drag = 2.2;
      tuft.size0 = .15; tuft.size1 = .12; tuft.minPx = 10; tuft.maxPx = 28;
      tuft.color.copy(this.white);
    }
    if (!head) return;
    const star = this.cards.spawn();
    star.pos.copy(pos); star.cell = PAINT.star; star.life = .24; star.fadeOut = .3; star.pop = true;
    star.vel.set(0, .5, 0); star.drag = 2; star.spin = 3; star.size0 = .55; star.size1 = .6; star.minPx = 46; star.maxPx = 96;
    star.color.copy(this.white);
  }

  // Comedic, bloodless elimination (bible §9.3): a cartoon "poof" that hides the
  // capybara leaving, a burst of gold stars and a dizzy ring over the head.
  private elimination(pos: THREE.Vector3) {
    for (let i = 0; i < 7; i++) {
      const cloud = this.cards.spawn(), angle = i / 7 * Math.PI * 2;
      cloud.pos.set(pos.x + Math.cos(angle) * .3, pos.y + .45 + (i % 3) * .45, pos.z + Math.sin(angle) * .3);
      cloud.cell = PAINT.dust + (i % 2); cloud.life = rand(.55, .7); cloud.fadeOut = .45; cloud.pop = true; cloud.rot = rand(-.5, .5);
      cloud.vel.set(Math.cos(angle) * 1.4, rand(.3, .8), Math.sin(angle) * 1.4); cloud.drag = 3.2;
      cloud.size0 = .55; cloud.size1 = .85; cloud.minPx = 20;
      cloud.color.copy(this.color.cloudLight);
    }
    const floor = this.groundAt(pos.x, pos.z, pos.y + .5) + .05;
    for (let i = 0; i < 6; i++) {
      const star = this.cards.spawn();
      star.pos.set(pos.x, pos.y + 1.2, pos.z); star.cell = PAINT.star; star.life = rand(.6, .8); star.fadeOut = .3;
      star.vel.set(rand(-2.4, 2.4), rand(3, 4.5), rand(-2.4, 2.4)); star.gravity = 9; star.spin = rand(-7, 7);
      star.floor = floor; star.bounce = .35;
      star.size0 = .2; star.size1 = .16; star.minPx = 10; star.color.copy(this.white);
    }
    for (let i = 0; i < 3; i++) {
      const dizzy = this.cards.spawn();
      dizzy.center.set(pos.x, pos.y + 1.75, pos.z); dizzy.motion = Motion.Orbit; dizzy.radius = .32;
      dizzy.rot = i / 3 * Math.PI * 2; dizzy.spin = 7; dizzy.life = 1.1; dizzy.fadeIn = .15; dizzy.fadeOut = .3;
      dizzy.cell = PAINT.star; dizzy.size0 = dizzy.size1 = .14; dizzy.minPx = 9;
      dizzy.color.copy(this.white);
    }
  }

  private ring(pos: THREE.Vector3, color: THREE.Color, light: THREE.Color, size: number) {
    this.n.set(0, 1, 0);
    this.t2.copy(pos); this.t2.y = this.groundAt(pos.x, pos.z, pos.y + .3);
    this.decals.spawn(this.t2, this.n, CELL.ring, .15, size, .5, .6, .9, color, light, 0);
  }

  private sparkle(pos: THREE.Vector3, color: THREE.Color, light: THREE.Color, count: number, height: number) {
    for (let i = 0; i < count; i++) {
      const card = this.cards.spawn();
      card.center.set(pos.x, pos.y + .1, pos.z); card.motion = Motion.Orbit; card.radius = rand(.25, .5);
      card.rot = i / count * Math.PI * 2; card.spin = rand(3, 5); card.vel.set(0, height * rand(.8, 1.2), 0);
      card.cell = CELL.twinkle; card.life = rand(.55, .75); card.pop = true; card.fadeOut = .4;
      card.size0 = .22; card.size1 = .1; card.minPx = 8; card.maxPx = 30; card.color.copy(color); card.light.copy(light);
    }
  }

  private upgrade(pos: THREE.Vector3, local: boolean, level: number) {
    const reduced = !!this.frame?.reducedMotion;
    const count = reduced ? 2 : this.frame?.lowQuality ? 4 : level === 7 ? 8 : 6;
    if (!local && !reduced) this.ring(pos, this.color.gold, this.color.goldLight, 1.4);
    for (let i = 0; i < count; i++) {
      const card = (local ? this.fpCards : this.cards).spawn(), side = i % 2 ? 1 : -1;
      if (local) {
        card.pos.set(side * (.29 + (i % 3) * .045), -.28 + (i % 3) * .045, -.68);
        card.vel.y = reduced ? 0 : .11;
      } else {
        card.pos.set(pos.x + side * .42, pos.y + 1.2 + i % 3 * .2, pos.z);
        if (!reduced) {
          card.center.copy(pos).setY(pos.y + .4); card.motion = Motion.Orbit; card.radius = .5;
          card.rot = i / count * Math.PI * 2; card.spin = 2.8; card.vel.y = 1.3;
        }
      }
      card.cell = CELL.twinkle; card.life = .75; card.fadeIn = .08; card.fadeOut = .4; card.pop = !reduced;
      card.size0 = local ? .055 : .23; card.size1 = card.size0 * (reduced ? 1 : .65);
      card.color.copy(this.color.gold); card.light.copy(this.color.goldLight);
    }
  }

  private pickup(item: string, snapshot: WorldSnapshot | null) {
    let pos: Vec3 | null = null, rarity = 0, chest = false;
    if (snapshot) for (const loot of snapshot.loot) if (loot.id === item) { pos = loot; rarity = loot.kind === 'weapon' ? loot.rarity : 0; break; }
    if (!pos) for (const spec of this.world.chests) if (spec.id === item) { pos = spec; chest = true; break; }
    if (!pos) return;
    const at = this.a.set(pos.x, pos.y, pos.z);
    if (chest) {
      this.sparkle(at, this.color.gold, this.color.goldLight, 12, 1.6);
      this.ring(at, this.color.gold, this.color.goldLight, 2.2);
      for (let i = 0; i < 3; i++) {
        const star = this.cards.spawn();
        star.pos.set(at.x, at.y + .7, at.z); star.cell = PAINT.star; star.life = .7; star.fadeOut = .35; star.pop = true;
        star.vel.set(rand(-1.2, 1.2), rand(2.6, 3.4), rand(-1.2, 1.2)); star.gravity = 6; star.spin = rand(-6, 6);
        star.size0 = .2; star.size1 = .16; star.minPx = 6; star.color.copy(this.white);
      }
      const puff = this.cards.spawn();
      puff.pos.set(at.x, at.y + .6, at.z); puff.cell = PAINT.dust; puff.life = .4; puff.size0 = .3; puff.size1 = .7; puff.alpha = .8;
      puff.color.copy(this.surface.wood.puffLight);
      return;
    }
    const color = this.rarity[rarity], light = this.tint.copy(color).lerp(this.color.white, .55);
    this.sparkle(at, color, light, rarity >= 3 ? 12 : rarity >= 1 ? 9 : 6, 1);
    this.ring(at, color, light, rarity >= 2 ? 1.3 : 1);
  }

  private consumableColors(item: ConsumableId) {
    return item === 'acai' ? [this.color.armor, this.color.armorLight] as const
      : item === 'guarana' ? [this.color.boost, this.color.boostLight] as const : [this.color.heal, this.color.healLight] as const;
  }

  private consumable(pos: THREE.Vector3, item: ConsumableId) {
    const [color, light] = this.consumableColors(item), armor = item === 'acai', count = item === 'medkit' ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const card = this.cards.spawn();
      card.center.set(pos.x, pos.y + .3 + rand(0, .6), pos.z); card.motion = Motion.Orbit; card.radius = rand(.4, .6);
      card.rot = i / count * Math.PI * 2 + rand(-.3, .3); card.spin = armor ? -2.5 : 2; card.vel.set(0, rand(.9, 1.4), 0);
      card.cell = armor ? CELL.shard : CELL.plus; card.life = rand(.7, .9); card.pop = true; card.fadeOut = .35;
      card.size0 = .26; card.size1 = .2; card.minPx = 12; card.maxPx = 34; card.color.copy(color); card.light.copy(light);
    }
    if (armor || item === 'guarana') this.sparkle(pos, color, light, 6, 1.4);
    this.ring(pos, color, light, 1.2);
  }

  // Local cues live in the first-person scene near the lower screen corners, away from the crosshair.
  private consumableFirstPerson(item: ConsumableId) {
    const [color, light] = this.consumableColors(item);
    for (let i = 0; i < 8; i++) {
      const card = this.fpCards.spawn(), side = i % 2 ? 1 : -1;
      card.pos.set(side * rand(.3, .46), rand(-.34, -.24), -.62); card.cell = item === 'acai' ? CELL.shard : CELL.plus;
      card.vel.set(side * rand(0, .04), rand(.12, .2), 0); card.life = rand(.7, .95); card.fadeIn = .08; card.fadeOut = .4; card.pop = true;
      card.size0 = .045; card.size1 = .035; card.rot = rand(-.3, .3); card.color.copy(color); card.light.copy(light);
    }
  }

  private armorBreak(pos: THREE.Vector3, local: boolean) {
    const star = this.cards.spawn();
    star.pos.copy(pos); star.cell = CELL.twinkle; star.life = .12; star.size0 = .5; star.size1 = .3; star.minPx = 10; star.maxPx = 40;
    star.color.copy(this.color.armor); star.light.copy(this.color.white);
    const floor = this.groundAt(pos.x, pos.z, pos.y) + .03;
    for (let i = 0; i < 9; i++) {
      const shard = this.cards.spawn();
      shard.pos.copy(pos); shard.cell = CELL.shard; shard.life = rand(.42, .52); shard.rot = rand(0, 6.3); shard.spin = rand(-10, 10);
      shard.vel.set(rand(-2.8, 2.8), rand(1.4, 3.2), rand(-2.8, 2.8)); shard.gravity = 9; shard.floor = floor; shard.bounce = .3;
      shard.size0 = .22; shard.size1 = .16; shard.minPx = 9; shard.maxPx = 30;
      shard.color.copy(this.color.armor); shard.light.copy(this.color.armorLight);
    }
    if (!local) return;
    for (let i = 0; i < 8; i++) {
      const shard = this.fpCards.spawn(), side = i % 2 ? 1 : -1;
      shard.pos.set(side * rand(.34, .5), rand(-.3, .1), -.6); shard.cell = CELL.shard; shard.life = rand(.35, .5);
      shard.vel.set(side * rand(.2, .45), rand(-.1, .25), 0); shard.gravity = .8; shard.rot = rand(0, 6.3); shard.spin = rand(-9, 9);
      shard.size0 = .05; shard.size1 = .035; shard.color.copy(this.color.armor); shard.light.copy(this.color.armorLight);
    }
  }

  clear() {
    this.waterActors.clear(); this.waterTime = 0; this.stages.clear();
    for (const system of this.systems) system.clear();
    for (const p of this.pending) p.active = false;
    for (const pebble of this.pebbles) pebble.card = null;
  }

  // Warm-up only: every effect program compiles and uploads with one hidden instance.
  warm(on: boolean) { for (const system of this.systems) system.warm(on); }

  dispose() {
    this.scene.remove(this.decals.mesh, this.casings.mesh, this.tracers.mesh, this.cards.mesh);
    this.fpScene.remove(this.fpCasings.mesh, this.fpCards.mesh);
    for (const system of this.systems) system.dispose();
    this.atlas.dispose();
  }
}
