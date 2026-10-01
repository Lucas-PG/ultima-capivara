// A live-match player for perf runs (VITE_QA=1 build with ?networkQa=1): plays inside the page at 20 Hz
// through the real input layer, with no health, damage or time overrides. In a royale it leaves the
// plane over a weapon inside the safe zone and glides to it; then it loots, routes to the nearest
// enemy with the game's own navigation, aims and fires.
export async function startDriver(page) {
  await page.evaluate(() => {
    const q = window.__networkQA, { world, nav, collision, weapons } = q.driver;
    const d = { routeAt: 0, waypoint: null, direct: false, lastJump: 0, lastAction: 0, switchedAt: 0, watchedAt: 0, drop: null, anchor: null, wanderUntil: 0, wanderYaw: 0, yaw: 0 };
    const tap = code => { q.key(code, true); q.key(code, false); };
    const step = () => {
      const i = window.__capivara.inspect(), s = i.snapshot;
      if (!s) return;
      const me = s.actors.find(a => !a.bot), now = s.time;
      if (s.phase !== 'playing' || !me.alive) {
        q.key('KeyW', false); q.key('ShiftLeft', false); q.key('Mouse2', false);
        if (s.phase === 'playing' && s.config.mode === 'battle-royale' && now - d.watchedAt > 12) { tap('Space'); d.watchedAt = now; }
        return;
      }
      if (me.stage !== 'ground') {
        if (me.stage === 'plane') d.drop = null;
        d.drop ||= s.loot.filter(l => l.active && l.kind === 'weapon' && !['pistol', 'machete'].includes(l.weapon) &&
          Math.hypot(l.x - s.zone.nextX, l.z - s.zone.nextZ) < s.zone.nextRadius * .7)
          .sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z))[0] || { x: s.zone.nextX, z: s.zone.nextZ };
        const dx = d.drop.x - me.pos.x, dz = d.drop.z - me.pos.z, far = Math.hypot(dx, dz);
        if (me.stage === 'plane') { if (far < 45 || now > 11) tap('Space'); return; }
        q.look(Math.atan2(-dx, -dz), -.6);
        q.key('KeyW', far > 4);
        if (me.stage === 'falling' && me.pos.y < 25) tap('Space');
        return;
      }
      if (!i.clientInput.locked) q.activate();
      const eye = { ...me.pos, y: me.pos.y + (me.crouch ? 1.02 : 1.62) };
      const enemies = s.actors.filter(a => a.bot && a.alive && a.stage === 'ground')
        .map(a => ({ a, distance: Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) })).sort((a, b) => a.distance - b.distance);
      const enemy = enemies.find(e => e.distance < 55 && collision.hasLineOfSight(eye, { ...e.a.pos, y: e.a.pos.y + 1.1 }, world));
      const held = me.weapons[me.slot], def = held && weapons.WEAPONS[held.id];
      if (s.config.mode !== 'corrente' && !me.swimming && now - d.switchedAt > 2) {
        const best = me.weapons.find(w => w.box < 2 && (w.ammo > 0 || w.reserve > 0));
        if (best && best !== held) { tap(`Digit${best.box + 1}`); d.switchedAt = now; }
      }
      if (held && held.ammo === 0 && held.reserve > 0 && !me.reloadUntil) tap('KeyR');
      if (now - d.lastAction > 1) {
        if (!document.querySelector('#prompt')?.hidden) tap('KeyF');
        if (me.hp < 65) { tap('Digit6'); tap('Digit5'); } else if (me.armor < 30) tap('Digit8');
        d.lastAction = now;
      }
      const loot = s.config.mode !== 'corrente' && !me.weapons.some(w => w.box < 2 && (w.ammo || w.reserve))
        ? s.loot.filter(l => l.active && l.kind === 'weapon' && !['pistol', 'machete'].includes(l.weapon))
          .sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z))[0] : null;
      const outside = s.config.mode === 'battle-royale' && Math.hypot(me.pos.x - s.zone.nextX, me.pos.z - s.zone.nextZ) > s.zone.nextRadius - 5;
      const goal = outside ? { x: s.zone.nextX, y: 0, z: s.zone.nextZ } : loot || enemy?.a.pos || enemies[0]?.a.pos;
      if (goal && now >= d.routeAt) {
        d.waypoint = nav.navigationWaypoint(world, me.pos, goal, s.config.mode !== 'battle-royale') || goal;
        d.direct = nav.walkableSegment(world, me.pos, goal, s.config.mode !== 'battle-royale');
        d.routeAt = now + .8;
      }
      const fighting = !!enemy && !outside && !loot && !!def && (d.direct || enemy.distance < 9) && (enemy.distance < 30 || !def.melee);
      const target = fighting ? { ...enemy.a.pos, y: enemy.a.pos.y + 1.25 } : d.waypoint ? { ...d.waypoint, y: eye.y } : null;
      if (!d.anchor || Math.hypot(me.pos.x - d.anchor.x, me.pos.z - d.anchor.z) > 1.5) d.anchor = { x: me.pos.x, z: me.pos.z, at: now };
      if (!fighting && goal && now - d.anchor.at > 4 && !(d.wanderUntil > now)) { d.wanderUntil = now + 2.5; d.wanderYaw = Math.random() * Math.PI * 2; d.anchor.at = now; }
      if (d.wanderUntil > now && !fighting) { q.look(d.wanderYaw, 0); if (now - d.lastJump > .7) { tap('Space'); d.lastJump = now; } }
      else if (target) {
        const dx = target.x - me.pos.x, dz = target.z - me.pos.z;
        // Turn toward the target over a few ticks like a mouse would, instead of snapping.
        const want = Math.atan2(-dx, -dz), turn = Math.atan2(Math.sin(want - d.yaw), Math.cos(want - d.yaw));
        d.yaw += turn * .45;
        q.look(d.yaw, Math.atan2(target.y - eye.y, Math.hypot(dx, dz)));
      }
      q.key('KeyW', !!goal && (!fighting || enemy.distance > (def.melee ? 1.3 : 9)));
      q.key('ShiftLeft', !!goal && !fighting);
      q.key('Mouse2', fighting && !def.melee && enemy.distance > 12);
      if (fighting && enemy.distance < (def.melee ? 2 : def.range)) q.fire();
      if (goal && Math.hypot(me.velocity.x, me.velocity.z) < .2 && now - d.lastJump > 2) { tap('Space'); d.lastJump = now; }
    };
    window.__perfDriver = setInterval(() => { try { step(); } catch (error) { console.error('driver', error.message); } }, 50);
  });
}

export async function stopDriver(page) { await page.evaluate(() => clearInterval(window.__perfDriver)); }
