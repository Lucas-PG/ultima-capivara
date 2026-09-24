import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900,
    license: { fileName: 'licenses/dependencies.md' },
    // Cache the engine independently of gameplay edits; model loaders stay lazy.
    rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'three-engine', test: /node_modules[\\/]three[\\/]build[\\/]/ },
    ] } } },
  },
  worker: { format: 'es' },
});
