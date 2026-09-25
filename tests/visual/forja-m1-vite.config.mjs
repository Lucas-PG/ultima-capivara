import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Frozen git archives symlink their dependencies from the QA checkout. Allow Vite
// to serve font files from that real path; otherwise the screenshots use fallback fonts.
export default defineConfig({
  base: './',
  server: { fs: { allow: [process.cwd(), resolve(process.cwd(), '../../node_modules')] } },
});
