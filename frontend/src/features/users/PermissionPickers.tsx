import React, { useMemo } from 'react';
import { ROLE_LABELS, type EnterpriseRole } from '../../services/enterpriseService';
import type { MenuDef } from './api';

export const ROLE_HELP: Record<EnterpriseRole, string> = {
  Admin: 'ทำได้ทุกอย่าง รวมถึงจัดการผู้ใช้ เห็นทุกเมนูโดยอัตโนมัติ',
  Doctor: 'ดู เพิ่ม และแก้ไขข้อมูลได้ แต่ลบไม่ได้ เห็นเลขผู้เสียภาษีเต็ม',
  Staff: 'ดูข้อมูลได้อย่างเดียว เลขผู้เสียภาษีถูกปิดบัง',
};

/** Three cards: pick one access level */
export const RolePicker: React.FC<{ roles: EnterpriseRole[]; value: EnterpriseRole; onChange: (role: EnterpriseRole) => void }> = ({ roles, value, onChange }) => (
  <div role="radiogroup" aria-label="ระดับสิทธิ์" className="grid gap-2 sm:grid-cols-3">
    {roles.map((r) => (
      <button
        key={r}
        type="button"
        role="radio"
        aria-checked={value === r}
        onClick={() => onChange(r)}
        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors cursor-pointer ${
          value === r ? 'border-[var(--brand-strong)] bg-brand-soft ring-1 ring-[var(--brand-strong)]' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'
        }`}
      >
        <span className="text-sm font-bold text-ink">{ROLE_LABELS[r]}</span>
        <span className="mt-1 text-xs leading-snug text-ink-3">{ROLE_HELP[r]}</span>
      </button>
    ))}
  </div>
);

/** Tick which menus are visible, grouped (งานพัสดุ / ระบบ). Admins always see everything, so the boxes are locked. */
export const MenuPicker: React.FC<{ menus: MenuDef[]; picked: ReadonlySet<string>; onChange: (next: Set<string>) => void; isAdmin: boolean }> = ({ menus, picked, onChange, isAdmin }) => {
  const groups = useMemo(() => {
    const map = new Map<string, MenuDef[]>();
    for (const m of menus) map.set(m.group, [...(map.get(m.group) ?? []), m]);
    return [...map.entries()];
  }, [menus]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {isAdmin && <p className="text-xs font-medium text-ink-3">ผู้ดูแลระบบเห็นทุกเมนูเสมอ (รวมถึงจัดการผู้ใช้)</p>}
      {groups.map(([group, items]) => (
        <div key={group}>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-4">{group}</p>
            {!isAdmin && (
              <div className="flex gap-3 text-xs font-semibold">
                <button type="button" className="underline cursor-pointer" onClick={() => onChange(new Set([...picked, ...items.map((i) => i.id)]))}>
                  เลือกทั้งหมด
                </button>
                <button type="button" className="underline cursor-pointer" onClick={() => onChange(new Set([...picked].filter((id) => !items.some((i) => i.id === id))))}>
                  ล้าง
                </button>
              </div>
            )}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {items.map((m) => (
              <label key={m.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5">
                <input type="checkbox" checked={isAdmin || picked.has(m.id)} disabled={isAdmin} onChange={() => toggle(m.id)} className="h-4 w-4 accent-[var(--brand-strong,#1d4ed8)]" />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
