import { Router, Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    mode: 'Full-Stack (Vite + Express)',
    server: 'Node.js Express Backend',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
