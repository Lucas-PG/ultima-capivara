import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CharacterMask } from '../src/render/character-mask';

describe('character silhouette isolation', () => {
  it.each([false, true])('restores world camera, background and shadow state after mask rendering (failure=%s)', fail => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), background = new THREE.Color('#FFD49A');
    const original = new THREE.MeshBasicMaterial(); scene.background = background; scene.overrideMaterial = original;
    camera.layers.enable(3); const layers = camera.layers.mask;
    const gl = {
      shadowMap: { enabled: true }, getClearAlpha: () => 1,
      getClearColor: (color: THREE.Color) => color.set('#F2DCB6'), setClearColor: vi.fn(), setRenderTarget: vi.fn(),
      render: vi.fn(() => {
        expect(camera.layers.mask).toBe(2); expect(scene.background).toBeNull();
        expect(scene.overrideMaterial).not.toBe(original); expect(gl.shadowMap.enabled).toBe(false);
        if (fail) throw new Error('lost context');
      }),
    };
    const mask = new CharacterMask(new THREE.DepthTexture(1, 1));
    if (fail) expect(() => mask.render(gl as unknown as THREE.WebGLRenderer, scene, camera)).toThrow('lost context');
    else mask.render(gl as unknown as THREE.WebGLRenderer, scene, camera);
    expect(camera.layers.mask).toBe(layers); expect(scene.background).toBe(background);
    expect(scene.overrideMaterial).toBe(original); expect(gl.shadowMap.enabled).toBe(true);
    expect(gl.setClearColor.mock.lastCall?.[1]).toBe(1);
    mask.dispose();
  });
});
