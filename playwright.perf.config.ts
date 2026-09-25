import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/perf',
  testMatch: '*.spec.ts',
  timeout: 180_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4186', browserName: 'chromium',
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
    launchOptions: { args: process.platform === 'darwin'
      ? ['--enable-precise-memory-info', '--use-gl=angle', '--use-angle=metal']
      : ['--enable-precise-memory-info'] } },
  webServer: { command: 'VITE_QA=1 npm run build && npx vite preview --host 127.0.0.1 --port 4186 --strictPort',
    url: 'http://127.0.0.1:4186/?qa=1', reuseExistingServer: false, timeout: 120_000 },
});
