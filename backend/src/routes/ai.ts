import { Router, Request, Response } from 'express';
import { isSessionActive, requireAuth, requireMenu, requirePermission } from '../services/auth';
import { audit } from '../services/audit';
import { AiError, addAiKey, getAiSettings, onAiAttempt, recentAttempts, removeAiKey, saveAiOptions, testModels } from '../services/ai';

/** Settings → AI assistant. Admin only. */
export const aiRouter = Router();

const adminOnly = [requireAuth, requirePermission('manageUsers'), requireMenu('usermgmt')];

const fail = (res: Response, e: unknown) => {
  if (e instanceof AiError) return res.status(400).json({ success: false, message: e.message });
  console.error('[ai]', e);
  return res.status(500).json({ success: false, message: 'ดำเนินการไม่สำเร็จ' });
};

aiRouter.get('/settings', ...adminOnly, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getAiSettings() });
  } catch (e) {
    fail(res, e);
  }
});

aiRouter.put('/settings', ...adminOnly, async (req: Request, res: Response) => {
  const { enabled, models } = (req.body ?? {}) as { enabled?: unknown; models?: unknown };
  if (typeof enabled !== 'boolean' || !Array.isArray(models) || !models.every((m) => typeof m === 'string')) {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
  }
  try {
    const before = await getAiSettings();
    const data = await saveAiOptions(enabled, models as string[], req.auth!.user.username);
    await audit(req, {
      action: 'update',
      resource: 'ai',
      recordId: 'settings',
      summary: `ตั้งค่า AI: ${enabled ? 'เปิด' : 'ปิด'}การใช้งาน · ลำดับโมเดล ${data.models.join(' → ')}`,
      before: { enabled: before.enabled, models: before.models },
      after: { enabled: data.enabled, models: data.models },
    });
    res.json({ success: true, data });
  } catch (e) {
    fail(res, e);
  }
});

aiRouter.post('/keys', ...adminOnly, async (req: Request, res: Response) => {
  const { key, label } = (req.body ?? {}) as { key?: unknown; label?: unknown };
  if (typeof key !== 'string') return res.status(400).json({ success: false, message: 'กรุณาใส่คีย์' });
  try {
    const data = await addAiKey(key, typeof label === 'string' ? label : '', req.auth!.user.username);
    const added = data.keys[data.keys.length - 1];
    await audit(req, { action: 'security', resource: 'ai', recordId: added?.id ?? null, summary: `เพิ่มคีย์ OpenRouter "${added?.label}" (ลงท้าย ${added?.last4})` });
    res.json({ success: true, data });
  } catch (e) {
    fail(res, e);
  }
});

aiRouter.delete('/keys/:id', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { settings, removed } = await removeAiKey(String(req.params.id), req.auth!.user.username);
    if (removed) await audit(req, { action: 'security', resource: 'ai', recordId: removed.id, summary: `ลบคีย์ OpenRouter "${removed.label}" (ลงท้าย ${removed.last4})` });
    res.json({ success: true, data: settings });
  } catch (e) {
    fail(res, e);
  }
});

aiRouter.post('/test', ...adminOnly, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await testModels(req.auth!.user.username) });
  } catch (e) {
    fail(res, e);
  }
});

aiRouter.get('/logs', ...adminOnly, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await recentAttempts(Number(req.query.limit) || 50) });
  } catch (e) {
    fail(res, e);
  }
});

// Live attempts (Server-Sent Events): the settings page animates each model hand-over as it happens
aiRouter.get('/live', ...adminOnly, (req: Request, res: Response) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 4000\n\n');
  const sid = req.auth?.sid;
  const stop = onAiAttempt((a) => res.write(`data: ${JSON.stringify(a)}\n\n`));
  const keepAlive = setInterval(() => {
    if (!isSessionActive(sid)) return res.end();
    res.write(': keep-alive\n\n');
  }, 25_000);
  req.on('close', () => {
    clearInterval(keepAlive);
    stop();
  });
});
