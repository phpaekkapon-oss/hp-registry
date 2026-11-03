import 'dotenv/config';

// Dates are Thailand time; do not depend on the host's zone setting
process.env.TZ ??= 'Asia/Bangkok';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createBackendApp } from './app';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Behind nginx / a load balancer: TRUST_PROXY=1 (number of proxies in front) makes req.ip the real client address.
// Leave unset when the app is reached directly: otherwise a client could fake its address with X-Forwarded-For.
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', v === 'true' ? true : /^d+$/.test(v) ? Number(v) : v);
}
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Backend API is mounted under /api
app.use('/api', createBackendApp());

// In production the backend also serves the built frontend (frontend/dist).
// In development the frontend runs on its own Vite dev server and proxies /api here.
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`[Backend] API ready at http://0.0.0.0:${port}/api`);
});
