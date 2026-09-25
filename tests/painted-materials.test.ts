import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyCharacterStyle, createToonMaterial } from '../src/render/materials';

describe('painted character material contract', () => {
  it('preserves imported maps, vertex colours and prior shader hooks after bandana cloning', () => {
    const map = new THREE.Texture(), emissiveMap = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({ map, emissiveMap, vertexColors: true, emissive: '#FFF4E2' });
    applyCharacterStyle(source);
    const clone = source.clone(), previous = vi.fn();
    clone.onBeforeCompile = previous; clone.customProgramCacheKey = () => 'atlas-variant';
    applyCharacterStyle(clone);
    const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
    clone.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(previous).toHaveBeenCalledOnce();
    expect(clone.map).toBe(map); expect(clone.emissiveMap).toBe(emissiveMap); expect(clone.vertexColors).toBe(true);
    expect(clone.emissive.equals(source.emissive)).toBe(true);
    expect(shader.fragmentShader).toContain('outgoingLight += characterRim');
    expect(clone.customProgramCacheKey()).toContain('atlas-variant');
    const hook = clone.onBeforeCompile; applyCharacterStyle(clone); expect(clone.onBeforeCompile).toBe(hook);
  });
  it('keeps painted weapons free of character rim while enforcing the matte nonmetal policy', () => {
    const weapon = createToonMaterial('weapon', { roughness: .2, metalness: 1 });
    expect(weapon.roughness).toBe(.85); expect(weapon.metalness).toBe(0);
    expect(weapon.userData.toonCharacter).toBeUndefined();
  });
});
