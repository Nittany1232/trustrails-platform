import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 3001,
    open: true
  },
  resolve: {
    alias: {
      '@trustrails/rollover-widget': path.resolve(__dirname, '../../packages/rollover-widget/src/index.ts')
    }
  },
  optimizeDeps: {
    include: ['lit', 'lit/decorators.js']
  }
});