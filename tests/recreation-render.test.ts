import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { RecreationView } from '../src/render/recreation';
import { KIT_PIECES } from '../src/shared/kit-collision';
import type { AssetLoader } from '../src/render/assets';
import type { ActorState, WorldSpec } from '../src/shared/types';

function fixture() {
  const scene = new THREE.Group(), material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  for (const kind of ['mud_bath', 'trampoline']) for (let lod = 0; lod < 3; lod++) {
    const deck = KIT_PIECES[kind].colliders[0]; if (deck.type !== 'cylinder') throw new Error('Expected authored deck');
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(deck.radius, deck.radius, deck.height, 32 >> lod).translate(0, deck.y, 0), material);
    mesh.name = `${kind}_LOD${lod}`; scene.add(mesh);
  }
  const world = { pieces: [
    { id: 'bath', piece: 'mud_bath', x: 8, y: 2, z: 6, yaw: Math.PI / 2, scale: 1.25 },
    { id: 'pad', piece: 'trampoline', x: 0, y: 1, z: 0, yaw: .2 },
    { id: 'crate', piece: 'crate', x: 30, y: 0, z: 30, yaw: 0 },
  ], mudBaths: [{ id: 'bath', x: 8, y: 2 + .12 * 1.25, z: 6, radius: 1.45 * 1.25 }],
  trampolines: [{ id: 'pad', x: 0, y: 1.32, z: 0, radius: 1.38, impulse: 12 }] } as WorldSpec;
  const gltf = vi.fn(async () => ({ scene }));
  const view = new RecreationView(world, { gltf } as unknown as AssetLoader);
  return { view, world, source: scene, material, gltf };
}

function uniforms(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
  return shader.uniforms as Record<string, { value: any }>;
}

it('loads one shared kit and keeps authored transformed play surfaces and gameplay metadata intact', async () => {
  const h = fixture(), before = structuredClone(h.world); await h.view.ready;
  expect(h.gltf).toHaveBeenCalledOnce(); expect([...h.view.pieceIds]).toEqual(['bath', 'pad']);
  h.view.group.updateMatrixWorld(true);
  const bath = h.view.group.getObjectByName('recreation:bath')!;
  const surface = bath.getObjectByName('Lama viva')!;
  expect(surface.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(h.world.mudBaths![0].y + .025 * 1.25);
  expect(bath.rotation.y).toBe(Math.PI / 2); expect(bath.scale.x).toBe(1.25);
  const sourceDeck = h.source.getObjectByName('trampoline_LOD0') as THREE.Mesh;
  const softDeck = h.view.group.getObjectByName('trampoline_LOD0') as THREE.Mesh;
  expect(softDeck.geometry.index!.count).toBeGreaterThan(sourceDeck.geometry.index!.count);
  expect(softDeck.geometry.index!.count / 3).toBeLessThan(2000);
  expect(h.world).toEqual(before); h.view.dispose();
});

it('uses predicted grounded bath contact for body rings and removes it as soon as the capy leaves', async () => {
  const h = fixture(); await h.view.ready;
  const mud = h.view.group.getObjectByName('Lama viva') as THREE.Mesh, shader = uniforms(mud.material as THREE.Material);
  const actor = { id: 'me', alive: true, grounded: true, pos: { x: 30, y: 0, z: 30 } } as ActorState;
  const predicted = { ...actor, pos: { ...h.world.mudBaths![0], x: 8.5 } };
  h.view.update(1, undefined, false, [actor], predicted);
  expect(shader.mudContacts.value[0].w).toBe(1);
  expect(shader.mudContacts.value[0].y).toBeCloseTo(.4);
  predicted.grounded = false; h.view.update(2, undefined, false, [actor], predicted);
  expect(shader.mudContacts.value.every((contact: THREE.Vector4) => contact.w === 0)).toBe(true);
  h.view.dispose();
});

it('deforms only the contacted pad, settles, and respects reduced motion and a new match reset', async () => {
  const h = fixture(); await h.view.ready;
  const pad = h.view.group.getObjectByName('trampoline_LOD0') as THREE.Mesh, shader = uniforms(pad.material as THREE.Material);
  h.view.update(1); h.view.bounce({ x: 20, y: 1.32, z: 0 }); h.view.update(1.1);
  expect(shader.playDip.value).toBe(0);
  h.view.bounce(h.world.trampolines![0]); h.view.update(1.18);
  expect(shader.playDip.value).toBeLessThan(-.05); expect(shader.playDip.value).toBeGreaterThan(-.2);
  h.view.update(1.2, undefined, true); expect(shader.playDip.value).toBe(0);
  h.view.update(3); expect(shader.playDip.value).toBe(0);
  h.view.bounce(h.world.trampolines![0]); h.view.reset(); h.view.update(3.1);
  expect(shader.playDip.value).toBe(0); expect(shader.playBounceAge.value).toBe(5);
  h.view.dispose();
});

it('keeps Low bubbles and steam bounded and disposes owned resources once without releasing the shared atlas', async () => {
  const h = fixture(); await h.view.ready;
  const resources = new Set<THREE.BufferGeometry | THREE.Material>(), instances: THREE.InstancedMesh[] = [];
  h.view.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry); resources.add(object.material as THREE.Material);
    expect(object.castShadow).toBe(false);
    if (object instanceof THREE.InstancedMesh) instances.push(object);
  });
  h.view.setQuality('low');
  const bubbles = h.view.group.getObjectByName('Bolhas de lama') as THREE.InstancedMesh;
  const steam = h.view.group.getObjectByName('Vapor morno') as THREE.InstancedMesh;
  expect(bubbles.count).toBe(3); expect(steam.count).toBe(2);
  h.view.update(2, undefined, true); expect(steam.visible).toBe(false);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(100, 10, 100); camera.updateMatrixWorld();
  h.view.update(3, camera); expect(h.view.group.getObjectByName('Vida no banho')!.visible).toBe(false);
  const owned = [...resources, ...instances].map(resource => vi.spyOn(resource, 'dispose'));
  const sourceMap = vi.spyOn(h.material.map!, 'dispose'), sourceMaterial = vi.spyOn(h.material, 'dispose');
  h.view.dispose(); h.view.dispose();
  for (const dispose of owned) expect(dispose).toHaveBeenCalledOnce();
  expect(sourceMap).not.toHaveBeenCalled(); expect(sourceMaterial).not.toHaveBeenCalled();
});
