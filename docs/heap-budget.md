# Heap budget evidence

Run `node tools/perf/heap-budget.mjs FULL_HASH http://127.0.0.1:5182/ 60` from the exact clean Node24 checkout served by DEV Vite. Chrome runs with precise memory information. No GC is forced and no FPS conclusion is drawn.

The first probe renders the seeded plaza with16actors in fresh Low, Medium and High browser contexts. The second runs three real Correria practice sessions in the same renderer, leaving to the menu between them. Correria practice currently fills8actors regardless of room capacity; the report records that separately from the16actor budget scene. Samples include precise `performance.memory.usedJSHeapSize`, separate raw CDP heap fields, GPU resource counts and cleared match/worker state after leaving.

The heap gate uses250,000,000bytes, which is stricter than250MiB. Retention growth is reported without silently declaring every increase a leak or forcing GC to improve results. A short restart sequence does not prove three full matches leak-free.

The existing7508772 fix releases uniquely owned geometry backing buffers after upload. Its tests preserve bounds/counts, shared views and the fallback on browsers without transfer. No new runtime memory fix is needed merely to change the budget measurement.

Instrumentation smoke on landed6f54cac (Chrome153/Metal AppleM2,720p): peak189,988,409bytes across the16actor preset samples and three2second8actor restarts, zero errors. All three returns had no worker or actors, and stable784geometries/53textures. This verifies the probe and leaves longer retention verification open. Detailed local evidence: `output/m1/heap-6f54cac/report.json`.
