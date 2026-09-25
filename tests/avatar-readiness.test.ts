import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AvatarView } from '../src/render/avatars';
import type { ActorState } from '../src/shared/types';

beforeAll(() => {
  const context = { roundRect() {}, fill() {}, stroke() {}, fillText() {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
});
afterAll(() => vi.unstubAllGlobals());

const actor = (id: string, name = 'Capivara', color = '#1fb5a8') => ({ id, name, color }) as ActorState;

describe('match avatar preparation', () => {
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
    expect(geometry).not.toHaveBeenCalled(); expect(weapon).not.toHaveBeenCalled();
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
