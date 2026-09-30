import { describe, expect, it } from 'vitest';
import { trial } from '../scripts/balance-trials';
import { HANDLING, SPREAD, WEAPONS, damageFalloff, shotSpread } from '../src/shared/weapons';
import type { WeaponId } from '../src/shared/types';

const ttk = (id: WeaponId, distance: number, head = false, armored = false, rarity = 0) => trial(id, distance, head, armored, rarity)?.ttk ?? Infinity;
const shots = (id: WeaponId, distance: number, head = false, armored = false, rarity = 0) => trial(id, distance, head, armored, rarity)?.shots ?? Infinity;

describe('weapon roles at ideal direct-hit accuracy', () => {
  it('keeps the SMG quick nearby without beating the rifle across every range', () => {
    expect(trial('smg', 5, false, false, 0)?.ttk).toBeLessThan(.5);
    expect(trial('smg', 60, false, false, 0)!.ttk).toBeGreaterThan(trial('m4', 60, false, false, 0)!.ttk);
    expect(trial('smg', 60, false, true, 0)!.ttk).toBeGreaterThan(trial('m4', 60, false, true, 0)!.ttk);
  });

  it('preserves headshot and rarity rewards at fixed range and protection', () => {
    let armorAddsShots = 0;
    for (const id of ['pistol', 'smg', 'm4', 'dmr', 'sniper'] as const) {
      expect(trial(id, 30, true, false, 0)!.shots).toBeLessThan(trial(id, 30, false, false, 0)!.shots);
      const protectedShots = trial(id, 30, false, true, 0)!.shots;
      expect(protectedShots).toBeGreaterThanOrEqual(trial(id, 30, false, false, 0)!.shots);
      if (protectedShots > trial(id, 30, false, false, 0)!.shots) armorAddsShots++;
      expect(trial(id, 30, false, true, 3)!.shots).toBeLessThanOrEqual(trial(id, 30, false, true, 0)!.shots);
    }
    expect(armorAddsShots).toBeGreaterThanOrEqual(3);
  });

  it('gives each gun a range where it wins, and no gun that wins everywhere', () => {
    // Up close the SMG out-kills the rifle; past its falloff the rifle takes over.
    expect(ttk('smg', 5)).toBeLessThan(ttk('m4', 5));
    expect(ttk('m4', 30)).toBeLessThan(ttk('smg', 30));
    // The DMR out-trades the M4 at long range, the M4 wins the close fight.
    expect(ttk('dmr', 100)).toBeLessThan(ttk('m4', 100));
    expect(ttk('m4', 8)).toBeLessThan(ttk('dmr', 8));
    // A point-blank headshot with the Doze is the one hitscan instant kill besides the sniper.
    expect(shots('shotgun', 4, true)).toBe(1);
    expect(shots('sniper', 150, true)).toBe(1);
  });

  it('keeps fights readable: no body shot one-shots a fresh capybara with a common gun, and nothing kills in under a quarter second', () => {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      if (WEAPONS[id].melee || WEAPONS[id].projectile) continue;
      expect(shots(id, 10), id).toBeGreaterThan(1);
      // Body-only kills at the gun's best range take long enough to react to (sniper and shotgun: two hits).
      expect(ttk(id, 5), id).toBeGreaterThanOrEqual(.35);
    }
    // Automatic body time to kill sits in the 0.35 to 0.6 s band that lets tracking and cover decide fights.
    for (const id of ['smg', 'm4'] as const) {
      expect(ttk(id, 8)).toBeGreaterThan(.35);
      expect(ttk(id, 8)).toBeLessThan(.6);
    }
  });

  it('rewards precision guns more for a headshot than automatics, and makes the revolver a two-tap with one head', () => {
    for (const precise of ['pistol', 'revolver', 'dmr', 'sniper'] as const)
      for (const auto of ['smg', 'm4'] as const) expect(WEAPONS[precise].headMultiplier).toBeGreaterThan(WEAPONS[auto].headMultiplier);
    const revolver = WEAPONS.revolver;
    expect(revolver.damage * revolver.headMultiplier + revolver.damage).toBeGreaterThanOrEqual(100);
    expect(revolver.damage * 2).toBeLessThan(100);
  });
});

describe('handling', () => {
  it('lets light guns come up and move faster than heavy ones', () => {
    expect(HANDLING.pistol.draw).toBeLessThan(HANDLING.m4.draw);
    expect(HANDLING.m4.draw).toBeLessThan(HANDLING.sniper.draw);
    expect(HANDLING.smg.sprintOut).toBeLessThan(HANDLING.sniper.sprintOut);
    expect(HANDLING.machete.move).toBeGreaterThan(HANDLING.pistol.move);
    expect(HANDLING.sniper.move).toBeLessThan(HANDLING.m4.move);
    expect(HANDLING.sniper.adsMove).toBeLessThan(HANDLING.smg.adsMove);
  });

  it('keeps a paced first shot on the listed accuracy and makes spam and movement cost accuracy', () => {
    for (const id of ['pistol', 'm4', 'dmr', 'revolver'] as const) {
      expect(shotSpread(id, 1, 0, false, 0)).toBeCloseTo(WEAPONS[id].adsSpread);
      expect(shotSpread(id, 1, 0, false, 1)).toBeGreaterThan(shotSpread(id, 1, 0, false, 0));
      expect(shotSpread(id, 1, 3.9, false, 0)).toBeGreaterThan(shotSpread(id, 1, 0, false, 0));
      // Crouching still steadies the hip shot a little.
      expect(shotSpread(id, 0, 0, false, 0, false, true)).toBeLessThan(shotSpread(id, 0, 0, false, 0));
    }
    // The SMG is the run-and-gun gun: moving costs it the least accuracy.
    for (const id of ['pistol', 'm4', 'dmr', 'sniper', 'revolver'] as const) expect(SPREAD.smg.move).toBeLessThan(SPREAD[id].move);
    // Semi-automatics paced at twice their cadence cool fully between shots (heat 2.4/s).
    for (const id of ['pistol', 'dmr', 'revolver'] as const) expect(2 * 60 / WEAPONS[id].rpm * 2.4).toBeGreaterThanOrEqual(SPREAD[id].heat);
    expect(damageFalloff('sniper', 200)).toBe(1);
  });
});
