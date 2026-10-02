// Geometry-only companion to fp-clearance.mjs. Same actual skin, contact regions and failures.
// Bundle into node_modules/.cache with import.meta.env.DEV=true; pass out.json and states.json.
import { readFile, writeFile } from 'node:fs/promises';
import { holdingFixture } from './fp-state-node.mts';
import { measureGrip } from './grip-measure.mjs';
import { holdingMetrics, holdingSummary } from './holding-metrics.mjs';
const [out, statesFile] = process.argv.slice(2);
const states = JSON.parse(await readFile(statesFile, 'utf8'));
const fixture = await holdingFixture(), report: Record<string, any> = {};
try {
  for (const [weapon, samples] of Object.entries(states)) {
    const rows = [];
    for (const state of samples as any[]) {
      const pose = fixture.pose(weapon as never, state.action, state.t);
      rows.push(await holdingMetrics(weapon, state, pose, measureGrip));
    }
    report[weapon] = holdingSummary(rows);
    console.log(weapon, report[weapon].failed, '/', rows.length, 'failed');
    await writeFile(out, JSON.stringify(report, null, 1) + '\n');
  }
} finally { fixture.dispose(); }
if (process.env.ENFORCE && Object.values(report).some(r => r.failed)) process.exitCode = 1;
