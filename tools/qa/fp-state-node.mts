// Replays the browser fixture's actor actions on the same shipped WeaponView and GLB geometry.
import { realViewmodel } from '../../tests/helpers/real-viewmodel';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { WEAPONS } from '../../src/shared/weapons';
import type { WeaponId } from '../../src/shared/types';
import { measureWrists } from '../../src/render/viewmodel-frame';

export async function holdingFixture() {
  const fixture = await realViewmodel(), view = fixture.view as any;
  Object.assign(globalThis, { window: globalThis, __vmProbe: view });
  const { actor, step } = fixture;
  const frame = () => view.update(actor, 0, DEFAULT_SETTINGS, 0, fixture.now());
  const pose = (weapon: WeaponId, action: string, seconds: number) => {
    view.resetMotion();
    fixture.hold(action === 'draw' ? weapon === 'pistol' ? 'm4' : 'pistol' : weapon, action === 'aimed' || action === 'unaim');
    const start = fixture.now();
    if (action === 'draw') actor.weapons[0].id = weapon;
    if (action === 'holster') actor.weapons[0].id = weapon === 'pistol' ? 'm4' : 'pistol';
    if (action === 'ads') actor.ads = true;
    if (action === 'unaim') actor.ads = false;
    if (action === 'walk') actor.velocity.z = -4.5;
    if (action === 'strafe') actor.velocity.x = -4.5;
    if (action === 'sprint') { actor.sprint = true; actor.velocity.z = -7; }
    if (action === 'crouch') actor.crouch = true;
    if (action === 'jump') { actor.grounded = false; actor.velocity.y = 6; }
    if (action === 'land') {
      actor.grounded = false; actor.velocity.y = -10; step(1 / 60); actor.grounded = true; actor.velocity.y = 0;
    }
    if (action.startsWith('reload')) {
      actor.weapons[0].ammo = action === 'reload-partial' ? Math.max(1, Math.floor(WEAPONS[weapon].magazine / 2)) : 0;
      actor.reloadUntil = fixture.now() + WEAPONS[weapon].reload;
    }
    if (action === 'inspect') view.inspect();
    if (action === 'fire' || action === 'swing-right' || action === 'swing-left' || action === 'chop') {
      if (action === 'swing-left' || action === 'chop') { view.shot(weapon); step(.6); }
      if (action === 'chop') { view.shot(weapon); step(.6); }
      view.shot(weapon);
    }
    frame();
    for (let elapsed = 0; elapsed < seconds - 1e-9;) {
      const dt = Math.min(1 / 120, seconds - elapsed); elapsed += dt;
      if (action === 'jump') actor.velocity.y = 6 - (fixture.now() + dt - start) * 20;
      if (action.startsWith('reload') && actor.reloadUntil > 0 && fixture.now() + dt >= actor.reloadUntil - 1e-9) {
        if (action === 'reload-chain' && weapon === 'shotgun') {
          actor.weapons[0].ammo++; actor.weapons[0].reserve--;
          actor.reloadUntil = actor.weapons[0].ammo < WEAPONS.shotgun.magazine ? actor.reloadUntil + WEAPONS.shotgun.reload : 0;
        } else {
          const loaded = weapon === 'shotgun' ? 1 : WEAPONS[weapon].magazine - actor.weapons[0].ammo;
          actor.reloadUntil = 0; actor.weapons[0].ammo += loaded; actor.weapons[0].reserve -= loaded;
        }
      }
      step(dt);
    }
    frame(); view.scene.updateMatrixWorld(true);
    return { active: view.active, contacts: { ...view.holdingContacts }, wrists: measureWrists(view),
      visible: Object.fromEntries(['R', 'L'].map(s => [s, view.arms.meshes.find((m: any) => m.name.endsWith(s)).visible])) };
  };
  return { ...fixture, pose };
}
