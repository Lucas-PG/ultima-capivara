import { defineConfig } from 'vitest/config';
export default defineConfig({ cacheDir: '.vitest/cache', test: { include: ['tests/**/*.test.ts'], testTimeout: 15_000, maxWorkers: 1 } });
