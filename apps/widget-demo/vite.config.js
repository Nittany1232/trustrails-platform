import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    open: true
  },
  resolve: {
    alias: {
      '@trustrails/rollover-widget': '../../packages/rollover-widget/src/index.ts'
    }
  }
});