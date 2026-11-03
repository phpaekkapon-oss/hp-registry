import React, { useId, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Pencil, Trash2, X } from 'lucide-react';
import type { Lookups } from './api';
import type { FieldDef } from './fields';
import { ThaiDatePicker } from '../../components/ui/thai-date-picker';
import { ComboInput } from '../../components/ui/combo-input';
import { money, statusTone, thaiDate } from './format';
import { IncomingPicker, IncomingRefText } from './IncomingPicker';
import { LINK_ROLES, LinkPicker, LinkRefText } from './LinkPicker';

export type FormValues = Record<string, string | boolean>;

const inputCls = 'pf-field w-full min-h-[44px] rounded-lg px-3 py-2 text-sm';

/** Convert a stored row into form strings (null -> '') */
export function toFormValues(fields: FieldDef[], row: Record<string, unknown> | null): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    if (f.listOnly) continue;
    const v = row?.[f.key];
    out[f.key] = f.type === 'checkbox' ? Boolean(v) : v === null || v === undefined ? '' : String(v);
  }
  return out;
}

/** Convert form strings into an API payload (empty -> null so a field can be cleared) */
export function toPayload(fields: FieldDef[], values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.listOnly) continue;
    const v = values[f.key];
    out[f.key] = f.type === 'checkbox' ? Boolean(v) : typeof v === 'string' && v.trim() === '' ? null : v;
  }
  return out;
}

/** A stored value as people read it: Thai dates, money with commas, "–" when empty */
function displayValue(f: FieldDef, v: string | boolean | undefined): string {
  if (f.type === 'checkbox') return v ? 'ใช่' : 'ไม่ใช่';
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  if (f.type === 'date') return thaiDate(s);
  if (f.type === 'number' && f.align === 'right') return money(s);
  return s;
}

