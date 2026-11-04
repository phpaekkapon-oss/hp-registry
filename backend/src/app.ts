import express, { Express, Request, Response, NextFunction } from 'express';
import { healthRouter } from './routes/health';
import { systemRouter } from './routes/system';
import { lookupsRouter } from './routes/lookups';
import { securityRouter } from './routes/security';
import { authRouter } from './routes/auth';
import { procureRouter } from './routes/procure';
import { usersRouter } from './routes/users';
import { auditRouter } from './routes/audit';
import { notificationsRouter } from './routes/notifications';
import { aiRouter } from './routes/ai';
import { attachSession, requireAuth } from './services/auth';

/** Extra browser origins allowed to call the API, e.g. a reverse proxy name: ALLOWED_ORIGINS=intranet.example.go.th */
const ALLOWED_ORIGIN_HOSTS = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
);

/**
 * Creates and configures the Express backend application
 */
export function createBackendApp(): Express {
  const app = express();

  // Baseline security headers (API responses are never cacheable: they can contain PII)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Middleware
  app.use(express.json({ limit: '100kb' }));

  // CSRF defence for cookie auth: state-changing requests must come from this same origin
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.headers.origin;
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== req.headers.host && !ALLOWED_ORIGIN_HOSTS.has(originHost)) throw new Error('cross-origin');
      } catch {
        console.warn('[csrf] blocked: origin=' + origin + ' host=' + req.headers.host + ' x-forwarded-host=' + req.headers['x-forwarded-host']);
        return res.status(403).json({ success: false, code: 'BAD_ORIGIN', message: 'คำขอไม่ได้มาจากเว็บของระบบนี้' });
      }
    }
    return next();
  });

  // Resolve the session cookie (if any) for every request
  app.use(attachSession);

  // Public routes
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/auth', securityRouter);
  app.use('/system/lookups', lookupsRouter);
  app.use('/system', systemRouter);

  // Everything below requires a signed-in user (roles are enforced per route)
  app.use('/procure', requireAuth, procureRouter);
  app.use('/users', requireAuth, usersRouter);
  app.use('/audit', requireAuth, auditRouter);
  app.use('/notifications', requireAuth, notificationsRouter);
  app.use('/ai', aiRouter);

  // Fallback 404 for unmatched /api routes
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'API route not found' });
  });

  return app;
}
