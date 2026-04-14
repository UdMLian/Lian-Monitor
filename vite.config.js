import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'LianMonitor',
      fileName: 'lian-monitor',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['rrweb', 'web-vitals'],
      output: {
        exports: 'named'
      }
    },
    sourcemap: true
  }
});

