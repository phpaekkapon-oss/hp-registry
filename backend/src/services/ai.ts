import crypto from 'crypto';
import { EventEmitter } from 'events';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';
import { decryptSecret, encryptSecret } from './settings';

/**
 * AI assistant through OpenRouter (https://openrouter.ai) with automatic model switching:
 * models are tried in the admin's order, and every API key is tried per model, until one answers.
 * Keys are stored AES-GCM encrypted in app_settings; every attempt is logged in ai_log and broadcast live.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SETTINGS_KEY = 'ai';
const TIMEOUT_MS = 45_000;

export interface AiKey {
  id: string;
  label: string;
  /** AES-GCM encrypted */
  enc: string;
  last4: string;
  addedAt: string;
  addedBy: string;
}

export interface AiSettings {
  enabled: boolean;
  /** Tried in this order; the next one is used when the previous fails */
  models: string[];
  keys: AiKey[];
}

export const DEFAULT_MODELS = [
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
];

const DEFAULT_SETTINGS: AiSettings = { enabled: false, models: DEFAULT_MODELS, keys: [] };

export interface AiAttempt {
  id: number;
  at: string;
  purpose: string;
  model: string;
  keyLast4: string;
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number;
  tokens: number | null;
  error: string | null;
  runBy: string;
  /** Groups the attempts of one request (so the UI can show the hand-over from model to model) */
  requestId: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  requestId: string;
  attempts: number;
}

export class AiError extends Error {}

const bus = new EventEmitter();
bus.setMaxListeners(100);

/** Live feed of attempts for the settings page */
export function onAiAttempt(listener: (a: AiAttempt) => void): () => void {
  bus.on('attempt', listener);
  return () => bus.off('attempt', listener);
}

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  tableReady ??= getPool()
    .query(
      `CREATE TABLE IF NOT EXISTS ai_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        request_id VARCHAR(36) NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        model VARCHAR(150) NOT NULL,
        key_last4 VARCHAR(8) NOT NULL,
        ok TINYINT(1) NOT NULL,
        http_status SMALLINT NULL,
        latency_ms INT NOT NULL,
        tokens INT NULL,
        error VARCHAR(500) NULL,
        run_by VARCHAR(100) NOT NULL,
        INDEX idx_ai_log_at (at)
      ) DEFAULT CHARSET=utf8mb4`
    )
    .then(() => undefined)
    .catch((e) => {
      tableReady = null;
      throw e;
    });
  return tableReady;
}

