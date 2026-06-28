import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  server: {
    port: 5174,
    open: '/index.html',
  },
  resolve: {
    alias: {
      'lian-monitor': path.resolve(__dirname, '../src/index.js'),
    },
  },
});
