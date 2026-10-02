# CI speedup report

## Measured before

GitHub run 37052281253 (`ci`, push to main, commit e998665), step times:

| Step | Seconds |
| --- | --- |
| checkout (depth 1, ~540 MB tree, 450 MB of it docs evidence images) | 22 |
| setup-node (npm cache hit) | 4 |
| npm ci | 4 |
| npm run check (tsc) | 2 |
| **npm test (138 files, 1517 tests)** | **311** |
| npm run build (tsc again + vite build) | 4 |
| Run wall time | 5 min 56 s |

The `pages` run for the same commit (37052281301) ran the whole suite again (test step 224 s, run 4 min 50 s). Other runs (37040596680) match: test step 292 s.

Where the test time goes (CI log of that run, per-file time):

- `holding-ready.test.ts`: 245 s, 144 tests at ~1.7 s each. With 3 Vitest workers on a 4 vCPU runner, this one file set the wall time.
- `viewmodel-framing.test.ts` 134 s, `thirdperson-holding` 30 s, `enclosures` 24 s, then a long tail. Sum of all files: 673 CPU-s.
- CPU profile of `holding-ready`: ~85% is the exact BVH distance and ray-crossing searches in `tools/qa/grip-measure.mjs`. Fixture setup is negligible. Nothing there is wasteful setup that can be removed without changing the shared audit tool.

The release candidate (this branch) is heavier: 155 files, 2083 tests, 630 CPU-s locally (CI cores are ~2.2x slower), with new contact suites such as `pistol-motion-contact` (67 s local), `revolver-cylinder-contact` (54 s) and `m4-index-route` (37 s). With the old single job, the CI test step would have grown to roughly 7 to 10 minutes after this release lands.

Not significant: the duplicate tsc (2 s), npm ci (2 to 4 s, cache already used), push plus pull_request runs on the same commit (they cost runner minutes, not wall time).

## What changed

1. **Four parallel test shards.** `ci.yml` now runs `build` (npm ci, `npm run build`, which is `tsc --noEmit` then `vite build`) next to a `test` matrix of 4 jobs, each running `npm test -- --shard=N/4`.
2. **Duration-balanced sharding** (`vitest.config.ts`). Vitest's default shard splits files by path hash and file count; on this suite that left shards between 125 and 189 local seconds. A small sequencer packs files into shards by `tests/durations.json` (largest first) and starts each shard's slowest files first. Every file lands in exactly one shard; new files without a recorded time count as 1 s. `node scripts/test-durations.mjs --maxWorkers=2` refreshes the table.
3. **`holding-ready` split into three files.** The suite moved unchanged to `tests/helpers/holding-ready.ts`; `holding-ready-1/2/3.test.ts` each run the weapons whose index modulo 3 matches, so new weapons are always covered. The negative control runs in part 1. Same 144 tests.
4. **Deploy folded into `ci.yml`; `pages.yml` deleted.** A `deploy` job (Pages permissions, `github-pages` environment, `pages` concurrency group) runs only on main pushes or manual dispatch and `needs: [build, test]`. The `dist` artifact is uploaded by the build job only on main. Main stays gated by the full type check, the full suite and the build, and the suite no longer runs twice per release.
5. **Sparse checkout.** `filter: blob:none` plus a non-cone sparse pattern skips `docs/**/*.jpg` and `docs/**/*.png` (nothing in the build or tests reads them; the docs JSON a test imports is still checked out).
6. **Superseded runs cancel.** Workflow concurrency per ref; a newer push to a branch or PR cancels the older run. Main runs are never cancelled mid-run.

## Verified locally

- `actionlint` passes on `ci.yml`.
- `npm run check` and `npm run build` pass.
- All four shards pass: 2083 tests in 157 files, each file exactly once, same 2083 tests as the unsplit baseline run (155 files, 2083 tests), nothing skipped.
- Shard balance with the refreshed table: 166 local seconds each. Local shard wall times with 2 workers: 83 to 106 s.

## Expected after

Per test shard: setup + sparse checkout + setup-node + npm ci ~15 to 20 s, then tests. The floor is the slowest single file, `pistol-motion-contact` (67 s local, ~150 s on CI); the shard average (166 local CPU-s over 3 workers at 2.2x) is ~120 s, so each shard should take ~2.5 to 3 minutes. The build job (~30 s) runs in parallel, deploy adds ~10 s.

| | Before | After (estimate) |
| --- | --- | --- |
| CI on a push or PR, current main content | ~6 min | ~2.5 to 3 min |
| CI on release-candidate content | ~8 to 11 min (projected) | ~3 to 3.5 min |
| Commit on main to deployed site | ~5 to 6 min (separate pages run) | same run, ~3 to 3.5 min |
| Runner minutes per run | 1 job | 6 jobs (more minutes, all free on a public repo) |

## Needs a real GitHub run to confirm

- Actual shard times and balance on 4 vCPU runners (the 2.2x factor comes from one run).
- The checkout saving from `filter: blob:none` with sparse checkout.
- Pages deployment from the `ci` workflow: the `github-pages` environment must accept deployments from main through this workflow (first main push after merge; `workflow_dispatch` can retry it).
- Branch protection: if a required check is named `verify`, it must be replaced with `build` and the four `test (N)` checks.

## Further options, not done

- Split `pistol-motion-contact`, `revolver-cylinder-contact` and `viewmodel-framing` the same way, then go to 6 shards: floor drops to ~80 to 100 s per shard.
- Speed up `grip-measure.mjs` (cache the weapon BVH per pose, avoid per-node string-axis loops). It dominates the contact suites but is the shared evidence tool, so it needs its own review.
- `tests/durations.json` drifts as tests change; stale times only unbalance shards, they never drop tests.
