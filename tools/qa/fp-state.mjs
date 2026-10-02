// One browser fixture for holding evidence and contact scans. Custom actions use the existing QA actor
// override so the measured weapon is the requested weapon, including its own draw rather than a pistol.
export async function poseHoldingState(page, weapon, action, seconds = 0) {
  await page.evaluate(async ([weapon, action, seconds]) => {
    window.__vmOrbit = undefined; window.__vmActor = undefined;
    if (action === 'hip' || action === 'aimed') return window.__capyQA.pose(`${action === 'aimed' ? 'ads' : 'fp'}-${weapon}`);
    if (['walk', 'strafe', 'crouch', 'jump', 'draw', 'unaim'].includes(action)) {
      const state = { prev: -1, start: Infinity, repeated: 0 };
      window.__vmActor = (actor, time) => {
        state.repeated = time === state.prev ? state.repeated + 1 : 0;
        if (state.repeated >= 28) state.start = time;
        state.prev = time;
        const active = time > state.start;
        const still = { sprint: false, velocity: { x: 0, y: 0, z: 0 } };
        if (action === 'walk') return { sprint: false, velocity: { x: -Math.sin(actor.yaw) * 4.5, y: 0, z: -Math.cos(actor.yaw) * 4.5 } };
        if (action === 'strafe') return { sprint: false, velocity: { x: -Math.cos(actor.yaw) * 4.5, y: 0, z: Math.sin(actor.yaw) * 4.5 } };
        if (action === 'crouch') return { ...still, crouch: active };
        if (action === 'jump') return { ...still, grounded: !active, velocity: { x: 0, y: active ? 6 - (time - state.start) * 20 : 0, z: 0 } };
        if (action === 'unaim') return { ...still, ads: !active };
        return active ? still : { ...still, slot: 0, weapons: [{ id: weapon === 'pistol' ? 'm4' : 'pistol', rarity: 0, ammo: 12, reserve: 30, box: 0 }] };
      };
      return window.__capyQA.motion(weapon, 'sprint', seconds);
    }
    return window.__capyQA.motion(weapon, action === 'holster' ? 'equip' : action, seconds);
  }, [weapon, action, seconds]);
}
