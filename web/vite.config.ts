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
    fs: {
      // Allow serving wasm files
      allow: ['..'],
    },
  },

  optimizeDeps: {
    // Don't pre-bundle the wasm-pack output
    exclude: ['gatestack-core'],
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    // Ensure WASM files are treated as assets
    rollupOptions: {
      external: [],
    },
  },
});
