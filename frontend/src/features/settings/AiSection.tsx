import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Bot, CheckCircle2, KeyRound, Loader2, Plus, Radio, Save, Trash2, UserRound, Wand2, XCircle, Zap } from 'lucide-react';
import { aiApi, type AiAttempt, type AiSettings, type AiTestResult } from './aiApi';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const shortModel = (m: string) => m.split('/').pop()?.replace(/:free$/, ' (ฟรี)') ?? m;
const PURPOSE_TH: Record<string, string> = { test: 'ทดสอบ', 'release-notes': 'เขียนบันทึกเวอร์ชัน' };

type NodeState = 'idle' | 'trying' | 'ok' | 'fail';

const Card: React.FC<{ title: string; hint?: string; icon: React.ElementType; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, icon: Icon, actions, children }) => (
  <section className="gov-card space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft" aria-hidden>
          <Icon className="h-[18px] w-[18px] text-brand" />
        </span>
        <div className="min-w-0">
          <h2 className="font-prompt text-base font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-ink-3">{hint}</p>}
        </div>
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const MODEL_FACE: Record<NodeState, { top: string; front: string; right: string; h: number }> = {
  idle: { top: '#475569', front: '#1e293b', right: '#334155', h: 26 },
  trying: { top: '#fbbf24', front: '#92400e', right: '#b45309', h: 52 },
  ok: { top: '#34d399', front: '#065f46', right: '#047857', h: 70 },
  fail: { top: '#fb7185', front: '#881337', right: '#9f1239', h: 18 },
};

interface Point {
  x: number;
  y: number;
}

/** A floor line from a to b (plane coordinates), optionally with a data packet running along it */
const Link: React.FC<{ a: Point; b: Point; tone?: 'active' | 'ok' | 'fail' | 'idle' }> = ({ a, b, tone = 'idle' }) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (
    <div
      className={`ai-link ${tone === 'active' ? 'ai-link-active' : tone === 'ok' ? 'ai-link-ok' : tone === 'fail' ? 'ai-link-fail' : ''}`}
      style={{ left: a.x, top: a.y, width: Math.hypot(dx, dy), ['--a' as string]: `${Math.atan2(dy, dx)}rad` }}
    >
      {tone === 'active' && <span className="ai-packet" />}
    </div>
  );
};

/**
 * 3D scene of one AI request: the person (or the deploy) → this server → OpenRouter → the models in fallback order.
 * Packets run along the links while a request is in flight; each model is a block that rises green when it answers,
 * sinks red when it fails (and the next one lights up amber), or stays grey until it is used.
 */
