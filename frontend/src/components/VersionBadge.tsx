import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, ExternalLink, GitBranch, X } from 'lucide-react';
import { CHANGELOG, type ReleaseKind } from '../data/changelog';

const KIND_LABEL: Record<ReleaseKind, string> = {
  major: 'Major Release',
  minor: 'Minor Release',
  patch: 'Patch Release',
};

const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

const ACK_KEY = 'his_egov_ack_version';

const readAcknowledged = (): string | null => {
  try {
    return localStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
};

const saveAcknowledged = (version: string): void => {
  try {
    localStorage.setItem(ACK_KEY, version);
  } catch {
    /* storage unavailable: the notice simply shows again next time */
  }
};

const releaseUrl = (version: string): string | null =>
  __APP_REPO_URL__ ? `${__APP_REPO_URL__}/releases/tag/v${version}` : null;

/**
 * Pill showing the running version; opens the release history.
 * With `announce`, the dialog also opens by itself once per device after a new version is deployed,
 * until the user presses "รับทราบแล้ว".
 */
export const VersionBadge: React.FC<{ announce?: boolean }> = ({ announce = false }) => {
  const [open, setOpen] = useState(() => announce && readAcknowledged() !== __APP_VERSION__);
  const [selected, setSelected] = useState(__APP_VERSION__);
  const current = CHANGELOG.find((r) => r.version === selected) ?? CHANGELOG[0];
  const url = current ? releaseUrl(current.version) : null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title="ดูบันทึกการอัปเดตระบบ"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--brand-primary)] px-2.5 py-1 text-xs font-semibold text-white cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
        >
          v{__APP_VERSION__}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex w-[calc(100vw-2rem)] max-w-3xl max-h-[88dvh] flex-col overflow-hidden rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-chroma-subtle p-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
                <GitBranch className="h-5 w-5 text-brand" aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-ink">บันทึกการอัปเดตระบบ</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-4">
                  ระบบงานพัสดุ · ทุกเวอร์ชัน ({CHANGELOG.length} รุ่น) · เวอร์ชันปัจจุบัน v{__APP_VERSION__}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink-2 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <ul className="max-h-40 shrink-0 space-y-1.5 overflow-y-auto border-b border-chroma-subtle p-3 sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r" aria-label="รายการเวอร์ชัน">
              {CHANGELOG.map((r) => {
                const active = r.version === current?.version;
                return (
                  <li key={r.version}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.version)}
                      aria-current={active ? 'true' : undefined}
                      className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active ? 'border-[var(--brand-accent)] bg-brand-soft' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink">v{r.version}</span>
                        {r.version === CHANGELOG[0].version && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">ล่าสุด</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-4">{formatDate(r.date)}</span>
                      <span className="block truncate text-xs text-ink-3">{r.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {current && (
              <div className="min-w-0 flex-1 overflow-y-auto p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">
                      v{current.version} · {current.title}
                    </h3>
                    <p className="mt-1 text-sm text-ink-4">
                      เผยแพร่เมื่อ {formatDate(current.date)} · {KIND_LABEL[current.kind]}
                    </p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-chroma-subtle px-3 text-sm font-medium text-ink-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      Release v{current.version} บน GitHub
                    </a>
                  )}
                </div>
                <ul className="mt-5 space-y-2.5">
                  {current.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 rounded-xl border border-chroma-subtle px-3.5 py-3 text-sm leading-relaxed text-ink-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-chroma-subtle p-4">
            <Dialog.Close asChild>
              <button type="button" onClick={() => saveAcknowledged(__APP_VERSION__)} className="btn-brand min-h-[46px] cursor-pointer rounded-lg px-6 text-sm font-semibold">
                รับทราบแล้ว
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