/** View mode: the record as a read-only sheet (labels and values, no input boxes); empty sections are left out */
const ReadOnlyView: React.FC<{ sections: [string, FieldDef[]][]; values: FormValues; wide: boolean }> = ({ sections, values, wide }) => (
  <>
    {sections
      .filter(([, list]) => list.some((f) => f.type === 'checkbox' || displayValue(f, values[f.key]) !== ''))
      .map(([section, list]) => (
        <section key={section} className="min-w-0">
          {section && (
            <h3 className="mb-2 border-b border-slate-200 pb-1.5 font-prompt text-sm font-semibold text-slate-900 dark:border-white/10 dark:text-white">{section}</h3>
          )}
          <dl className={wide ? 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2'}>
            {list.map((f) => {
              const text = displayValue(f, values[f.key]);
              return (
                <div key={f.key} className={f.type === 'textarea' && wide ? 'sm:col-span-2 lg:col-span-4' : f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs font-medium text-ink-5">{f.label}</dt>
                  <dd className={`mt-0.5 whitespace-pre-line break-words text-sm ${f.align === 'right' ? 'tabular-nums' : ''}`}>
                    {!text ? (
                      <span className="text-ink-6">–</span>
                    ) : f.type === 'incoming' ? (
                      <span className="text-ink"><IncomingRefText id={text} /></span>
                    ) : f.type === 'link' ? (
                      <span className="text-ink">
                        {f.linkRole && <span className="mr-1.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">{LINK_ROLES.find((r) => r.value === (values.link_role || 'invoice'))?.label}</span>}
                        <LinkRefText value={text} />
                      </span>
                    ) : f.key === 'status' ? (
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${statusTone(text)}`}>{text}</span>
                    ) : (
                      <span className="font-medium text-ink">{text}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
  </>
);

interface Props {
  title: string;
  fields: FieldDef[];
  lookups: Lookups | null;
  initial: FormValues;
  isNew: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onSave: (values: FormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  /** Soft validation messages for the current values (never block saving) */
  warnings?: (values: FormValues) => string[];
  /** Called after a field changes; return extra values to fill in (e.g. tax ID from vendor name) */
  onFieldChange?: (key: string, value: string | boolean, values: FormValues) => FormValues | void;
  /** Extra form content rendered after the fields (e.g. the progress step dates) */
  children?: React.ReactNode;
  /** View mode only: switch to editing this record */
  onEdit?: () => void;
}

export const RecordDialog: React.FC<Props> = ({ title, fields, lookups, initial, isNew, canEdit, canDelete, onSave, onDelete, onClose, warnings, onFieldChange, children, onEdit }) => {
  const [values, setValues] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uid = useId();

  const sections = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const f of fields) {
      if (f.listOnly || f.hidden) continue;
      const key = f.section ?? '';
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return [...map.entries()];
  }, [fields]);

  const set = (key: string, v: string | boolean) =>
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      const patch = onFieldChange?.(key, v, next);
      return patch ? { ...next, ...patch } : next;
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };

  /** Long forms (ใบสั่ง/สัญญา) open wide with four columns so there is less scrolling */
  const wide = fields.length > 12;

  const warningList = canEdit ? (warnings?.(values) ?? []) : [];
  const missing = fields.find((f) => f.required && typeof values[f.key] === 'string' && !(values[f.key] as string).trim());

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`fixed z-[90] inset-x-0 bottom-0 pb-safe sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 flex max-h-[92dvh] w-full ${wide ? 'sm:w-[calc(100%-2rem)] sm:max-w-7xl' : 'sm:max-w-3xl'} flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[var(--pf-surface)] shadow-2xl ring-1 ring-slate-200 dark:ring-white/10`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 px-5 py-4">
            <Dialog.Title className="font-prompt text-base font-bold text-ink">
              {isNew ? `เพิ่ม${title}` : canEdit ? `แก้ไข${title}` : `รายละเอียด${title}`}
            </Dialog.Title>
            <Dialog.Close
              disabled={busy}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] cursor-pointer"
              aria-label="ปิด"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canEdit || missing) return;
              void run(async () => {
                await onSave(values);
              });
            }}
          >
            <div className={`flex-1 overflow-y-auto px-5 ${wide ? 'space-y-4 py-4' : 'space-y-6 py-5'}`}>
              {!canEdit && <ReadOnlyView sections={sections} values={values} wide={wide} />}
              {canEdit && sections.map(([section, list]) => (
                <fieldset key={section} className="min-w-0">
                  {section && <legend className="mb-3 font-prompt text-sm font-semibold text-ink">{section}</legend>}
                  <div className={wide ? 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
                    {list.map((f) => {
                      const id = `${uid}-${f.key}`;
                      const v = values[f.key];
                      return (
                        <div key={f.key} className={f.type === 'textarea' && wide ? 'sm:col-span-2 lg:col-span-4' : f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                          {f.type === 'checkbox' ? (
                            <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium text-ink-2">
                              <input
                                type="checkbox"
                                checked={Boolean(v)}
                                disabled={!canEdit}
                                onChange={(e) => set(f.key, e.target.checked)}
                                className="h-5 w-5 rounded border-slate-300 accent-[var(--brand-strong,#1d4ed8)]"
                              />
                              {f.label}
                            </label>
                          ) : (
                            <>
                              <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-3">
                                {f.label}
                                {f.required && <span className="text-rose-600"> *</span>}
                              </label>
                              {f.type === 'textarea' ? (
                                <textarea
                                  id={id}
                                  rows={wide ? 2 : 3}
                                  value={String(v ?? '')}
                                  disabled={!canEdit}
                                  onChange={(e) => set(f.key, e.target.value)}
                                  className={inputCls}
                                />
                              ) : f.type === 'link' ? (
                                <LinkPicker
                                  id={id}
                                  value={String(v ?? '')}
                                  disabled={!canEdit}
                                  onChange={(ref) => setValues((prev) => ({ ...prev, [f.key]: ref, ...(f.linkRole ? { link_role: ref ? String(prev.link_role || 'invoice') : '' } : {}) }))}
                                  role={f.linkRole ? String(values.link_role ?? '') : undefined}
                                  onRoleChange={f.linkRole ? (role) => setValues((prev) => ({ ...prev, link_role: role })) : undefined}
                                  hint={{
                                    vendor: String(values.from_name ?? values.vendor_name ?? '') || null,
                                    projectNo: String(values.project_no ?? '') || null,
                                    text: [values.subject, values.title, values.contract_ref, values.project].filter((x) => typeof x === 'string').join(' ') || null,
                                  }}
                                />
                              ) : f.type === 'incoming' ? (
                                <IncomingPicker
                                  id={id}
                                  value={String(v ?? '')}
                                  disabled={!canEdit}
                                  onPick={(doc) =>
                                    setValues((prev) => {
                                      if (!doc) return { ...prev, [f.key]: '' };
                                      // Fill the matter's details from the letter, but never overwrite what was typed
                                      const empty = (k: string) => typeof prev[k] !== 'string' || !(prev[k] as string).trim();
                                      const next: FormValues = { ...prev, [f.key]: String(doc.id) };
                                      if (doc.subject && 'job_title' in prev && empty('job_title')) next.job_title = doc.subject;
                                      if (doc.doc_date && 'received_date' in prev && empty('received_date')) next.received_date = doc.doc_date.slice(0, 10);
                                      if (doc.amount !== null && 'budget_amount' in prev && empty('budget_amount')) next.budget_amount = String(doc.amount);
                                      if (doc.amount !== null && 'agreed_price' in prev && empty('agreed_price')) next.agreed_price = String(doc.amount);
                                      if (doc.amount !== null && 'median_price' in prev && empty('median_price')) next.median_price = String(doc.amount);
                                      if (doc.from_name && 'vendor_name' in prev && empty('vendor_name')) next.vendor_name = doc.from_name;
                                      return next;
                                    })
                                  }
                                />
                              ) : f.type === 'date' ? (
                                <ThaiDatePicker id={id} value={String(v ?? '')} disabled={!canEdit} onChange={(iso) => set(f.key, iso)} />
                              ) : f.options ? (
                                <ComboInput
                                  id={id}
                                  inputMode={f.inputMode}
                                  value={String(v ?? '')}
                                  options={lookups?.[f.options] ?? []}
                                  placeholder={f.placeholder}
                                  disabled={!canEdit}
                                  onChange={(s) => set(f.key, s)}
                                  className={inputCls}
                                />
                              ) : (
                                <input
                                  id={id}
                                  type="text"
                                  inputMode={f.inputMode}
                                  value={String(v ?? '')}
                                  placeholder={f.placeholder}
                                  disabled={!canEdit}
                                  onChange={(e) => set(f.key, e.target.value)}
                                  className={`${inputCls} ${f.align === 'right' ? 'text-right tabular-nums' : ''}`}
                                />
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              {children}
            </div>

            {warningList.length > 0 && (
              <ul role="status" className="mx-5 mb-3 space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
                {warningList.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 dark:border-white/10 px-5 py-4">
              {error && (
                <p role="alert" className="mr-auto text-sm font-medium text-rose-700 dark:text-rose-300">
                  {error}
                </p>
              )}
              {!error && missing && canEdit && <p className="mr-auto text-sm text-ink-4">กรุณากรอก “{missing.label}”</p>}
              {!error && !missing && <span className="mr-auto" />}

              {!isNew && canDelete && onDelete && (
                confirmDelete ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(onDelete)}
                    className="min-h-[44px] rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                  >
                    ยืนยันลบรายการนี้
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" /> ลบ
                  </button>
                )
              )}
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:text-slate-200 dark:hover:bg-[var(--pf-hover)] cursor-pointer"
              >
                {canEdit ? 'ยกเลิก' : 'ปิด'}
              </button>
              {!canEdit && onEdit && (
                <button type="button" onClick={onEdit} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold cursor-pointer">
                  <Pencil className="h-4 w-4" /> แก้ไข
                </button>
              )}
              {canEdit && (
                <button
                  type="submit"
                  disabled={busy || Boolean(missing)}
                  className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  บันทึก
                </button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
