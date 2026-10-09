import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: true
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/postprocessing')) {
            return 'vendor-postprocessing';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/zustand')) {
            return 'vendor-react';
          }
        }
      }
    }
  }
});
