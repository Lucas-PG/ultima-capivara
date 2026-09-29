# QA performance measurement

Measured: 2026-09-29T00:43:35.091Z
Environment: Apple M2, darwin 27.0.0, Chromium 154.0.8037.58, ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version), 1280×720

| Preset | Avg FPS | p95 frame ms | Max ms | >50 ms | Draw calls | Triangles | Heap MB | Menu gzip MB | Match raw MB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low | 60 | 16.7 | 16.8 | 0 | 199 | 798157 | 574.3 | 0.65 | 26.00 |
| medium | 60 | 16.8 | 16.8 | 0 | 284 | 1638536 | 586.4 | 0.67 | 26.00 |
| high | 60 | 16.7 | 16.8 | 0 | 317 | 1804573 | 618.2 | 0.67 | 26.00 |

FPS is derived from real requestAnimationFrame intervals while the renderer draws the frozen seeded practice scene. Download totals count same-origin response bodies through each milestone; menu gzip is a local gzip equivalent. Draw calls and triangles come from renderer.info, including shadow work.
