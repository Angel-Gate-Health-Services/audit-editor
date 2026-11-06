import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function devPolicy(): Plugin {
  return {
    name: 'aghs-dev-policy',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), devPolicy()],
  build: {
    target: 'es2022',
    sourcemap: true,
    manifest: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
