# BR spike attribution

Run from the exact clean checkout served by local DEV Vite, with Node 24:

```sh
FORJA_MACHINE_ACTIVITY='Formiga window and concurrent activity record' node tools/perf/capture-br.mjs medium 120 FULL_HASH 'http://127.0.0.1:5182/?timing=1'
node tools/perf/correlate-br.mjs output/m1/trace-SHORT_HASH-medium
```

The capture keeps the real BR simulation and HUD, replacing headless pointer-lock render throttling with 60 Hz active rendering. Onboarding is disabled. It records the exact source, platform, GPU, preset, viewport, match time, Long Task attribution, bounded span loss counts and CDP task/GC/layout/driver events. Profiler startup is excluded before the capture-start mark. The correlator aligns the trace and performance clocks on that mark and lists every frame over 50 ms. Nested GC or layout inside a render span is not GPU time. Generic RunTask events stay explicitly unattributed.

Historical 01b28ae evidence is diagnostic only: Medium was contaminated by concurrent agents and used the older HUD; Low had a 66.7 ms rAF gap at40353.9ms, overlapping a70.473ms native RunTask, with no JS/layout/GC child or useful sampled stack. That observation cannot identify a shader/driver cause. The newer base includes the HUD layout fix and explicit geometry backing-buffer release; neither is claimed to solve every spike without a new capture.

Validation: the correlator reproduces the historical Low gap and keeps it unattributed. A two-second instrumentation smoke on464df1c, Chrome153/Metal AppleM2, Medium720, produced123frame intervals with no lost records or browser errors. It is not a stutter acceptance run. The next recorded run is the fast-track attribution attempt; if still unresolved, the roadmap defers the deep dive.
