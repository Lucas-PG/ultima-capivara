import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { cacheStaticMatrices } from '../src/render/static-matrices';

function graph() {
  const scene = new THREE.Scene(), parent = new THREE.Group(), root = new THREE.Group();
  const child = new THREE.Group(), nested = new THREE.Object3D();
  parent.position.set(2, 3, -4); parent.rotation.set(.1, -.4, .2);
  root.position.set(-3, .5, 8); root.scale.set(.8, 1.2, .9);
  child.position.set(4, 1, 2); child.rotation.set(.3, .6, -.2); nested.position.set(.2, -1, 3);
  scene.add(parent); parent.add(root); root.add(child); child.add(nested);
  return { scene, parent, root, child, nested };
}
function exact(a: ReturnType<typeof graph>, b: ReturnType<typeof graph>) {
  for (const key of ['scene', 'parent', 'root', 'child', 'nested'] as const) {
    expect(new Float64Array(a[key].matrixWorld.elements)).toEqual(new Float64Array(b[key].matrixWorld.elements));
    expect(a[key].matrixWorldNeedsUpdate).toBe(b[key].matrixWorldNeedsUpdate);
  }
}

describe('static subtree matrix cache', () => {
  it('keeps exact matrices and visibility while skipping forced descendant updates', () => {
    const cached = graph(), reference = graph(); cacheStaticMatrices(cached.root);
    const update = vi.spyOn(cached.child, 'updateMatrixWorld');
    cached.scene.updateMatrixWorld(true); reference.scene.updateMatrixWorld(true); exact(cached, reference);
    update.mockClear(); cached.child.visible = reference.child.visible = false;
    for (let i = 0; i < 10; i++) { cached.scene.updateMatrixWorld(true); reference.scene.updateMatrixWorld(true); exact(cached, reference); }
    expect(update).not.toHaveBeenCalled(); expect(cached.child.visible).toBe(false);
  });

  it('refreshes exactly when ancestors, the root or explicitly invalidated descendants move', () => {
    const cached = graph(), reference = graph(), invalidate = cacheStaticMatrices(cached.root);
    const step = () => { cached.scene.updateMatrixWorld(true); reference.scene.updateMatrixWorld(true); exact(cached, reference); };
    step(); cached.parent.rotation.y = reference.parent.rotation.y = .7; step();
    cached.root.position.y = reference.root.position.y = 1.5; step();
    cached.child.rotation.x = reference.child.rotation.x = -.3; invalidate(); step();
    const child = new THREE.Object3D(), refChild = new THREE.Object3D();
    child.position.set(8, 2, 1); refChild.position.copy(child.position);
    cached.root.add(child); reference.root.add(refChild); invalidate(); step();
    expect(new Float64Array(child.matrixWorld.elements)).toEqual(new Float64Array(refChild.matrixWorld.elements));
    cached.scene.add(cached.root); reference.scene.add(reference.root); step();
  });

  it('respects manually managed local/world matrices without extra random calls', () => {
    const cached = graph(), reference = graph();
    cached.root.matrixAutoUpdate = reference.root.matrixAutoUpdate = false;
    cached.root.matrix.makeRotationY(.2); reference.root.matrix.copy(cached.root.matrix);
    const random = vi.spyOn(Math, 'random');
    try {
      cacheStaticMatrices(cached.root);
      cached.scene.updateMatrixWorld(true); reference.scene.updateMatrixWorld(true); exact(cached, reference);
      cached.root.matrixWorldAutoUpdate = reference.root.matrixWorldAutoUpdate = false;
      cached.root.matrixWorld.makeTranslation(9, 2, 3); reference.root.matrixWorld.copy(cached.root.matrixWorld);
      cached.scene.updateMatrixWorld(true); reference.scene.updateMatrixWorld(true); exact(cached, reference);
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it('invalidates on removal before detached updates and reparenting', () => {
    const cached = graph(), reference = graph(); cacheStaticMatrices(cached.root);
    cached.scene.updateMatrixWorld(true); reference.scene.updateMatrixWorld(true); exact(cached, reference);
    const update = vi.spyOn(cached.child, 'updateMatrixWorld');
    cached.root.removeFromParent(); reference.root.removeFromParent();
    cached.child.position.z = reference.child.position.z = 6;
    cached.root.updateMatrixWorld(true); reference.root.updateMatrixWorld(true); exact(cached, reference);
    expect(update).toHaveBeenCalledTimes(1);
    cached.scene.add(cached.root); reference.scene.add(reference.root);
    cached.scene.updateMatrixWorld(true); reference.scene.updateMatrixWorld(true); exact(cached, reference);
    expect(update).toHaveBeenCalledTimes(2);
  });
});
