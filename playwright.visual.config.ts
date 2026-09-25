import { defineConfig } from '@playwright/test';

const viewports = {
  '720': { width: 1280, height: 720 },
  '1080': { width: 1920, height: 1080 },
  '768': { width: 1366, height: 768 },
  'wide': { width: 2560, height: 1080 },
} as const;
const viewport = viewports[(process.env.QA_VIEWPORT as keyof typeof viewports) || '720'] || viewports['720'];

export default defineConfig({
  testDir: './tests/visual',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  workers: 1,
  expect: { timeout: 20_000 },
  snapshotPathTemplate: `{testDir}/baselines/${viewport.width}x${viewport.height}/{arg}{ext}`,
  use: { baseURL: 'http://127.0.0.1:4186', browserName: 'chromium',
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
    launchOptions: { args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] },
    viewport, deviceScaleFactor: 1 },
  webServer: { command: 'VITE_QA=1 npm run build && npx vite preview --host 127.0.0.1 --port 4186 --strictPort',
    url: 'http://127.0.0.1:4186/?qa=1', reuseExistingServer: false, timeout: 120_000 },
});
