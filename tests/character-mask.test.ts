import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CharacterMask } from '../src/render/character-mask';

describe('character silhouette isolation', () => {
  it.each([false, true])('restores world camera, background and shadow state after mask rendering (failure=%s)', fail => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), background = new THREE.Color('#FFD49A');
    const original = new THREE.MeshBasicMaterial(); scene.background = background; scene.overrideMaterial = original;
    camera.layers.enable(3); const layers = camera.layers.mask;
    // A character skin (layer 1) and a world mesh: only the skin is drawn, in a mask material.
    const skinMaterial = new THREE.MeshStandardMaterial(), skin = new THREE.Mesh(new THREE.BoxGeometry(), skinMaterial); skin.layers.enable(1);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); scene.add(skin, wall);
    const gl = {
      shadowMap: { enabled: true }, getClearAlpha: () => 1,
      getClearColor: (color: THREE.Color) => color.set('#F2DCB6'), setClearColor: vi.fn(), setRenderTarget: vi.fn(),
      render: vi.fn((maskScene: THREE.Scene) => {
        expect(maskScene).not.toBe(scene); expect(maskScene).toBeInstanceOf(THREE.Scene);
        expect(maskScene.children).toBe(scene.children); expect(skin.parent).toBe(scene); expect(wall.parent).toBe(scene);
        expect(maskScene.matrixWorld).toBe(scene.matrixWorld); expect(maskScene.matrixWorldAutoUpdate).toBe(false);
        expect(camera.layers.mask).toBe(2); expect(maskScene.background).toBeNull(); expect(maskScene.overrideMaterial).toBeNull();
        expect(scene.background).toBeNull(); expect(scene.overrideMaterial).toBeNull(); expect(scene.matrixWorldAutoUpdate).toBe(false);
        expect(skin.material).not.toBe(skinMaterial); expect(skin.material).toBeInstanceOf(THREE.MeshBasicMaterial);
        expect(gl.shadowMap.enabled).toBe(false);
        if (fail) throw new Error('lost context');
      }),
    };
    const mask = new CharacterMask(new THREE.DepthTexture(1, 1));
    if (fail) expect(() => mask.render(gl as unknown as THREE.WebGLRenderer, scene, camera)).toThrow('lost context');
    else mask.render(gl as unknown as THREE.WebGLRenderer, scene, camera);
    expect(camera.layers.mask).toBe(layers); expect(scene.background).toBe(background);
    expect(scene.overrideMaterial).toBe(original); expect(skin.material).toBe(skinMaterial); expect(gl.shadowMap.enabled).toBe(true);
    expect(gl.setClearColor.mock.lastCall?.[1]).toBe(1);
    mask.dispose();
  });

  it('reuses an independent render identity per world without moving children or consuming randomness', () => {
    const scene = new THREE.Scene(), other = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const mask = new CharacterMask(new THREE.DepthTexture(1, 1));
    const gl = {
      shadowMap: { enabled: true }, getClearAlpha: () => 1,
      getClearColor: (color: THREE.Color) => color.set('#F2DCB6'), setClearColor: vi.fn(), setRenderTarget: vi.fn(), render: vi.fn(),
    };
    const random = vi.spyOn(Math, 'random');
    try {
      mask.render(gl as unknown as THREE.WebGLRenderer, scene, camera);
      const firstView = gl.render.mock.calls[0][0] as THREE.Scene;
      expect(random).not.toHaveBeenCalled();
      const child = new THREE.Group(); scene.add(child); random.mockClear();
      scene.position.set(3, 2, 1); scene.updateMatrixWorld();
      mask.render(gl as unknown as THREE.WebGLRenderer, scene, camera);
      expect(gl.render.mock.calls[1][0]).toBe(firstView);
      expect(firstView.children).toEqual([child]); expect(child.parent).toBe(scene);
      expect(firstView.matrixWorld.elements).toEqual(scene.matrixWorld.elements);
      mask.render(gl as unknown as THREE.WebGLRenderer, other, camera);
      expect(gl.render.mock.calls[2][0]).not.toBe(firstView);
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); mask.dispose(); }
  });
});
