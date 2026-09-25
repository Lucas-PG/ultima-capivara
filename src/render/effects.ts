import * as THREE from 'three';
import { rarityOf } from '../shared/rarity';
import { terrainHeight } from '../shared/terrain';
import type { Collider, ConsumableId, GameEvent, Surface, Vec3, WeaponId, WorldSnapshot, WorldSpec } from '../shared/types';
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
}

// One palette table (bible §3, §11). Values are the authored sRGB hexes.
const HEX = {
  // Muzzle flash, pow, fur, stars and chips come painted from the F2 flipbook sheet.
  flash: '#ffb84d',
  tracer: '#ffe3a1', tracerCore: '#fff4e2', tracerHostile: '#ff6b4a',
  gold: '#ffc23d', goldLight: '#ffe7a3', cloudLight: '#fff4e2',
  heal: '#3aa35a', healLight: '#8cc453', armor: '#2f9df4', armorLight: '#bfd8e6', boost: '#e9b44c', boostLight: '#ffe7a3',
  alert: '#e5412d', alertLight: '#ffc23d', white: '#f4fbf6',
  pebble: '#bbae98', pebbleLight: '#d8c8aa',
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

// Flash size in metres (third person) and in first-person scene units.
const FLASH: Partial<Record<WeaponId, { world: number; fp: number }>> = {
  pistol: { world: .42, fp: .16 }, smg: { world: .38, fp: .15 }, m4: { world: .5, fp: .19 },
  shotgun: { world: .7, fp: .28 }, dmr: { world: .55, fp: .21 }, sniper: { world: .7, fp: .26 },
};
const TRACER_WIDTH: Partial<Record<WeaponId, number>> = { pistol: .018, smg: .016, m4: .02, shotgun: .016, dmr: .024, sniper: .028 };
export const MARK_LIFE = 4;

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
  private readonly grid = new Map<number, Collider[]>();
  private readonly pending: Pending[] = [];
  private readonly pebbles: Pebble[] = [];
  private frame: EffectsFrame | null = null;
  // Scratch values: events and frames reuse these instead of allocating.
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly t1 = new THREE.Vector3();
  private readonly t2 = new THREE.Vector3();
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
    this.decals = new DecalSystem(this.atlas, 64);
    this.casings = new CasingSystem(64, true, (x, z, top) => this.groundAt(x, z, top));
    this.fpCards = new CardSystem(this.atlas, this.painted, 80, 10);
    this.systems = [this.cards, this.fpCards, this.tracers, this.decals, this.casings, this.fpCasings];
    scene.add(this.decals.mesh, this.casings.mesh, this.tracers.mesh, this.cards.mesh);
    fpScene.add(this.fpCasings.mesh, this.fpCards.mesh);
    // Owned and disposed here, not by the scenes' generic disposal passes.
    for (const mesh of [this.decals.mesh, this.casings.mesh, this.tracers.mesh, this.cards.mesh, this.fpCasings.mesh, this.fpCards.mesh]) mesh.userData.effects = true;
    // Third-person barrel tips: the mean of the vertices at the front (-z) of each held model.
    for (const id of ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'slingshot', 'machete'] as WeaponId[]) {
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
    if (list) for (const c of list) if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= top && c.max.y > ground) ground = c.max.y;
    return ground;
  }

  private readonly resolveAnchor = (id: string, out: THREE.Vector3) => {
    const visual = this.frame?.avatars.get(id);
    if (!visual || !visual.group.visible) return false;
    out.copy(visual.group.position); out.y += 2.45 * visual.group.scale.y; return true;
  };

  update(dt: number, frame: EffectsFrame) {
    this.frame = frame;
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
    else if (event.type === 'impact') {
      for (const pebble of this.pebbles) if (pebble.card && pebble.actor === event.actor) { pebble.card.life = 0; pebble.card = null; break; }
      this.impact(this.a.copy(event.pos), event.surface, this.n.copy(event.normal), event.weapon, 1);
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
    const muzzle = this.b, end = this.c.set(event.end.x, event.end.y, event.end.z);
    let streak = true;
    if (own && f) {
      weaponView.shot(weapon);
      const fp = weaponView.muzzleWorld(this.t1), ads = weaponView.adsAmount;
      this.flash(fp, weapon, true, ads);
      if (weapon !== 'machete' && weapon !== 'slingshot') {
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
        this.flash(muzzle, weapon, false, 0);
        if (weapon !== 'machete' && weapon !== 'slingshot' && f && muzzle.distanceToSquared(f.camera.position) < 30 * 30) {
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
    if (weapon === 'slingshot') { this.pebble(muzzle, event); return; }
    if (streak && FLASH[weapon]) {
      const hostile = !!playerId && event.actor !== playerId && this.passesNear(muzzle, end, snapshot, playerId);
      this.tracers.spawn(muzzle, end, .11, TRACER_WIDTH[weapon] || .018, own ? .7 : .95,
        hostile ? this.color.tracerHostile : this.color.tracer, hostile ? this.color.tracer : this.color.tracerCore, hostile ? 2.2 : 1.4);
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
      let head = false, found = false;
      for (const p of this.pending) if (p.active && p.attacker === event.actor) { head ||= p.head; p.active = false; found = true; }
      if (found) this.hitStar(end, head);
    }
  }

  // Tints enemy tracers red when their line passes within 2.5 m of your head.
  private passesNear(from: THREE.Vector3, to: THREE.Vector3, snapshot: WorldSnapshot | null, playerId: string) {
    const me = this.actorPos(snapshot, playerId);
    if (!me) return false;
    const head = this.t2.set(me.x, me.y + 1.5, me.z), line = this.t1.subVectors(to, from);
    const k = THREE.MathUtils.clamp(this.a.subVectors(head, from).dot(line) / Math.max(1e-6, line.lengthSq()), 0, 1);
    return this.a.copy(from).addScaledVector(line, k).distanceToSquared(head) < 2.5 * 2.5;
  }

  private flash(pos: THREE.Vector3, weapon: WeaponId, fp: boolean, ads: number) {
    const size = FLASH[weapon];
    if (!size) return;
    // In third person the flash sits just in front of the barrel so the gun and paws never clip it.
    if (!fp && this.frame) pos = this.t2.subVectors(this.frame.camera.position, pos).normalize().multiplyScalar(size.world * .6).add(pos);
    // Third person only, spawned first so it draws under the flash: a small warm puff at the barrel.
    // In first person it would sit in the sight line.
    if (!fp) {
      const smoke = this.cards.spawn();
      smoke.pos.copy(pos); smoke.cell = PAINT.dust + (Math.random() < .5 ? 0 : 1); smoke.life = weapon === 'shotgun' || weapon === 'sniper' ? .42 : .3;
      smoke.size0 = size.world * .4; smoke.size1 = size.world * .95; smoke.alpha = .6; smoke.rot = rand(-.5, .5); smoke.minPx = 5;
      smoke.vel.set(rand(-.1, .1), .5, rand(-.1, .1)); smoke.drag = 2; smoke.fadeOut = .6;
      smoke.color.copy(this.color.cloudLight);
    }
    const card = (fp ? this.fpCards : this.cards).spawn();
    card.pos.copy(pos); card.motion = Motion.Flash; card.cell = PAINT.flash;
    card.life = .05; card.fadeOut = .01; card.rot = rand(0, Math.PI * 2);
    card.size0 = card.size1 = (fp ? size.fp * (1 - ads * .4) : size.world) * rand(.9, 1.1);
    // The smallest painted frame is about 45% visible width after rotation and post-processing.
    card.minPx = fp ? 0 : 28; card.maxPx = fp ? 1e5 : 90; card.color.copy(this.white);
  }

  private pebble(from: THREE.Vector3, event: Extract<GameEvent, { type: 'shot' }>) {
    let slot = this.pebbles[0];
    for (const p of this.pebbles) if (!p.card) { slot = p; break; }
    const card = this.cards.spawn();
    card.pos.copy(from); card.cell = CELL.chip; card.life = 3; card.fadeOut = .02;
    card.vel.set(event.end.x - event.origin.x, event.end.y - event.origin.y, event.end.z - event.origin.z).normalize().multiplyScalar(50);
    card.gravity = 9.8; card.size0 = card.size1 = .07; card.minPx = 4; card.spin = 14;
    card.color.copy(this.color.pebble); card.light.copy(this.color.pebbleLight);
    slot.card = card; slot.actor = event.actor;
  }

  private impact(pos: THREE.Vector3, surface: Surface, normal: THREE.Vector3, weapon: WeaponId, scale: number) {
    const s = this.surface[surface], spec = SURFACES[surface];
    const big = weapon === 'sniper' || weapon === 'dmr' || weapon === 'slingshot' ? 1.3 : weapon === 'shotgun' ? .75 : 1;
    const k = big * scale;
    if (surface === 'water') {
      this.decals.spawn(pos, normal, CELL.ring, .15 * k, 1.1 * k, .45, .6, .9, s.mark, s.markLight, rand(0, 6.3));
      for (let i = 0; i < 4 + Math.round(k * 2); i++) {
        const drop = this.cards.spawn();
        drop.pos.copy(pos); drop.cell = CELL.drop; drop.stretch = true; drop.aspect = 1.6; drop.life = rand(.32, .44);
        drop.vel.set(rand(-1.1, 1.1), rand(2.8, 4.2) * k, rand(-1.1, 1.1)); drop.gravity = 11;
        drop.size0 = .12 * k; drop.size1 = .08 * k; drop.minPx = 5; drop.color.copy(s.bit); drop.light.copy(s.bitLight);
      }
      const mist = this.cards.spawn();
      mist.pos.copy(pos); mist.cell = PAINT.dust; mist.life = .38; mist.size0 = .18 * k; mist.size1 = .55 * k; mist.alpha = .7; mist.minPx = 8;
      mist.vel.set(0, .6, 0); mist.color.copy(s.puffLight);
      return;
    }
    const floor = this.groundAt(pos.x, pos.z, pos.y + .05) + .01;
    const puff = this.cards.spawn();
    puff.pos.copy(pos).addScaledVector(normal, .06); puff.cell = PAINT.dust + (Math.random() < .5 ? 0 : 1); puff.life = rand(.34, .44);
    puff.size0 = .26 * k; puff.size1 = (surface === 'metal' ? .36 : .68) * k; puff.rot = rand(-.4, .4); puff.minPx = 10;
    puff.vel.copy(normal).multiplyScalar(.7); puff.vel.y += .35; puff.drag = 3; puff.fadeOut = .5;
    puff.color.copy(s.puffLight);
    const sparks = surface === 'metal', system = this.cards;
    for (let i = 0; i < Math.round(spec.bits * scale); i++) {
      const bit = system.spawn();
      bit.pos.copy(pos).addScaledVector(normal, .03); bit.cell = spec.bitCell; bit.life = rand(.26, .42);
      this.t1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).addScaledVector(normal, 1.3).normalize();
      bit.vel.copy(this.t1).multiplyScalar(sparks ? rand(4, 7) : rand(2, 3.6)); bit.vel.y += sparks ? .5 : 1.4;
      bit.gravity = sparks ? 6 : surface === 'foliage' ? 4 : 10; bit.drag = surface === 'foliage' ? 2.5 : .6;
      bit.floor = floor; bit.bounce = .3;
      bit.size0 = (sparks ? .07 : .09) * k; bit.size1 = bit.size0 * (sparks ? .6 : .8); bit.minPx = sparks ? 5 : 4;
      bit.stretch = sparks || spec.bitCell === CELL.splinter; bit.aspect = sparks ? 4 : spec.bitCell === CELL.splinter ? 2 : 1;
      bit.rot = rand(0, 6.3); bit.spin = sparks ? 0 : rand(-12, 12); bit.fadeOut = .3;
      bit.color.copy(s.bit); bit.light.copy(s.bitLight);
      // Painted chips: wood in its own colours, generic chips tinted with the surface.
      if (spec.bitCell === CELL.splinter) { bit.cell = i % 3 === 2 ? PAINT.splinter : PAINT.wood + (i % 2); bit.stretch = false; bit.aspect = 1; bit.size0 *= 1.3; bit.size1 *= 1.3; bit.color.copy(this.white); }
      else if (spec.bitCell === CELL.chip) { bit.cell = PAINT.chip; bit.color.copy(s.bitLight); }
    }
    if (sparks) {
      const star = this.cards.spawn();
      star.pos.copy(pos).addScaledVector(normal, .04); star.cell = CELL.twinkle; star.life = .08; star.fadeOut = .5;
      star.size0 = .3 * k; star.size1 = .14 * k; star.minPx = 10; star.rot = rand(0, 1.5); star.color.copy(this.color.flash); star.light.copy(this.color.white);
    }
    const mark = (spec.markCell === CELL.hole ? .09 : .13) * big * (scale < 1 ? .8 : 1);
    this.decals.spawn(pos, normal, spec.markCell, mark, mark, MARK_LIFE, .3, .9, s.mark, s.markLight, rand(0, 6.3));
  }

  // White-orange "pow" and fur tufts; a headshot adds a gold star held in front of the head.
  // Pixel floors are on the card; the painted subjects fill about two thirds of it.
  private hitStar(at: THREE.Vector3, head: boolean) {
    // Out of the body toward the viewer, past the head sphere and body cylinder surfaces.
    const pos = this.t2.copy(at);
    if (this.frame) pos.add(this.t1.subVectors(this.frame.camera.position, at).normalize().multiplyScalar(.32));
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
    star.vel.set(0, .5, 0); star.drag = 2; star.spin = 3; star.size0 = .55; star.size1 = .6; star.minPx = 38; star.maxPx = 96;
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
