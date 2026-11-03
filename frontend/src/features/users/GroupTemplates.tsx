import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Pencil, Trash2, X } from 'lucide-react';
import { DataTable, type DataTableColumnMeta } from '../../components/ui/data-table';
import { ROLE_LABELS, type EnterpriseRole } from '../../services/enterpriseService';
import { userAdminApi, type GroupTemplateRow, type MenuDef } from './api';
import { MenuPicker, RolePicker } from './PermissionPickers';

interface Props {
  menus: MenuDef[];
  roles: EnterpriseRole[];
  onNotice: (kind: 'success' | 'error', message: string) => void;
  /** Called after members' access changed, so the user list can reload */
  onUsersChanged: () => void;
}

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

// ---------------------------------------------------------------------------
// Editor for one group's template
// ---------------------------------------------------------------------------

const TemplateEditor: React.FC<{
  row: GroupTemplateRow;
  menus: MenuDef[];
  roles: EnterpriseRole[];
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ row, menus, roles, onClose, onSaved }) => {
  const t = row.template;
  const [role, setRole] = useState<EnterpriseRole>(t?.role ?? 'Staff');
  const [picked, setPicked] = useState<Set<string>>(new Set(t?.menus ?? []));
  const [autoApply, setAutoApply] = useState(t?.autoApply ?? false);
  const [applyNow, setApplyNow] = useState(false);
  const [enableNow, setEnableNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await userAdminApi.saveTemplate({ groupName: row.groupName, role, menus: [...picked], autoApply });
      let message = 'บันทึกเทมเพลตแล้ว';
      if (applyNow) {
        const r = await userAdminApi.applyTemplate(row.groupName, enableNow);
        message = `บันทึกเทมเพลตและใช้กับสมาชิก ${r.updated.toLocaleString('th-TH')} คนแล้ว`;
      }
      onSaved(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="min-w-0">
                <Dialog.Title className="font-prompt text-lg font-bold text-ink">เทมเพลตสิทธิ์: {row.groupName}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-ink-3">
                  สมาชิกที่ใช้งานอยู่ใน HOSxP {row.active.toLocaleString('th-TH')} คน · ใช้เป็นต้นแบบเมื่อกำหนดสิทธิ์ให้คนในกลุ่มนี้
                </Dialog.Description>
              </div>
              <button type="button" onClick={onClose} disabled={busy} aria-label="ปิด" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <legend className="px-1 text-sm font-semibold text-ink">ระดับสิทธิ์</legend>
                <RolePicker roles={roles} value={role} onChange={setRole} />
              </fieldset>

              <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <legend className="px-1 text-sm font-semibold text-ink">เมนูที่มองเห็น</legend>
                <MenuPicker menus={menus} picked={picked} onChange={setPicked} isAdmin={role === 'Admin'} />
              </fieldset>

              <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <legend className="px-1 text-sm font-semibold text-ink">การใช้เทมเพลต</legend>
                <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                  <input type="checkbox" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-strong,#1d4ed8)]" />
                  <span>
                    <span className="font-semibold">ใช้กับสมาชิกที่มีอยู่ตอนนี้ ({row.active.toLocaleString('th-TH')} คน)</span>
                    <span className="block text-xs text-ink-4">คัดลอกระดับสิทธิ์และเมนูไปทับของแต่ละคน (แก้รายคนทีหลังได้) ไม่รวมบัญชีที่ปิดใน HOSxP</span>
                  </span>
                </label>
                {applyNow && (
                  <label className="ml-7 flex cursor-pointer items-start gap-3 text-sm text-ink">
                    <input type="checkbox" checked={enableNow} onChange={(e) => setEnableNow(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-strong,#1d4ed8)]" />
                    <span>
                      <span className="font-semibold">และอนุญาตให้เข้าระบบพัสดุด้วย</span>
                      <span className="block text-xs text-ink-4">ถ้าไม่ติ๊ก จะตั้งสิทธิ์และเมนูให้ แต่ยังเข้าระบบไม่ได้จนกว่าจะเปิดให้</span>
                    </span>
                  </label>
                )}
                <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                  <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-strong,#1d4ed8)]" />
                  <span>
                    <span className="font-semibold">ผู้ใช้ใหม่ในกลุ่มนี้ได้สิทธิ์ตามเทมเพลตอัตโนมัติ</span>
                    <span className="block text-xs text-ink-4">เมื่อซิงก์พบคนใหม่ในกลุ่มนี้จะเปิดให้เข้าระบบทันที (ปิดไว้ = ต้องเปิดสิทธิ์เองทีละคน ปลอดภัยกว่า)</span>
                  </span>
                </label>
              </fieldset>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-4 dark:border-white/10">
              {error ? <p role="alert" className="mr-auto text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p> : <span className="mr-auto" />}
              <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer">
                ยกเลิก
              </button>
              <button type="submit" disabled={busy} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:opacity-50 cursor-pointer">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                บันทึกเทมเพลต
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

// ---------------------------------------------------------------------------
// Panel: one row per HOSxP user group
// ---------------------------------------------------------------------------

export const GroupTemplates: React.FC<Props> = ({ menus, roles, onNotice, onUsersChanged }) => {
  const [rows, setRows] = useState<GroupTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GroupTemplateRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await userAdminApi.templates());
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'โหลดเทมเพลตไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const menuLabel = useMemo(() => new Map(menus.map((m) => [m.id, m.label])), [menus]);

  const remove = async (row: GroupTemplateRow) => {
    try {
      await userAdminApi.deleteTemplate(row.groupName);
      onNotice('success', `ลบเทมเพลตของกลุ่ม ${row.groupName} แล้ว (สิทธิ์ของสมาชิกไม่เปลี่ยน)`);
      await load();
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    }
  };

  const columns = useMemo<ColumnDef<GroupTemplateRow, unknown>[]>(() => {
    const col = (id: string, header: string, accessor: (r: GroupTemplateRow) => string | number | undefined, render?: (r: GroupTemplateRow) => React.ReactNode, meta?: DataTableColumnMeta): ColumnDef<GroupTemplateRow, unknown> => ({
      id,
      header,
      accessorFn: accessor,
      sortUndefined: 'last',
      meta: { label: header, ...meta } satisfies DataTableColumnMeta,
      cell: ({ row }) => (render ? render(row.original) : (accessor(row.original) ?? '')),
    });
    return [
      col('groupName', 'กลุ่มผู้ใช้ (HOSxP)', (r) => r.groupName, (r) => <span className="font-semibold">{r.groupName}</span>, { wide: true }),
      col('active', 'สมาชิก (ใช้งานอยู่)', (r) => r.active, (r) => r.active.toLocaleString('th-TH'), { align: 'right' }),
      col('enabled', 'เข้าระบบพัสดุได้', (r) => r.enabled, (r) => r.enabled.toLocaleString('th-TH'), { align: 'right' }),
      col('role', 'ระดับสิทธิ์ในเทมเพลต', (r) => (r.template ? ROLE_LABELS[r.template.role] : undefined), (r) => (r.template ? ROLE_LABELS[r.template.role] : <span className="text-slate-500">ยังไม่ได้ตั้ง</span>), { nowrap: true }),
      col('menus', 'เมนูในเทมเพลต', (r) => (r.template ? (r.template.role === 'Admin' ? 99 : r.template.menus.length) : undefined), (r) =>
        r.template ? (
          r.template.role === 'Admin' ? 'ทั้งหมด' : r.template.menus.length === 0 ? '–' : (
            <span title={r.template.menus.map((id) => menuLabel.get(id) ?? id).join(', ')}>{r.template.menus.length} เมนู</span>
          )
        ) : (
          ''
        ), { nowrap: true }),
      col('autoApply', 'ผู้ใช้ใหม่ได้สิทธิ์อัตโนมัติ', (r) => (r.template?.autoApply ? 1 : 0), (r) => (r.template ? (r.template.autoApply ? 'เปิด' : 'ปิด') : ''), { nowrap: true }),
      col('updatedAt', 'แก้ไขล่าสุด', (r) => r.template?.updatedAt, (r) => (r.template ? dateTime(r.template.updatedAt) : ''), { nowrap: true }),
    ];
  }, [menuLabel]);

  return (
    <>
      <p className="text-sm text-ink-3">
        ตั้งระดับสิทธิ์และเมนูต้นแบบให้แต่ละกลุ่มผู้ใช้ จากนั้นกด "ใช้กับสมาชิก" หรือเลือกเทมเพลตตอนกำหนดสิทธิ์รายคน เทมเพลตเป็นการคัดลอกให้ตอนใช้ ไม่ผูกติดกับผู้ใช้ตลอดไป
      </p>
      <DataTable
        ariaLabel="เทมเพลตสิทธิ์ตามกลุ่มผู้ใช้"
        storageKey="users-group-templates"
        data={rows}
        columns={columns}
        loading={loading}
        emptyText="ยังไม่มีกลุ่มผู้ใช้ กดซิงก์จาก HOSxP เพื่อดึงรายชื่อ"
        pageSizes={[25, 50, 100]}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => (
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => setEditing(r)} title="แก้ไขเทมเพลต" aria-label={`แก้ไขเทมเพลต ${r.groupName}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer">
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            {r.template && (
              <>
                <button type="button" onClick={() => void remove(r)} title="ลบเทมเพลต" aria-label={`ลบเทมเพลต ${r.groupName}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      />
      {editing && (
        <TemplateEditor
          key={editing.groupName}
          row={editing}
          menus={menus}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            onNotice('success', message);
            onUsersChanged();
            void load();
          }}
        />
      )}
    </>
  );
};
