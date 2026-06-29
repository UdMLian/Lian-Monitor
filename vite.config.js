import { defineConfig } from 'vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
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

