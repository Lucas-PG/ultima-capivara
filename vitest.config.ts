import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

// CI shards by measured file time (tests/durations.json) instead of path hash, so the slow
// contact suites spread across shards. Every file lands in exactly one shard; files missing
// from the table count as 1 s. Refresh it with: node scripts/test-durations.mjs --maxWorkers=2
// Within a run the slowest files start first, so none of them is left running alone at the end.
const seconds: Record<string, number> = JSON.parse(readFileSync('tests/durations.json', 'utf8'));

class DurationSequencer extends BaseSequencer {
  private byTime(files: TestSpecification[]) {
    return files.map(spec => {
      const name = relative(this.ctx.config.root, spec.moduleId);
      return { spec, name, time: seconds[name] ?? 1, shard: 0 };
    }).sort((a, b) => b.time - a.time || (a.name < b.name ? -1 : 1));
  }

  async sort(files: TestSpecification[]) {
    return this.byTime(files).map(file => file.spec);
  }

  async shard(files: TestSpecification[]) {
    const { index, count } = this.ctx.config.shard!;
    const named = this.byTime(files);
    const totals = new Array<number>(count).fill(0);
    for (const file of named) {
      file.shard = totals.indexOf(Math.min(...totals));
      totals[file.shard] += file.time;
    }
    return named.filter(file => file.shard === index - 1).map(file => file.spec);
  }
}

export default defineConfig({ cacheDir: '.vitest/cache', test: { include: ['tests/**/*.test.ts'], testTimeout: 15_000, sequence: { sequencer: DurationSequencer } } });
