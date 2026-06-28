import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'LianMonitor',
      fileName: 'lian-monitor',
      formats: ['es', 'cjs', 'iife']
    },
    rollupOptions: {
      external: ['rrweb', 'web-vitals'],
      output: {
        exports: 'named',
        globals: {
          rrweb: 'rrweb',
          'web-vitals': 'webVitals',
        },
      },
    },
    sourcemap: true
  }
});

