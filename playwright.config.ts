import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'npm run signaling',
      env: { PEER_HOST: '127.0.0.1', PEER_PORT: '9001', PEER_PATH: '/peerjs' },
      url: 'http://127.0.0.1:9001/peerjs',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5174 --strictPort',
      env: { VITE_QA: '1', VITE_PEER_HOST: '127.0.0.1', VITE_PEER_PORT: '9001', VITE_PEER_SECURE: 'false', VITE_PEER_PATH: '/peerjs' },
      url: 'http://127.0.0.1:5174/testfixtures/net.html',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
