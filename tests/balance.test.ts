import { describe, expect, it } from 'vitest';
import { trial } from '../scripts/balance-trials';

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
});
