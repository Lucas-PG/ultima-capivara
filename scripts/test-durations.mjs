// Rewrites tests/durations.json (seconds per test file) from a full local Vitest run.
// The CI shard sequencer in vitest.config.ts balances shards with it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';

const report = '.vitest/durations-report.json';
execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${report}`, ...process.argv.slice(2)], { stdio: 'inherit' });
const seconds = Object.fromEntries(JSON.parse(readFileSync(report, 'utf8')).testResults
  .map(file => [relative(process.cwd(), file.name), Math.max(.1, Math.round((file.endTime - file.startTime) / 100) / 10)])
  .sort(([a], [b]) => a < b ? -1 : 1));
writeFileSync('tests/durations.json', `${JSON.stringify(seconds, null, 1)}\n`);
