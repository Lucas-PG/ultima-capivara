# WebGPU migration plan

Phase A stays on the tested Three.js r186 WebGL pipeline. WebGPU is a separate renderer project, with WebGL retained as a fallback. It is not a switch on the existing WebGLRenderer.

The current renderer customizes standard lighting, shadow colour, character rims, vegetation deformation, grass, terrain and the character mask through ShaderChunk or onBeforeCompile. Raw shader passes handle world/first-person composition, depth, ambient occlusion, bloom, water, sky, loot, storm and effects. These GLSL hooks need explicit NodeMaterial/TSL equivalents; WebGPURenderer will not execute them unchanged.

1. Freeze representative plaza, river, beach, indoor, first-person and capybara frames, plus movement and reload recordings. Keep the same assets, transforms, colour spaces and camera settings for both backends.
2. Move shared painted lighting, material maps, rims and vertex AO to node materials. Port skinned characters and instance transforms first, with parity tests for animation and hitbox alignment.
3. Port grass/vegetation deformation and water. Share animation inputs and spatial cells across backends. Validate shadows with moving foliage and cell LOD transitions.
4. Rebuild render targets and composition: world depth, occlusion-tested character mask, half-resolution AO/bloom, full-resolution first-person layer, tone mapping and anti-aliasing. Explicitly test attachment formats, colour conversions and overlapping skin seams.
5. Port sky, storm, loot and combat effects. Check transparency ordering, screen-space labels and reduced-motion settings. Keep loading barriers and resource disposal equivalent.
6. Benchmark production builds on the same M2, viewport and DPR. Record CPU submission, GPU time, frame-time p95, memory and shader warmup separately. Ship only after multiplayer/loading/reconnect gates and visual review pass.

Expected gains are conditional: lower CPU submission overhead and better compute options may help large instanced scenes and post effects. WebGPU will not reduce excessive triangles, overdraw or texture traffic on its own, and can regress on some browsers. Do not promise a frame-rate multiplier. The current 60 FPS Medium budget and 40 MB download target remain the acceptance criteria.
