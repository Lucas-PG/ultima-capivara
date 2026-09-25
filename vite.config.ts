import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900,
    license: { fileName: 'licenses/dependencies.md' },
    // Cache the engine independently of gameplay edits; model loaders stay lazy.
    rolldownOptions: { input: process.env.VITE_QA === '1' ? ['index.html', 'tests/visual/character-mask.html'] : 'index.html', output: { codeSplitting: { groups: [
      { name: 'three-engine', test: /node_modules[\\/]three[\\/]build[\\/]/ },
    ] } } },
  },
  worker: { format: 'es' },
});