async function readSettings(): Promise<AiSettings> {
  const [rows] = await getPool().query<RowDataPacket[]>('SELECT svalue FROM app_settings WHERE skey = ?', [SETTINGS_KEY]);
  if (!rows[0]) return structuredClone(DEFAULT_SETTINGS);
  try {
    const stored = JSON.parse(rows[0].svalue) as Partial<AiSettings>;
    return { ...DEFAULT_SETTINGS, ...stored, models: stored.models?.length ? stored.models : DEFAULT_MODELS, keys: stored.keys ?? [] };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

async function writeSettings(next: AiSettings, by: string): Promise<void> {
  await getPool().query(
    'INSERT INTO app_settings (skey, svalue, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by)',
    [SETTINGS_KEY, JSON.stringify(next), by]
  );
}

/** What the browser may see: never the key itself */
export interface PublicAiSettings {
  enabled: boolean;
  models: string[];
  keys: { id: string; label: string; last4: string; addedAt: string; addedBy: string }[];
}

export async function getAiSettings(): Promise<PublicAiSettings> {
  const s = await readSettings();
  return { enabled: s.enabled, models: s.models, keys: s.keys.map(({ id, label, last4, addedAt, addedBy }) => ({ id, label, last4, addedAt, addedBy })) };
}

const MODEL_ID = /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i;

export async function saveAiOptions(enabled: boolean, models: string[], by: string): Promise<PublicAiSettings> {
  const clean = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  if (clean.length === 0) throw new AiError('ต้องมีอย่างน้อย 1 โมเดล');
  if (clean.length > 12) throw new AiError('ใส่ได้ไม่เกิน 12 โมเดล');
  const bad = clean.find((m) => !MODEL_ID.test(m) || m.length > 150);
  if (bad) throw new AiError(`ชื่อโมเดลไม่ถูกต้อง: ${bad} (รูปแบบ ผู้ให้บริการ/ชื่อโมเดล)`);
  const s = await readSettings();
  await writeSettings({ ...s, enabled, models: clean }, by);
  return getAiSettings();
}

export async function addAiKey(key: string, label: string, by: string): Promise<PublicAiSettings> {
  const value = key.trim();
  if (!/^sk-or-[A-Za-z0-9-_]{20,}$/.test(value)) throw new AiError('รูปแบบคีย์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย sk-or-)');
  const s = await readSettings();
  if (s.keys.length >= 10) throw new AiError('เก็บคีย์ได้ไม่เกิน 10 คีย์');
  if (s.keys.some((k) => decryptSecret(k.enc) === value)) throw new AiError('มีคีย์นี้อยู่แล้ว');
  s.keys.push({
    id: crypto.randomUUID(),
    label: label.trim().slice(0, 60) || `คีย์ ${s.keys.length + 1}`,
    enc: encryptSecret(value),
    last4: value.slice(-4),
    addedAt: new Date().toISOString(),
    addedBy: by,
  });
  await writeSettings(s, by);
  return getAiSettings();
}

export async function removeAiKey(id: string, by: string): Promise<{ settings: PublicAiSettings; removed: AiKey | null }> {
  const s = await readSettings();
  const removed = s.keys.find((k) => k.id === id) ?? null;
  s.keys = s.keys.filter((k) => k.id !== id);
  await writeSettings(s, by);
  return { settings: await getAiSettings(), removed };
}

async function logAttempt(a: Omit<AiAttempt, 'id' | 'at'>): Promise<void> {
  const at = new Date().toISOString();
  let id = 0;
  try {
    await ensureTable();
    const [res] = await getPool().query(
      'INSERT INTO ai_log (request_id, purpose, model, key_last4, ok, http_status, latency_ms, tokens, error, run_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [a.requestId, a.purpose, a.model, a.keyLast4, a.ok ? 1 : 0, a.httpStatus, a.latencyMs, a.tokens, a.error?.slice(0, 500) ?? null, a.runBy]
    );
    id = (res as { insertId: number }).insertId;
  } catch (e) {
    console.error('[ai] could not write ai_log:', (e as Error).message);
  }
  bus.emit('attempt', { ...a, id, at } satisfies AiAttempt);
}

export async function recentAttempts(limit: number): Promise<AiAttempt[]> {
  await ensureTable();
  const [rows] = await getPool().query<RowDataPacket[]>(
    'SELECT id, at, request_id, purpose, model, key_last4, ok, http_status, latency_ms, tokens, error, run_by FROM ai_log ORDER BY id DESC LIMIT ?',
    [Math.min(Math.max(limit, 1), 200)]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    at: new Date(r.at).toISOString(),
    requestId: String(r.request_id),
    purpose: String(r.purpose),
    model: String(r.model),
    keyLast4: String(r.key_last4),
    ok: Boolean(r.ok),
    httpStatus: r.http_status === null ? null : Number(r.http_status),
    latencyMs: Number(r.latency_ms),
    tokens: r.tokens === null ? null : Number(r.tokens),
    error: r.error === null ? null : String(r.error),
    runBy: String(r.run_by),
  }));
}

interface OpenRouterReply {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
  error?: { message?: string };
}

