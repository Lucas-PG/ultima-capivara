// Bundle with import.meta.env.DEV=true and run from the repository root.
// Raw measurements are private artifacts; publish only the compact summary.
import { writeFileSync } from 'node:fs';
import { holdingFixture } from './fp-state-node';
import { heldCurl, VIEW_SPECS } from '../../src/render/viewmodel-specs';
import { LONG_INSPECTS, m4Reload } from '../../src/render/viewmodel-anims';
import { WEAPONS } from '../../src/shared/weapons';
import { measureGrip } from './grip-measure.mjs';
import { holdingMetrics, holdingSummary } from './holding-metrics.mjs';
import { indexGuardOccupancy } from './index-skin.mjs';

const [out] = process.argv.slice(2);
if (!out) throw new Error('Provide a private output JSON path.');
const fixture = await holdingFixture(), view = fixture.view as any, grip = VIEW_SPECS.m4.grips.R;
const report: Record<string, any> = { route: [], states: [] };
const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
try {
  const segments = (grip.indexExit?.length ?? 0) + 1;
  for (const pull of [0, 1]) {
    fixture.pose('m4', pull ? 'fire' : 'hip', 0);
    for (let segment = 0; segment < segments; segment++) {
      const a = heldCurl(grip, segment / segments, pull), b = heldCurl(grip, (segment + 1) / segments, pull);
      const length = Math.hypot(...a.index.map((x, i) => b.index[i] - x),
        (b.indexSpread ?? 0) - (a.indexSpread ?? 0), (b.indexRoll ?? 0) - (a.indexRoll ?? 0));
      const steps = Math.max(10, Math.ceil(length / .002));
      for (let step = 0; step <= steps; step++) {
        const u = (segment + step / steps) / segments;
        view.arms.right.paw.apply(heldCurl(grip, u, pull));
        view.arms.group.updateMatrixWorld(true);
        const skin = measureGrip(['m4', 'R', false, {}]), occupancy = indexGuardOccupancy('m4');
        report.route.push({ pull, u, skin: skin.worst, inside: occupancy.inside, vertices: occupancy.total });
      }
    }
    console.log('route', pull, report.route.length, Math.min(...report.route.map((r: any) => r.skin)));
    save();
  }
  const states = new Map<string, { action: string; t: number }>();
  const add = (action: string, t: number) => { t = +t.toFixed(6); states.set(`${action}:${t}`, { action, t }); };
  const range = (action: string, start: number, end: number, step = .025) => {
    for (let t = start; t <= end + 1e-8; t += step) add(action, t);
  };
  add('hip', 0); add('aimed', 0);
  for (const action of ['ads', 'unaim', 'walk', 'strafe', 'sprint']) range(action, 0, .6);
  for (const action of ['crouch', 'land', 'fire']) range(action, 0, .3);
  range('jump', 0, .5); range('holster', 0, .15, .005); range('draw', 0, .7);
  range('inspect', 0, 1.8); range('inspect', 0, .12, .005); range('inspect', 1.62, 1.75, .005);
  for (const key of LONG_INSPECTS.m4 ?? []) add('inspect', key.t * 1.8);
  for (const empty of [true, false]) {
    const action = empty ? 'reload' : 'reload-partial', duration = WEAPONS.m4.reload;
    range(action, 0, duration + .1); range(action, 0, .15, .005); range(action, duration - .15, duration, .005);
    for (const key of m4Reload(empty)) add(action, key.t * duration);
  }
  for (const state of states.values()) {
    const pose = fixture.pose('m4', state.action, state.t);
    const row = await holdingMetrics('m4', state, pose, measureGrip);
    if (!row.inactive) {
      const occupancy = indexGuardOccupancy('m4');
      row.index = { inside: occupancy.inside, vertices: occupancy.total };
      const indexed = view.targetR.curl.index.every((x: number, i: number) => Math.abs(x - grip.indexed!.index[i]) < 1e-8);
      if (indexed && occupancy.inside) row.failures.push(`indexed digit retains ${occupancy.inside} skin vertices inside the guard`);
    }
    report.states.push(row);
    if (report.states.length % 50 === 0) { console.log('states', report.states.length, 'failures', report.states.filter((r: any) => r.failures?.length).length); save(); }
  }
  report.summary = { routeSamples: report.route.length, routeWorst: Math.min(...report.route.map((r: any) => r.skin)),
    routeFailed: report.route.filter((r: any) => r.skin < -.5).length, holding: holdingSummary(report.states) };
  // Avoid duplicating the full state payload under the summary.
  delete report.summary.holding.rows;
  save(); console.log('SUMMARY', JSON.stringify(report.summary));
  if (report.summary.routeFailed || report.summary.holding.failed) process.exitCode = 1;
} finally { fixture.dispose(); }
