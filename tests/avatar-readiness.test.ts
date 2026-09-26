import * as THREE from 'three';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { GameRenderer } from '../src/render/renderer';
import { disposeCapybaraAssets, preloadCapybaraAsset } from '../src/render/capybara';
import { AvatarView } from '../src/render/avatars';
import type { ActorState } from '../src/shared/types';

vi.mock('../src/render/thumbnails', () => ({ loadWeaponThumbnails: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/render/weapons', () => ({ WeaponView: vi.fn() }));

beforeAll(() => {
  const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
});
afterAll(() => vi.unstubAllGlobals());

let source: THREE.Group;
beforeEach(async () => {
  disposeCapybaraAssets();
  source = new THREE.Group();
  const bones = ['root', 'head', 'arm_L', 'arm_R'].map(name => {
    const bone = new THREE.Bone(); bone.name = name; return bone;
  });
  source.add(bones[0]); bones[0].add(...bones.slice(1));
  const skeleton = new THREE.Skeleton(bones), material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.BoxGeometry(), count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex++) weights[vertex * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = `Capybara_LOD${i}`; mesh.bind(skeleton); source.add(mesh);
  }
  await preloadCapybaraAsset(async () => ({ scene: source, animations: ['idle', 'run', 'jump'].map(name => new THREE.AnimationClip(name, 1, [])) }) as unknown as GLTF);
});

const actor = (id: string, name = 'Capivara', color = '#1fb5a8') => ({ id, name, color }) as ActorState;

describe('match avatar preparation', () => {
  it.each([false, true])('disposes avatars and shared assets once, including pending warmup = %s', async warming => {
    vi.stubGlobal('location', { search: '?capy=v3&capyHitboxes' });
    const scene = new THREE.Scene(), view = new AvatarView(scene, new THREE.PerspectiveCamera());
    view.prepare([actor('first'), actor('second')]);
    let finishCompile!: () => void;
    const compilation = new Promise<void>(resolve => { finishCompile = resolve; });
    const owned = () => ({ dispose: vi.fn() });
    const compile = vi.fn(() => compilation);
    const renderer = Object.assign(Object.create(GameRenderer.prototype), {
      disposed: false, warming: null, scene, avatars: view, camera: new THREE.PerspectiveCamera(),
      worldView: { group: new THREE.Group(), ...owned() },
      ambientLife: owned(),
      sky: { group: new THREE.Group(), ...owned() }, storm: { mesh: new THREE.Mesh(), ...owned() },
      weaponView: { assets: Promise.resolve(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), revealAll: vi.fn(), ...owned() },
      environment: owned(), pipeline: { beginWarmup: vi.fn(), resize: vi.fn(), ...owned() }, assets: { ready: vi.fn().mockResolvedValue(undefined), prepareTextures: vi.fn(), ...owned() },
      onProgress: vi.fn(), resize: vi.fn(), effects: { warm: vi.fn(), ...owned() },
      gl: { compileAsync: compile, setRenderTarget: vi.fn(), shadowMap: { enabled: true }, ...owned() },
    }) as GameRenderer;
    const pending = warming ? Promise.allSettled([renderer.warmup()]) : null;
    if (warming) await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce());
    const resources = new Set<{ dispose(): void }>();
    const collect = (root: THREE.Object3D) => root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) resources.add(object.geometry);
      if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line) {
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          resources.add(mat);
          for (const value of Object.values(mat)) if (value instanceof THREE.Texture) resources.add(value);
        }
      }
    });
    collect(source); collect(scene);
    // Held weapon material is owned by the world's item renderer, not by capybara assets.
    resources.delete(view.get('first')!.weapon.material as THREE.Material);
    const disposals = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    renderer.dispose(); renderer.dispose();
    finishCompile();
    if (pending) expect((await pending)[0].status).toBe('rejected');
    expect(scene.children).toHaveLength(0);
    expect(view.get('first')).toBeUndefined(); expect(view.get('second')).toBeUndefined();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    vi.stubGlobal('location', { search: '' });
  });

  it('refreshes changed identity before a rematch and releases only replaced instance resources', () => {
    const scene = new THREE.Scene(), view = new AvatarView(scene, new THREE.PerspectiveCamera());
    view.prepare([actor('practice')]);
    const before = view.get('practice')!;
    const skeleton = vi.spyOn(before.body.skeleton, 'dispose');
    const geometry = vi.spyOn(before.body.geometry, 'dispose');
    const weapon = vi.spyOn(before.weapon.geometry, 'dispose');
    const label = vi.spyOn(before.label.material.map!, 'dispose');
    view.prepare([actor('practice', 'Outra capivara', '#e76f51')]);
    const after = view.get('practice')!;
    expect(after).not.toBe(before);
    expect(after.name).toBe('Outra capivara'); expect(after.color).toBe('#e76f51');
    expect(scene.children).toContain(after.group); expect(scene.children).not.toContain(before.group);
    expect(skeleton).toHaveBeenCalledOnce(); expect(label).toHaveBeenCalledOnce();
    expect(geometry).toHaveBeenCalledOnce(); expect(weapon).not.toHaveBeenCalled();
    view.prepare([actor('practice', 'Outra capivara', '#e76f51')]);
    expect(view.get('practice')).toBe(after);
    view.dispose(); expect(skeleton).toHaveBeenCalledOnce();
  });

  it('removes departed ids and bounds retained avatars across three matches', () => {
    const scene = new THREE.Scene(), view = new AvatarView(scene, new THREE.PerspectiveCamera());
    view.prepare([actor('practice'), actor('bot-first')]);
    const retained = view.get('practice')!, departed = view.get('bot-first')!;
    const skeleton = vi.spyOn(departed.body.skeleton, 'dispose');
    for (const id of ['bot-second', 'bot-third']) {
      view.prepare([actor('practice'), actor(id)]);
      expect(scene.children).toHaveLength(2);
      expect(view.get('practice')).toBe(retained);
      expect(view.get('bot-first')).toBeUndefined();
    }
    expect(view.get('bot-second')).toBeUndefined();
    expect(skeleton).toHaveBeenCalledOnce();
    view.dispose(); expect(skeleton).toHaveBeenCalledOnce();
  });
});