/** One call to one model with one key */
async function callOnce(model: string, key: string, messages: ChatMessage[], maxTokens: number): Promise<{ text: string; tokens: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Title': 'hp-registry',
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.3 }),
    });
    const body = (await res.json().catch(() => ({}))) as OpenRouterReply;
    if (!res.ok) {
      const err = new Error(body.error?.message ?? `HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const text = body.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      const err = new Error('โมเดลไม่ได้ส่งคำตอบกลับมา') as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return { text, tokens: body.usage?.total_tokens ?? null };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw Object.assign(new Error(`หมดเวลา ${TIMEOUT_MS / 1000} วินาที`), { status: null });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

interface ChatOptions {
  purpose: string;
  runBy: string;
  maxTokens?: number;
  /** Only these models (used by the connection test); default = the configured order */
  models?: string[];
  /** Run even when AI is switched off (connection test) */
  force?: boolean;
}

/** Ask the first model that answers: models in order, every key per model */
export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const s = await readSettings();
  if (!s.enabled && !opts.force) throw new AiError('ปิดการใช้งาน AI อยู่');
  const keys = s.keys.map((k) => ({ last4: k.last4, value: decryptSecret(k.enc) })).filter((k): k is { last4: string; value: string } => Boolean(k.value));
  if (keys.length === 0) throw new AiError('ยังไม่ได้เพิ่มคีย์ OpenRouter');
  const models = opts.models ?? s.models;
  const requestId = crypto.randomUUID();
  let attempts = 0;
  let lastError = '';

  for (const model of models) {
    for (const key of keys) {
      attempts += 1;
      const started = Date.now();
      try {
        const { text, tokens } = await callOnce(model, key.value, messages, opts.maxTokens ?? 800);
        await logAttempt({ requestId, purpose: opts.purpose, model, keyLast4: key.last4, ok: true, httpStatus: 200, latencyMs: Date.now() - started, tokens, error: null, runBy: opts.runBy });
        return { text, model, requestId, attempts };
      } catch (e) {
        const status = (e as { status?: number | null }).status ?? null;
        lastError = (e as Error).message;
        await logAttempt({ requestId, purpose: opts.purpose, model, keyLast4: key.last4, ok: false, httpStatus: status, latencyMs: Date.now() - started, tokens: null, error: lastError, runBy: opts.runBy });
        // A model that does not exist / is not allowed fails the same way with every key: go to the next model
        if (status === 400 || status === 404) break;
      }
    }
  }
  throw new AiError(`ทุกโมเดลใช้งานไม่ได้ (${lastError || 'ไม่ทราบสาเหตุ'})`);
}

/** Try each model on its own (connection test): one row per model */
export async function testModels(runBy: string): Promise<{ model: string; ok: boolean; latencyMs: number; error: string | null }[]> {
  const s = await readSettings();
  const out: { model: string; ok: boolean; latencyMs: number; error: string | null }[] = [];
  for (const model of s.models) {
    const started = Date.now();
    try {
      await chat([{ role: 'user', content: 'ตอบคำว่า OK เท่านั้น' }], { purpose: 'test', runBy, maxTokens: 10, models: [model], force: true });
      out.push({ model, ok: true, latencyMs: Date.now() - started, error: null });
    } catch (e) {
      out.push({ model, ok: false, latencyMs: Date.now() - started, error: (e as Error).message });
    }
  }
  return out;
}

export interface ReleaseNotesInput {
  version: string;
  commits: string[];
  files: string[];
}

export interface ReleaseNotes {
  title: string;
  kind: 'major' | 'minor' | 'patch';
  highlights: string[];
}

/** Thai release notes for end users, written from the commit messages and changed files */
export async function writeReleaseNotes(input: ReleaseNotesInput, runBy: string): Promise<ReleaseNotes & { model: string }> {
  const prompt = [
    `เขียนบันทึกการอัปเดตระบบงานพัสดุ (โรงพยาบาล) เวอร์ชัน ${input.version} สำหรับผู้ใช้ทั่วไป (เจ้าหน้าที่พัสดุ ไม่ใช่โปรแกรมเมอร์)`,
    'ใช้ภาษาไทยสุภาพ กระชับ บอกว่าผู้ใช้จะเห็นหรือได้อะไร ห้ามใช้ศัพท์เทคนิค ชื่อไฟล์ หรือชื่อฟังก์ชัน ห้ามแต่งเรื่องที่ไม่มีในข้อมูล',
    'ตอบเป็น JSON อย่างเดียว รูปแบบ {"title": "หัวข้อสั้นไม่เกิน 60 ตัวอักษร", "kind": "patch" | "minor", "highlights": ["ข้อละ 1 ประโยค", ...]} มี 2–5 ข้อ',
    'kind = "minor" เมื่อมีความสามารถใหม่ที่ผู้ใช้เห็นชัด นอกนั้น "patch"',
    '',
    'ข้อความ commit:',
    ...(input.commits.length ? input.commits.map((c) => `- ${c}`) : ['- (ไม่มี commit ใหม่ มีแต่ไฟล์ที่แก้ไข)']),
    '',
    'ไฟล์ที่เปลี่ยน:',
    ...input.files.slice(0, 80).map((f) => `- ${f}`),
  ].join('\n');

  const res = await chat([{ role: 'user', content: prompt }], { purpose: 'release-notes', runBy, maxTokens: 900 });
  const json = /\{[\s\S]*\}/.exec(res.text)?.[0];
  if (!json) throw new AiError('AI ไม่ได้ตอบเป็น JSON');
  const parsed = JSON.parse(json) as Partial<ReleaseNotes>;
  const highlights = (parsed.highlights ?? []).filter((h): h is string => typeof h === 'string' && h.trim().length > 0).map((h) => h.trim().slice(0, 300)).slice(0, 6);
  if (!parsed.title || highlights.length === 0) throw new AiError('AI ตอบไม่ครบ (ไม่มีหัวข้อหรือรายการ)');
  return {
    title: String(parsed.title).trim().slice(0, 80),
    kind: parsed.kind === 'minor' || parsed.kind === 'major' ? parsed.kind : 'patch',
    highlights,
    model: res.model,
  };
}
