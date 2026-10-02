import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version: pkgVersion } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],

  appType: 'spa',

  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.APP_VERSION || pkgVersion
    ),
    __BUILD_TIME__: JSON.stringify(
      new Date().toISOString()
    ),
  },

  server: {
    host: '0.0.0.0',
    port: 2886,
    strictPort: true,

    allowedHosts: true,

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:2785',
        changeOrigin: true,
        secure: false,
      },

      '/socket.io': {
        target: 'http://127.0.0.1:2785',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});