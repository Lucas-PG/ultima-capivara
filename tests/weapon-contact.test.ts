import { afterEach, expect, it } from 'vitest';
import * as THREE from 'three';
// @ts-expect-error The QA browser script is JavaScript.
import { measure } from '../tools/qa/weapon-contact.mjs';

afterEach(() => { Reflect.deleteProperty(globalThis, 'window'); });
it('keeps true penetration negative and an exterior wrist positive beside an inward-facing detail', () => {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1)));
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute('position', new THREE.Float32BufferAttribute([.08, -.03, -.03, .08, 0, .03, .08, .03, -.03], 3));
  group.add(new THREE.Mesh(sheet));
  const positions = new THREE.Float32BufferAttribute([0, 0, 0, .12, 0, 0], 3);
  const mesh = {
    name: 'arm_R', matrixWorld: new THREE.Matrix4(), skeleton: { bones: [{ name: 'hand_R' }, { name: 'fore_twist_R' }] },
    geometry: { attributes: {
      position: positions,
      skinIndex: new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0], 4),
      skinWeight: new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0], 4),
    } },
    getVertexPosition: (i: number, v: THREE.Vector3) => v.fromBufferAttribute(positions, i),
  };
  const scene = new THREE.Scene(), holder = new THREE.Group(), muzzle = new THREE.Object3D();
  scene.add(holder); holder.add(group, muzzle);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __vmProbe: { scene, holder, models: { test: { group, muzzle, parts: {} } },
    arms: { meshes: [mesh] }, camera: new THREE.PerspectiveCamera(), targetR: { palm: new THREE.Vector3(-1, 0, 0) },
  } } });
  const result = measure(['test', 'R']);
  expect(result.summary.hand.min).toBeCloseTo(-50, 1);
  expect(result.summary.fore_twist.min).toBeCloseTo(40, 1);
});