const ModelStage: React.FC<{
  models: string[];
  states: Record<string, NodeState>;
  stats: Record<string, { ok: number; total: number; avgMs: number }>;
  busy: boolean;
  who: string | null;
  purpose: string | null;
  keyLast4: string | null;
}> = ({ models, states, stats, busy, who, purpose, keyLast4 }) => {
  const person: Point = { x: 70, y: 200 };
  const server: Point = { x: 275, y: 200 };
  const hub: Point = { x: 465, y: 200 };
  const n = models.length;
  // Models fan out in two staggered columns so their labels do not overlap
  const spacing = n > 1 ? Math.min(130, 360 / (n - 1)) : 0;
  const modelAt = (i: number): Point => ({ x: 640 + (i % 2) * 80, y: 200 - ((n - 1) * spacing) / 2 + i * spacing });
  const anyOk = Object.values(states).includes('ok');

  return (
    <div className="ai-stage rounded-2xl" role="img" aria-label={`ผู้ใช้ → เซิร์ฟเวอร์ → OpenRouter → โมเดล ${n} ตัว${busy ? ' กำลังทำงาน' : ''}`}>
      <div className="ai-plane">
        {/* person */}
        <div className="ai-box" style={{ left: person.x - 30, top: person.y - 30, width: 60, height: 60, ['--h' as string]: '0px' }}>
          <div className="ai-shadow" />
          <div className="ai-face ai-top" style={{ borderRadius: '50%', background: 'radial-gradient(#38bdf8aa, #0369a144)', transform: 'translateZ(1px)' }} />
          <div className={`ai-avatar ${busy ? 'ai-avatar-busy' : ''}`}>
            <UserRound className="h-7 w-7" aria-hidden />
          </div>
          <div className="ai-label" style={{ ['--lift' as string]: '96px' }}>
            {who === 'deploy' ? 'Deploy (อัตโนมัติ)' : who ?? 'ผู้ใช้'}
            <small>{purpose ? (PURPOSE_TH[purpose] ?? purpose) : 'รอคำขอ'}</small>
          </div>
        </div>
        <Link a={person} b={{ x: server.x - 40, y: server.y }} tone={busy ? 'active' : anyOk ? 'ok' : 'idle'} />

        {/* this server */}
        <div className="ai-box" style={{ left: server.x - 40, top: server.y - 40, width: 80, height: 80, ['--h' as string]: '140px' }}>
          <div className="ai-shadow" />
          <div className="ai-face ai-top" style={{ background: 'linear-gradient(135deg, #64748b, #334155)' }} />
          <div className="ai-face ai-front ai-rack">
            <span className="ai-led" style={{ top: 8 }} />
            <span className="ai-led" style={{ top: 44 }} />
            <span className="ai-led" style={{ top: 80 }} />
          </div>
          <div className="ai-face ai-right ai-rack" style={{ filter: 'brightness(1.3)' }} />
          <div className="ai-label">
            เซิร์ฟเวอร์ hp-registry
            <small>{window.location.host}</small>
          </div>
        </div>
        <Link a={{ x: server.x + 40, y: server.y }} b={{ x: hub.x - 30, y: hub.y }} tone={busy ? 'active' : anyOk ? 'ok' : 'idle'} />

        {/* OpenRouter gateway */}
        <div className="ai-box" style={{ left: hub.x - 30, top: hub.y - 30, width: 60, height: 60, ['--h' as string]: '50px' }}>
          <div className="ai-shadow" />
          <div className="ai-face ai-top" style={{ background: 'linear-gradient(135deg, #a78bfa, #6d28d9)', borderRadius: 10 }} />
          <div className="ai-face ai-front" style={{ background: '#4c1d95' }} />
          <div className="ai-face ai-right" style={{ background: '#5b21b6' }} />
          <div className="ai-label">
            OpenRouter
            <small>{keyLast4 ? `คีย์ …${keyLast4}` : 'สลับโมเดลอัตโนมัติ'}</small>
          </div>
        </div>

        {/* models, in fallback order */}
        {models.map((m, i) => {
          const st = states[m] ?? 'idle';
          const face = MODEL_FACE[st];
          const p = modelAt(i);
          const s = stats[m];
          return (
            <React.Fragment key={m}>
              <Link a={{ x: hub.x + 30, y: hub.y }} b={{ x: p.x - 30, y: p.y }} tone={st === 'trying' ? 'active' : st === 'ok' ? 'ok' : st === 'fail' ? 'fail' : 'idle'} />
              <div className={`ai-box ${st === 'fail' ? 'ai-shake' : ''}`} style={{ left: p.x - 30, top: p.y - 25, width: 60, height: 50, ['--h' as string]: `${face.h}px` }}>
                <div className="ai-shadow" />
                <div className="ai-face ai-top" style={{ background: face.top }} />
                <div className="ai-face ai-front" style={{ background: face.front }} />
                <div className="ai-face ai-right" style={{ background: face.right }} />
                <div className="ai-label" style={{ ['--lift' as string]: '26px' }}>
                  {i + 1} · {shortModel(m)}
                  <small>{s ? `สำเร็จ ${Math.round((s.ok / s.total) * 100)}% · ${(s.avgMs / 1000).toFixed(1)} วิ` : 'ยังไม่เคยใช้'}</small>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="ai-legend">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> ข้อมูลกำลังวิ่ง</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> กำลังลองโมเดลนี้</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> ตอบสำเร็จ</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> ล้ม → สลับตัวถัดไป</span>
      </div>
    </div>
  );
};

export const AiSection: React.FC = () => {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [newModel, setNewModel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [logs, setLogs] = useState<AiAttempt[]>([]);
  const [tests, setTests] = useState<AiTestResult[] | null>(null);
  const [busy, setBusy] = useState<'save' | 'key' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  // Re-evaluate "recent" every few seconds so a finished hand-over stops animating on its own
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClock((c) => c + 1), 3000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([aiApi.settings(), aiApi.logs(60)]);
      setSettings(s);
      setEnabled(s.enabled);
      setModels(s.models);
      setLogs(l);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live feed: every attempt (from any page, a test, or a deploy) arrives here as it happens
  useEffect(() => {
    const stop = aiApi.live((a) => {
      setLive(true);
      setLogs((prev) => [a, ...prev.filter((p) => p.id !== a.id)].slice(0, 120));
    });
    setLive(true);
    return stop;
  }, []);

  const dirty = settings !== null && (enabled !== settings.enabled || models.join('|') !== settings.models.join('|'));

  // State of each model in the most recent request
  // What the 3D scene shows: the most recent request, or the one being tested right now
  const scene = useMemo(() => {
    const latest = logs[0];
    const testing = busy === 'test';
    const recent = latest ? Date.now() - new Date(latest.at).getTime() < 8000 : false;
    const states: Record<string, NodeState> = {};
    if (latest && (recent || !testing)) {
      const attempts = logs.filter((l) => l.requestId === latest.requestId).reverse();
      for (const a of attempts) states[a.model] = a.ok ? 'ok' : 'fail';
      const last = attempts[attempts.length - 1];
      if ((recent || testing) && !last.ok) {
        const next = models[models.indexOf(last.model) + 1];
        if (next) states[next] = 'trying';
      }
    }
    // A test is running but no attempt has come back yet: the first model is being tried
    if (testing && !Object.values(states).includes('trying') && !(recent && latest?.ok)) {
      const first = models.find((m) => !states[m] || states[m] === 'idle');
      if (first) states[first] = 'trying';
    }
    const inFlight = Object.values(states).includes('trying');
    return {
      states,
      busy: inFlight,
      who: testing ? null : latest?.runBy ?? null,
      purpose: testing ? 'test' : latest?.purpose ?? null,
      keyLast4: latest?.keyLast4 ?? null,
    };
  }, [logs, models, busy, clock]);

  const stats = useMemo(() => {
    const out: Record<string, { ok: number; total: number; avgMs: number }> = {};
    for (const l of logs) {
      const s = (out[l.model] ??= { ok: 0, total: 0, avgMs: 0 });
      s.avgMs = (s.avgMs * s.total + l.latencyMs) / (s.total + 1);
      s.total += 1;
      if (l.ok) s.ok += 1;
    }
    return out;
  }, [logs]);

  // Group the feed by request so each row reads "model A ✖ → model B ✔"
  const requests = useMemo(() => {
    const groups = new Map<string, AiAttempt[]>();
    for (const l of logs) groups.set(l.requestId, [...(groups.get(l.requestId) ?? []), l]);
    return [...groups.values()].map((g) => [...g].reverse()).slice(0, 15);
  }, [logs]);

  const run = async (kind: 'save' | 'key' | 'test', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const move = (i: number, d: -1 | 1) =>
    setModels((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  if (!settings && !error) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-ink-4" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดการตั้งค่า AI...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20">{notice}</p>}

      <Card
        title="การสลับโมเดลแบบสด"
        hint="ระบบลองโมเดลตามลำดับ ถ้าตัวไหนล้ม (เกินโควตา ช้า หรือปิดให้บริการ) จะสลับไปตัวถัดไปเองทันที"
        icon={Zap}
        actions={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${live ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10'}`}>
            <Radio className="h-3.5 w-3.5" aria-hidden /> {live ? 'เชื่อมต่อสด' : 'ไม่ได้เชื่อมต่อ'}
          </span>
        }
      >
        <ModelStage models={models} states={scene.states} stats={stats} busy={scene.busy} who={scene.who} purpose={scene.purpose} keyLast4={scene.keyLast4} />

        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">ความเคลื่อนไหวล่าสุด</h3>
          {requests.length === 0 ? (
            <p className="text-sm text-ink-4">ยังไม่มีการเรียกใช้ AI ลองกด "ทดสอบการเชื่อมต่อ" ด้านล่าง</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((g) => {
                const done = g[g.length - 1];
                return (
                  <li key={g[0].requestId} className="ai-feed-row flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-chroma-subtle px-3 py-2 text-xs">
                    <span className="w-16 shrink-0 tabular-nums text-ink-5">{timeOf(done.at)}</span>
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">{PURPOSE_TH[done.purpose] ?? done.purpose}</span>
                    {g.map((a, i) => (
                      <React.Fragment key={a.id}>
                        {i > 0 && <span className="text-ink-5" aria-hidden>→</span>}
                        <span
                          title={a.error ?? `${a.latencyMs} ms${a.tokens ? ` · ${a.tokens} tokens` : ''} · คีย์ …${a.keyLast4}`}
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ${a.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'}`}
                        >
                          {a.ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
                          {shortModel(a.model)}
                          <span className="font-normal opacity-80">{a.ok ? `${(a.latencyMs / 1000).toFixed(1)} วิ` : a.httpStatus ?? 'หมดเวลา'}</span>
                        </span>
                      </React.Fragment>
                    ))}
                    <span className="ml-auto text-ink-5">โดย {done.runBy}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card
        title="ผู้ช่วย AI"
        hint="ใช้ OpenRouter เขียนบันทึกการอัปเดตเวอร์ชันให้อัตโนมัติทุกครั้งที่ deploy"
        icon={Bot}
        actions={
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/15'}`}
          >
            <span className="sr-only">เปิดใช้งาน AI</span>
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        }
      >
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">ลำดับโมเดล (ลองจากบนลงล่าง)</h3>
          <ol className="space-y-2">
            {models.map((m, i) => (
              <li key={m} className="flex items-center gap-2 rounded-xl border border-chroma-subtle px-3 py-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm" title={m}>{m}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`เลื่อน ${m} ขึ้น`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === models.length - 1} aria-label={`เลื่อน ${m} ลง`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setModels((p) => p.filter((x) => x !== m))} disabled={models.length === 1} aria-label={`ลบ ${m}`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30 dark:text-rose-300 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const m = newModel.trim();
              if (m && !models.includes(m)) setModels((p) => [...p, m]);
              setNewModel('');
            }}
          >
            <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="เพิ่มโมเดล เช่น anthropic/claude-3.5-haiku" aria-label="ชื่อโมเดลที่จะเพิ่ม" className="pf-field min-h-[40px] min-w-0 flex-1 rounded-lg px-3 font-mono text-sm" />
            <button type="submit" className="inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-chroma-subtle px-3 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-white/5"><Plus className="h-4 w-4" /> เพิ่ม</button>
          </form>
          <p className="mt-1.5 text-xs text-ink-5">ดูชื่อโมเดลได้ที่ openrouter.ai/models · ลงท้าย :free คือรุ่นฟรี (มีโควตาจำกัด)</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-chroma-subtle pt-4">
          <button
            type="button"
            disabled={!dirty || busy !== null}
            onClick={() => run('save', async () => {
              const s = await aiApi.save(enabled, models);
              setSettings(s);
              setModels(s.models);
              setNotice('บันทึกการตั้งค่า AI แล้ว');
            })}
            className="btn-brand inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึก
          </button>
          <button
            type="button"
            disabled={busy !== null || (settings?.keys.length ?? 0) === 0}
            onClick={() => run('test', async () => setTests(await aiApi.test()))}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-chroma-subtle px-4 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/5"
          >
            {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} ทดสอบการเชื่อมต่อ
          </button>
          {dirty && <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">ยังไม่ได้บันทึก (ทดสอบใช้ลำดับที่บันทึกไว้)</span>}
        </div>

        {tests && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tests.map((t) => (
              <li key={t.model} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1 ${t.ok ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-400/25' : 'bg-rose-50 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-400/25'}`}>
                {t.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />}
                <span className="min-w-0">
                  <span className="block truncate font-mono font-semibold">{t.model}</span>
                  <span className="block text-xs text-ink-4">{t.ok ? `ใช้ได้ · ${(t.latencyMs / 1000).toFixed(1)} วินาที` : t.error}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="คีย์ OpenRouter" hint="เก็บแบบเข้ารหัสในฐานข้อมูล แสดงแค่ 4 ตัวท้าย ถ้าคีย์หนึ่งเกินโควตา ระบบลองคีย์ถัดไปเอง" icon={KeyRound}>
        {settings && settings.keys.length > 0 ? (
          <ul className="space-y-2">
            {settings.keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-chroma-subtle px-3 py-2.5">
                <KeyRound className="h-4 w-4 shrink-0 text-ink-4" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{k.label}</span>
                  <span className="block font-mono text-xs text-ink-4">sk-or-…{k.last4} · เพิ่มโดย {k.addedBy} · {dateTime(k.addedAt)}</span>
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`ลบคีย์ "${k.label}" (…${k.last4}) ?`)) return;
                    void run('key', async () => {
                      setSettings(await aiApi.removeKey(k.id));
                      setNotice('ลบคีย์แล้ว');
                    });
                  }}
                  className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="h-4 w-4" /> ลบ
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-4">ยังไม่มีคีย์ สร้างได้ที่ openrouter.ai → Keys</p>
        )}
        <form
          className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void run('key', async () => {
              setSettings(await aiApi.addKey(newKey, newKeyLabel));
              setNewKey('');
              setNewKeyLabel('');
              setNotice('เพิ่มคีย์แล้ว');
            });
          }}
        >
          <input value={newKeyLabel} onChange={(e) => setNewKeyLabel(e.target.value)} placeholder="ชื่อเรียก (ไม่บังคับ)" aria-label="ชื่อเรียกคีย์" className="pf-field min-h-[40px] rounded-lg px-3 text-sm" />
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} type="password" autoComplete="off" placeholder="sk-or-v1-..." aria-label="คีย์ OpenRouter" className="pf-field min-h-[40px] min-w-0 rounded-lg px-3 font-mono text-sm" />
          <button type="submit" disabled={!newKey.trim() || busy !== null} className="btn-brand inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'key' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} เพิ่มคีย์
          </button>
        </form>
      </Card>
    </div>
  );
};
