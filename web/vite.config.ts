import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],

  // Use relative paths so Electron can load from file://
  base: './',

  server: {
    port: 3000,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Ensure assets use relative paths
    assetsDir: 'assets',
  },
});
