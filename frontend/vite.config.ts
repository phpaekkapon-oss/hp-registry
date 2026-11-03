import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {readFileSync} from 'fs';
import {defineConfig} from 'vite';

// Single source of truth for the version shown in the app: the root package.json (bumped by release.bat).
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
  repository?: string | { url?: string };
};
const repoUrl = (typeof rootPkg.repository === 'string' ? rootPkg.repository : rootPkg.repository?.url ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __APP_REPO_URL__: JSON.stringify(repoUrl),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
            { name: 'vendor-ui', test: /node_modules[\/](motion|framer-motion|motion-dom|motion-utils|@radix-ui|lucide-react)/ },
          ],
        },
      },
    },
  },
  server: {
    // dev.bat (scripts/dev.mjs) picks a free port and keeps it the same between runs.
    // strictPort: false — lets Vite shift to the next free port if the preferred one is still releasing;
    // dev.mjs already pre-selects a free port, but strictPort:true causes an immediate crash if
    // the OS hasn't fully released the port yet (common when restarting quickly on Windows).
    port: Number(process.env.WEB_PORT ?? 5174),
    strictPort: false,
    // Forward API calls to the backend server during development.
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://localhost:3000',
        // Keep the browser's Host header: the backend compares it with Origin to block cross-site requests
        changeOrigin: false,
      },
    },
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
