import { triggerInGuard, TRIGGER_FACE } from './trigger-guard.mjs';

const carryingBones = ['hand', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3'];
const badContact = gap => !Number.isFinite(gap) || gap < -.5 || gap > 1.5;

// Browser and geometry-only audits use the same contact regions and acceptance criteria.
export async function holdingMetrics(weapon, state, pose, probe) {
  const row = { ...state, contacts: {}, wrists: pose.wrists };
  if (pose.active !== weapon) return { ...row, inactive: pose.active };
  for (const side of ['R', 'L']) {
    if (!pose.visible[side]) continue;
    const m = await probe([weapon, side]);
    row[side] = m.worst; row[`${side}at`] = Object.entries(m.summary).sort((a, b) => a[1].min - b[1].min)[0]?.[0];
    row[`${side}skin`] = m.summary;
    const surface = pose.contacts?.[side];
    if (surface) {
      const options = { surface: surface === 'paw' ? undefined : surface, bones: side === 'R' && surface === 'body' ? carryingBones : undefined };
      const cm = await probe([weapon, side, surface === 'paw', options]);
      row.contacts[side] = { surface, gap: cm.worst, skin: cm.summary };
      if (surface === 'body' || surface === 'pump' || surface === 'paw') {
        for (const region of ['palm', 'wrap']) {
          const m = await probe([weapon, side, surface === 'paw', { ...options, region }]);
          row.contacts[side][region] = m.worst;
        }
      }
    }
  }
  if (weapon === 'pistol' || weapon === 'revolver') row.pair = (await probe([weapon, 'L', true])).worst;
  if (pose.contacts?.trigger) {
    const trigger = await probe([weapon, 'R', false, TRIGGER_FACE]);
    row.trigger = { gap: trigger.worst, insideGuard: triggerInGuard(weapon, trigger.digits.index?.tip), digits: trigger.digits, skin: trigger.summary };
  }
  row.failures = [];
  for (const key of ['R', 'L', 'pair']) if (row[key] !== undefined && row[key] < -.5) row.failures.push(`${key} penetrates ${row[key]} mm`);
  for (const [side, contact] of Object.entries(row.contacts)) {
    if (badContact(contact.gap)) row.failures.push(`${side} ${contact.surface} contact ${contact.gap} mm`);
    for (const region of ['palm', 'wrap']) if (contact[region] !== undefined && badContact(contact[region])) row.failures.push(`${side} ${contact.surface} ${region} contact ${contact[region]} mm`);
  }
  if (row.trigger && badContact(row.trigger.gap)) row.failures.push(`trigger front contact ${row.trigger.gap} mm`);
  if (row.trigger && !row.trigger.insideGuard) row.failures.push('trigger digit outside guard');
  for (const [side, wrist] of Object.entries(pose.wrists ?? {})) {
    if (!wrist || !pose.visible[side]) continue;
    if (Math.abs(wrist.flexion) > 45.01 || wrist.deviation < -25.01 || wrist.deviation > 20.01 || Math.abs(wrist.pronation) > 80.01)
      row.failures.push(`${side} wrist outside anatomical limits`);
  }
  return row;
}

export function holdingSummary(rows) {
  const worst = key => rows.reduce((best, r) => r[key] !== undefined && r[key] < best.v ? { v: r[key], at: `${r.action} ${r.t} ${r[`${key}at`] ?? ''}` } : best, { v: Infinity, at: '' });
  return { R: worst('R'), L: worst('L'), pair: worst('pair'), failed: rows.filter(r => r.failures?.length).length, rows };
}
