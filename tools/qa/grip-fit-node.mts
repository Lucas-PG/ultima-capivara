// Geometry-only runner for grip-fit-core. Bundle with esbuild, defining import.meta.env.DEV=true,
// into node_modules/.cache/grip-fit-node.mjs; then pass a jobs JSON file. No browser or rendering.
import { readFile, writeFile } from 'node:fs/promises';
import { holdingFixture } from './fp-state-node';
import { wristAngles } from '../../src/render/fp-arms';
import { fitGrip } from './grip-fit-core.mjs';
import { measureGrip } from './grip-measure.mjs';
import { triggerInGuard, TRIGGER_FACE } from './trigger-guard.mjs';
const fixture = await holdingFixture();
Object.assign(globalThis, { window: globalThis, __vmWristAngles: wristAngles, __vmProbe: fixture.view });
try {
  const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
  for (const job of jobs) {
    const { weapon, intent } = job;
    const tune = { ...job.tune };
    for (const [side, path] of Object.entries(job.tuneFrom ?? {})) {
      const fitted = JSON.parse(await readFile(path as string, 'utf8')).final.grip;
      tune.grips = { ...tune.grips, [side]: fitted };
    }
    Object.assign(globalThis, { __vmTune: { [weapon]: tune } });
    fixture.pose(weapon, intent.motion?.[0] ?? (job.mode === 'ads' ? 'aimed' : 'hip'), intent.motion?.[1] ?? 0);
    const view = fixture.view as any;
    const start = job.startFrom ? JSON.parse(await readFile(job.startFrom, 'utf8')).final.grip : job.start ?? (view.tunedSpec?.grips ?? view.models[weapon].grips)[intent.side];
    measureGrip([weapon, intent.side]); // Initializes the same welded solid-component classifier used by the audit.
    const result = fitGrip([weapon, intent, start, job.evals ?? 1500]);
    const measured = measureGrip([weapon, intent.side, false]);
    result.measured = measured;
    const surface = intent.part ?? (intent.side === 'R' ? 'body' : ['pistol', 'revolver'].includes(weapon) ? 'paw' : start.part ?? 'body');
    const bones = intent.side === 'R' && surface === 'body' ? ['hand', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3'] : undefined;
    const options = { surface: surface === 'paw' ? undefined : surface, bones };
    result.contact = measureGrip([weapon, intent.side, surface === 'paw', options]);
    result.regions = Object.fromEntries(['palm', 'wrap'].map(region => [region, measureGrip([weapon, intent.side, surface === 'paw', { ...options, region }]).worst]));
    if (intent.side === 'R' && !intent.part && weapon !== 'machete') {
      result.trigger = measureGrip([weapon, 'R', false, TRIGGER_FACE]);
      result.insideGuard = triggerInGuard(weapon, result.trigger.digits.index?.tip);
    }
    if (job.output) await writeFile(job.output, JSON.stringify(result, null, 2) + '\n');
    console.log('RESULT', job.name ?? weapon, JSON.stringify(result.final));
    console.log('CHECK', job.name ?? weapon, JSON.stringify({ skin: measured.worst, contact: result.contact.worst, regions: result.regions, trigger: result.trigger?.worst, insideGuard: result.insideGuard }));
  }
} finally { fixture.dispose(); }
