import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {readFileSync} from 'fs';
import {defineConfig, type Plugin} from 'vite';

// Single source of truth for the version shown in the app: the root package.json (bumped by deploy.bat on every deploy).
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
  version: string;
  repository?: string | { url?: string };
};
const repoUrl = (typeof rootPkg.repository === 'string' ? rootPkg.repository : rootPkg.repository?.url ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');

// A real build gets a fresh id (each deploy must be acknowledged again). The dev server keeps one id per version,
// otherwise every restart of dev.bat would ask for the "what's new" confirmation again.
const buildIdFor = (command: string) => (command === 'build' ? Date.now().toString(36) : `dev-${rootPkg.version}`);

/** Publishes {version, build} next to index.html so open tabs can notice a newer deployment */
const versionFile = (buildId: string): Plugin => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: rootPkg.version, build: buildId }) });
  },
});

export default defineConfig(({ command }) => {
  const buildId = buildIdFor(command);
  return {
  // Served under /hp-registry/ on the server only; dev.bat (scripts/dev.mjs) expects the app at the root.
  base: command === 'build' ? '/hp-registry/' : '/',
  plugins: [react(), tailwindcss(), versionFile(buildId)],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __APP_REPO_URL__: JSON.stringify(repoUrl),
    __APP_BUILD__: JSON.stringify(buildId),
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
};
});
