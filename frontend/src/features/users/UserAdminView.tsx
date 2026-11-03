import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, DatabaseZap, Loader2, Pencil, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, UserPlus, UserX, X, XCircle } from 'lucide-react';
import { DataTable, type DataTableColumnMeta } from '../../components/ui/data-table';
import { Select } from '../../components/ui/select';
import { ROLE_LABELS, type EnterpriseRole } from '../../services/enterpriseService';
import { userAdminApi, type GroupTemplateRow, type ManagedUser, type MenuDef, type NewMember, type UserAdminMeta, type UserChange } from './api';
import { CreateMemberDialog, PasswordField, passwordProblem } from './MemberDialog';
import { MenuPicker, RolePicker } from './PermissionPickers';
import { GroupTemplates } from './GroupTemplates';
import { Flash, diffRows, useFlashIds, useLiveReload } from '../procure/live';

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '–';

const chip = (tone: 'ok' | 'warn' | 'off' | 'bad' | 'member', text: string) => {
  const tones = {
    member: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
    ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    warn: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    bad: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
    off: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-[var(--pf-head-bg)] dark:text-slate-300 dark:ring-[var(--pf-field-border)]',
  };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>{text}</span>;
};

type AccessFilter = 'all' | 'enabled' | 'disabled';
type HosFilter = 'active' | 'closed' | 'all';

/** Tabs that split people by their HOSxP user group (groupname); the first two are about access in THIS system */
const CATEGORIES: { id: string; label: string; test: (u: ManagedUser) => boolean }[] = [
  { id: 'all', label: 'ทั้งหมด', test: () => true },
  { id: 'appAdmin', label: 'ผู้ดูแลระบบพัสดุ', test: (u) => u.role === 'Admin' },
  { id: 'local', label: 'สมาชิกเพิ่มเอง (ไม่อยู่ใน HOSxP)', test: (u) => u.source === 'local' },
  { id: 'hosAdmin', label: 'ผู้ดูแลระบบ / IT (HOSxP)', test: (u) => /admin|ผู้ดูแลระบบ|เจ้าหน้าที่คอม/i.test(u.groupName ?? '') },
  { id: 'doctor', label: 'แพทย์', test: (u) => /doctor|แพทย์/i.test(u.groupName ?? '') },
  { id: 'nurse', label: 'พยาบาล', test: (u) => /nurse|พยาบาล/i.test(u.groupName ?? '') },
  { id: 'pharmacy', label: 'เภสัชกร', test: (u) => /เภสัช/.test(u.groupName ?? '') },
  { id: 'lab', label: 'ชันสูตร / เอกซเรย์ / กายภาพ', test: (u) => /ชันสูตร|แล็บ|เอกซ์เรย์|กายภาพ/.test(u.groupName ?? '') },
  { id: 'office', label: 'การเงิน / บริหาร / ประกัน', test: (u) => /การเงิน|บริหาร|ประกัน/.test(u.groupName ?? '') },
];
const OTHER_ID = 'other';
const inKnownCategory = (u: ManagedUser) => CATEGORIES.some((c) => c.id !== 'all' && c.id !== 'appAdmin' && c.test(u));

/** Details a member's editor changes besides access (members only: HOSxP people get these from the sync) */
export interface MemberChange {
  profile?: { displayName: string; department: string | null };
  password?: string;
}

interface Notice {
  kind: 'success' | 'error';
  message: string;
}

// ---------------------------------------------------------------------------
// Editor: role, access and the menus a user can see
// ---------------------------------------------------------------------------

interface EditorProps {
  /** One user, or several (bulk: each section is applied only when its box is ticked) */
  targets: ManagedUser[];
  menus: MenuDef[];
  roles: EnterpriseRole[];
  onClose: () => void;
  onSave: (change: UserChange, member?: MemberChange) => Promise<void>;
  /** Members only: remove the account for good */
  onDelete?: () => Promise<void>;
  /** Template of the user's HOSxP group (single-user editing only) */
  groupTemplate?: GroupTemplateRow | null;
}

const UserEditor: React.FC<EditorProps> = ({ targets, menus, roles, onClose, onSave, onDelete, groupTemplate }) => {
  const bulk = targets.length > 1;
  const first = targets[0];
  const member = !bulk && first.source === 'local';
  const [displayName, setDisplayName] = useState(first.displayName ?? '');
  const [department, setDepartment] = useState(first.department ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [enabled, setEnabled] = useState(bulk ? true : first.isEnabled);
  const [role, setRole] = useState<EnterpriseRole>(bulk ? 'Staff' : first.role);
  const [picked, setPicked] = useState<Set<string>>(new Set(bulk ? [] : first.menus));
  const [note, setNote] = useState(bulk ? '' : first.note ?? '');
  const [position, setPosition] = useState(bulk ? '' : first.positionCustom ?? '');
  const [apply, setApply] = useState({ access: !bulk, role: !bulk, menus: !bulk, note: !bulk });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === 'Admin';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const change: UserChange = {};
    if (apply.access) change.isEnabled = enabled;
    if (apply.role) change.role = role;
    if (apply.menus) change.menus = isAdmin ? menus.map((m) => m.id) : [...picked];
    if (apply.note) change.note = note.trim() || null;
    if (!bulk) change.positionCustom = position.trim() || null;
    const extra: MemberChange = {};
    if (member) {
      if (!displayName.trim()) return setError('กรุณากรอกชื่อ-สกุล');
      if (displayName.trim() !== (first.displayName ?? '') || department.trim() !== (first.department ?? '')) {
        extra.profile = { displayName: displayName.trim(), department: department.trim() || null };
      }
      if (newPassword) {
        const problem = passwordProblem(newPassword);
        if (problem) return setError(`รหัสผ่านใหม่: ${problem}`);
        extra.password = newPassword;
      }
    }
    if (Object.keys(change).length === 0) {
      setError('ยังไม่ได้เลือกสิ่งที่จะเปลี่ยน');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(change, member ? extra : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };

  const section = (key: keyof typeof apply, title: string, body: React.ReactNode) => (
    <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <legend className="px-1">
        {bulk ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={apply[key]}
              onChange={(e) => setApply((prev) => ({ ...prev, [key]: e.target.checked }))}
              className="h-4 w-4 accent-[var(--brand-strong,#1d4ed8)]"
            />
            เปลี่ยน{title}
          </label>
        ) : (
          <span className="text-sm font-semibold text-ink">{title}</span>
        )}
      </legend>
      <div className={bulk && !apply[key] ? 'pointer-events-none opacity-40' : undefined}>{body}</div>
    </fieldset>
  );

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="min-w-0">
                <Dialog.Title className="font-prompt text-lg font-bold text-ink">
                  {bulk ? `กำหนดสิทธิ์ ${targets.length.toLocaleString('th-TH')} คน` : member ? 'แก้ไขสมาชิก' : 'กำหนดสิทธิ์ผู้ใช้'}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 truncate text-sm text-ink-3">
                  {bulk ? 'ติ๊กหัวข้อที่ต้องการเปลี่ยน หัวข้อที่ไม่ติ๊กจะไม่ถูกแตะต้อง' : `${first.displayName ?? first.loginName} · ${first.loginName}`}
                </Dialog.Description>
              </div>
              <button type="button" onClick={onClose} disabled={busy} aria-label="ปิด" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {!bulk && first.hosDisabled && (
                <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
                  บัญชีนี้ถูกปิดใน HOSxP จึงเข้าระบบไม่ได้ แม้จะเปิดสิทธิ์ไว้ที่นี่
                </p>
              )}

              {member && (
                <fieldset className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-400/20 dark:bg-violet-500/5">
                  <legend className="px-1 text-sm font-semibold text-ink">ข้อมูลสมาชิก (ไม่อยู่ใน HOSxP)</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="member-name" className="mb-1.5 block text-xs font-semibold text-ink-3">ชื่อ-สกุล <span className="text-rose-600">*</span></label>
                      <input id="member-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={250} className="pf-field w-full min-h-[44px] rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="member-dept" className="mb-1.5 block text-xs font-semibold text-ink-3">กลุ่มงาน/ฝ่าย</label>
                      <input id="member-dept" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={250} placeholder="เช่น การเงิน, พัสดุ" className="pf-field w-full min-h-[44px] rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="member-pw" className="mb-1.5 block text-xs font-semibold text-ink-3">
                        ตั้งรหัสผ่านใหม่ <span className="font-normal text-slate-500">(เว้นว่างถ้าไม่เปลี่ยน{first.passwordChangedAt ? ` · เปลี่ยนล่าสุด ${dateTime(first.passwordChangedAt)}` : ''})</span>
                      </label>
                      <PasswordField id="member-pw" value={newPassword} onChange={setNewPassword} placeholder="ใช้เมื่อสมาชิกลืมรหัสผ่าน" />
                    </div>
                  </div>
                </fieldset>
              )}

              {!bulk && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                  <label htmlFor="user-position" className="text-sm font-semibold text-ink">ตำแหน่ง</label>
                  <input
                    id="user-position"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    maxLength={250}
                    placeholder={member ? 'เช่น นักวิชาการพัสดุปฏิบัติการ' : first.positionName ?? 'ไม่มีข้อมูลตำแหน่งใน HOSxP'}
                    className="pf-field mt-2 w-full min-h-[44px] rounded-lg px-3 py-2 text-sm"
                  />
                  {!member && <p className="mt-1.5 text-xs text-ink-4">
                    ใน HOSxP: {first.positionName ?? 'ไม่มี'} · พิมพ์ตำแหน่งที่ถูกต้องเพื่อแทนที่ (เช่น ระบุระดับ "ปฏิบัติการ") การซิงก์จะไม่ทับค่าที่พิมพ์ไว้
                  </p>}
                </div>
              )}

              {!bulk && groupTemplate?.template && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 text-ink">
                    กลุ่ม <strong>{groupTemplate.groupName}</strong> มีเทมเพลต: {ROLE_LABELS[groupTemplate.template.role]} · {groupTemplate.template.role === 'Admin' ? 'ทุกเมนู' : `${groupTemplate.template.menus.length} เมนู`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRole(groupTemplate.template!.role);
                      setPicked(new Set(groupTemplate.template!.menus));
                    }}
                    className="pf-btn min-h-[40px] rounded-lg px-3 text-sm font-semibold cursor-pointer"
                  >
                    ใช้เทมเพลตนี้
                  </button>
                </div>
              )}

              {section(
                'access',
                'การเข้าใช้งาน',
                <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-[var(--brand-strong,#1d4ed8)]" />
                  <span>
                    <span className="font-semibold">อนุญาตให้เข้าระบบพัสดุ</span>
                    <span className="block text-xs text-ink-4">{member ? 'ล็อกอินด้วยชื่อผู้ใช้และรหัสผ่านที่ตั้งไว้ในระบบนี้' : 'ล็อกอินด้วยรหัสผ่าน HOSxP เดิมของผู้ใช้'}</span>
                  </span>
                </label>
              )}

              {section(
                'role',
                'ระดับสิทธิ์',
                <RolePicker roles={roles} value={role} onChange={setRole} />
              )}

              {section(
                'menus',
                'เมนูที่มองเห็น',
                <MenuPicker menus={menus} picked={picked} onChange={setPicked} isAdmin={isAdmin} />
              )}

              {section(
                'note',
                'หมายเหตุ',
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={255}
                  placeholder="เช่น เจ้าหน้าที่พัสดุ กลุ่มบริหารทั่วไป"
                  aria-label="หมายเหตุ"
                  className="pf-field w-full min-h-[44px] rounded-lg px-3 py-2 text-sm"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-4 dark:border-white/10">
              {error ? <p role="alert" className="mr-auto text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p> : <span className="mr-auto" />}
              {member && onDelete && (
                confirmDelete ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await onDelete();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ');
                        setBusy(false);
                      }
                    }}
                    className="min-h-[44px] rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                  >
                    ยืนยันลบสมาชิก
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer">
                    <Trash2 className="h-4 w-4" aria-hidden /> ลบสมาชิก
                  </button>
                )
              )}
              <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer">
                ยกเลิก
              </button>
              <button type="submit" disabled={busy} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:opacity-50 cursor-pointer">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                บันทึก
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const UserAdminView: React.FC = () => {
  const [meta, setMeta] = useState<UserAdminMeta | null>(null);
  const [templates, setTemplates] = useState<GroupTemplateRow[]>([]);
  const [view, setView] = useState<'users' | 'templates'>('users');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [q, setQ] = useState('');
  const [access, setAccess] = useState<AccessFilter>('all');
  const [hos, setHos] = useState<HosFilter>('active');
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('all');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ManagedUser[] | null>(null);
  const [creating, setCreating] = useState(false);

  const [flashLogins, flash, newLogins] = useFlashIds<string>();
  const lastLoad = React.useRef<Map<string, string> | null>(null);

  /** A quiet reload (live update, save) keeps the table and lights up people who were added or changed */
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      lastLoad.current = null;
    }
    setError(null);
    try {
      const [m, list, tpl] = await Promise.all([userAdminApi.meta(), userAdminApi.list(), userAdminApi.templates()]);
      const { ids, added, map } = diffRows(lastLoad.current ?? new Map<string, string>(), list, (u) => u.loginName);
      if (silent && lastLoad.current && ids.size > 0) flash(ids, added);
      lastLoad.current = map;
      setTemplates(tpl);
      setMeta(m);
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Another admin changed someone's access or synced from HOSxP
  useLiveReload(['users'], () => load(true));

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // Tab counts follow the HOSxP-status filter only, so the numbers do not jump around while searching
  const tabCounts = useMemo(() => {
    const base = users.filter((u) => (hos === 'active' ? !u.hosDisabled : hos === 'closed' ? u.hosDisabled : true));
    const counts: Record<string, number> = { [OTHER_ID]: base.filter((u) => !inKnownCategory(u)).length };
    for (const c of CATEGORIES) counts[c.id] = base.filter(c.test).length;
    return counts;
  }, [users, hos]);

  /** Everything except the category tab, so we can tell the user when a match sits in another tab */
  const matchesFilters = useCallback(
    (u: ManagedUser) => {
      const needle = q.trim().toLowerCase();
      if (access === 'enabled' && !u.isEnabled) return false;
      if (access === 'disabled' && u.isEnabled) return false;
      if (hos === 'active' && u.hosDisabled) return false;
      if (hos === 'closed' && !u.hosDisabled) return false;
      if (group && u.groupName !== group) return false;
      if (!needle) return true;
      return [u.loginName, u.displayName, u.licenseNo, u.groupName, u.doctorCode, u.positionCustom, u.positionName].some((v) => v?.toLowerCase().includes(needle));
    },
    [q, access, hos, group]
  );

  const visible = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.id === category);
    return users.filter((u) => (category === OTHER_ID ? !inKnownCategory(u) : cat ? cat.test(u) : true) && matchesFilters(u));
  }, [users, category, matchesFilters]);

  const inOtherTabs = useMemo(
    () => (category === 'all' || visible.length > 0 ? 0 : users.filter(matchesFilters).length),
    [users, category, visible.length, matchesFilters]
  );

  // Only people still in the list count as selected (a filter may hide ticked ones)
  const selectedUsers = useMemo(() => visible.filter((u) => selected.has(u.loginName)), [visible, selected]);

  const runSync = async () => {
    setSyncing(true);
    try {
      const r = await userAdminApi.sync();
      setNotice({
        kind: 'success',
        message: `ซิงก์จาก HOSxP แล้ว: ผู้ใช้ ${r.usersFetched.toLocaleString('th-TH')} คน (ใหม่ ${r.usersAdded.toLocaleString('th-TH')}) · แพทย์/บุคลากร ${r.doctorsFetched.toLocaleString('th-TH')} รายการ${r.autoGranted > 0 ? ` · ให้สิทธิ์อัตโนมัติตามเทมเพลต ${r.autoGranted.toLocaleString('th-TH')} คน` : ''}`,
      });
      await load(true);
    } catch (e) {
      setNotice({ kind: 'error', message: e instanceof Error ? e.message : 'ซิงก์ไม่สำเร็จ' });
    } finally {
      setSyncing(false);
    }
  };

  const save = async (change: UserChange, member?: MemberChange) => {
    if (!editing) return;
    const logins = editing.map((u) => u.loginName);
    if (member?.profile) await userAdminApi.updateProfile(logins[0], member.profile);
    if (logins.length === 1) await userAdminApi.update(logins[0], change);
    else await userAdminApi.bulk(logins, change);
    if (member?.password) await userAdminApi.setPassword(logins[0], member.password);
    setNotice({
      kind: 'success',
      message: logins.length === 1 ? (member?.password ? 'บันทึกแล้ว และตั้งรหัสผ่านใหม่แล้ว (ส่งรหัสใหม่ให้สมาชิก)' : 'บันทึกแล้ว') : `บันทึกสิทธิ์ ${logins.length.toLocaleString('th-TH')} คนแล้ว`,
    });
    setEditing(null);
    await load(true);
  };

  const removeMember = async (u: ManagedUser) => {
    await userAdminApi.removeMember(u.loginName);
    setNotice({ kind: 'success', message: `ลบสมาชิก ${u.displayName ?? u.loginName} แล้ว` });
    setEditing(null);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(u.loginName);
      return next;
    });
    await load(true);
  };

  const createMember = async (m: NewMember) => {
    await userAdminApi.createMember(m);
    setNotice({ kind: 'success', message: `เพิ่มสมาชิก ${m.displayName} แล้ว · ชื่อผู้ใช้ ${m.loginName}` });
    setCreating(false);
    setCategory('local');
    await load(true);
  };

  const quickToggle = async (isEnabled: boolean) => {
    try {
      const r = await userAdminApi.bulk(selectedUsers.map((u) => u.loginName), { isEnabled });
      setNotice({ kind: 'success', message: `${isEnabled ? 'เปิด' : 'ปิด'}การเข้าใช้งาน ${r.updated.toLocaleString('th-TH')} คนแล้ว` });
      await load(true);
    } catch (e) {
      setNotice({ kind: 'error', message: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    }
  };

  const columns = useMemo<ColumnDef<ManagedUser, unknown>[]>(() => {
    const col = (id: string, header: string, accessor: (u: ManagedUser) => string | number | undefined, render?: (u: ManagedUser) => React.ReactNode, meta?: DataTableColumnMeta): ColumnDef<ManagedUser, unknown> => ({
      id,
      header,
      accessorFn: accessor,
      sortUndefined: 'last',
      meta: { label: header, ...meta } satisfies DataTableColumnMeta,
      cell: ({ row }) => (render ? render(row.original) : (accessor(row.original) ?? '')),
    });
    return [
      col('loginName', 'ชื่อผู้ใช้', (u) => u.loginName, (u) => <span className="font-mono text-[13px]">{u.loginName}</span>, { nowrap: true }),
      col('displayName', 'ชื่อ-สกุล', (u) => u.displayName ?? undefined, undefined, { wide: true }),
      col('position', 'ตำแหน่ง', (u) => u.positionCustom ?? u.positionName ?? undefined, undefined, { wide: true }),
      col('groupName', 'กลุ่มผู้ใช้ (HOSxP)', (u) => (u.source === 'local' ? u.department ?? undefined : u.groupName ?? undefined)),
      col('licenseNo', 'เลขที่ใบประกอบวิชาชีพ', (u) => u.licenseNo ?? undefined, undefined, { nowrap: true }),
      col('hos', 'สถานะใน HOSxP', (u) => (u.hosMissing ? 2 : u.hosDisabled ? 1 : 0), (u) => (u.source === 'local' ? chip('member', 'สมาชิกเพิ่มเอง') : u.hosMissing ? chip('bad', 'ไม่พบใน HOSxP') : u.hosDisabled ? chip('off', 'ปิดบัญชี') : chip('ok', 'ใช้งานอยู่'))),
      col('role', 'ระดับสิทธิ์', (u) => ROLE_LABELS[u.role], undefined, { nowrap: true }),
      col('isEnabled', 'เข้าระบบพัสดุ', (u) => (u.isEnabled ? 1 : 0), (u) => (u.isEnabled ? (u.hosDisabled || u.hosMissing ? chip('warn', 'เปิดไว้ แต่เข้าไม่ได้') : chip('ok', 'อนุญาต')) : chip('off', 'ยังไม่อนุญาต'))),
      col('menuCount', 'เมนู', (u) => (u.role === 'Admin' ? 99 : u.menus.length), (u) => (u.role === 'Admin' ? 'ทั้งหมด' : u.menus.length === 0 ? '–' : `${u.menus.length} เมนู`), { nowrap: true }),
      col('lastLogin', 'เข้าใช้ล่าสุด', (u) => u.lastLogin ?? undefined, (u) => dateTime(u.lastLogin), { nowrap: true }),
    ];
  }, []);

  const sync = meta?.lastSync;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-prompt text-lg font-bold text-ink">จัดการผู้ใช้งาน</h3>
          <p className="mt-1 text-sm text-ink-3">ผู้ใช้ซิงก์มาจาก HOSxP (opduser, doctor) และสมาชิกที่เพิ่มเอง · กำหนดว่าใครเข้าระบบพัสดุได้และเห็นเมนูไหน</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!meta}
          className="pf-btn inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 cursor-pointer"
        >
          <UserPlus className="h-4 w-4" aria-hidden /> เพิ่มสมาชิก
        </button>
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={syncing || !meta?.hosConfigured}
          className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 cursor-pointer"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          {syncing ? 'กำลังซิงก์...' : 'ซิงก์จาก HOSxP'}
        </button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-0">
        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ring-1 ${
              notice.kind === 'success'
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20'
                : 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20'
            }`}
          >
            {notice.kind === 'success' ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
            {notice.message}
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="min-h-[40px] rounded-lg px-3 font-semibold underline cursor-pointer">ลองใหม่</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="gov-card px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> ผู้ใช้ทั้งหมด</p>
          <p className="mt-0.5 font-prompt text-xl font-bold tabular-nums text-ink"><Flash value={meta?.counts.total ?? 0} format={(n) => Math.round(n).toLocaleString('th-TH')} /></p>
          <p className="mt-0.5 text-xs text-ink-4">สมาชิกเพิ่มเอง {(meta?.counts.local ?? 0).toLocaleString('th-TH')} · ปิดบัญชีใน HOSxP {(meta?.counts.hosDisabled ?? 0).toLocaleString('th-TH')}</p>
        </div>
        <div className="gov-card px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3"><UserCheck className="h-3.5 w-3.5" aria-hidden /> อนุญาตให้เข้าระบบพัสดุ</p>
          <p className="mt-0.5 font-prompt text-xl font-bold tabular-nums text-ink"><Flash value={meta?.counts.enabled ?? 0} format={(n) => Math.round(n).toLocaleString('th-TH')} /></p>
          <p className="mt-0.5 text-xs text-ink-4">ผู้ใช้ใหม่จะไม่มีสิทธิ์จนกว่าจะเปิดให้</p>
        </div>
        <div className="gov-card px-4 py-3 lg:col-span-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-3"><DatabaseZap className="h-3.5 w-3.5" aria-hidden /> ซิงก์ล่าสุด</p>
          {!meta?.hosConfigured ? (
            <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-300">ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP (HOS_DB_* ใน backend/.env)</p>
          ) : sync ? (
            <>
              <p className="mt-0.5 text-sm font-semibold text-ink">
                {dateTime(sync.finishedAt ?? sync.startedAt)} · โดย {sync.runBy ?? '–'}{' '}
                {sync.status === 'error' ? chip('bad', 'ไม่สำเร็จ') : sync.status === 'running' ? chip('warn', 'กำลังทำงาน') : chip('ok', 'สำเร็จ')}
              </p>
              <p className="mt-0.5 text-xs text-ink-4">
                {sync.status === 'error'
                  ? sync.message
                  : `ผู้ใช้ ${(sync.usersFetched ?? 0).toLocaleString('th-TH')} คน (ใหม่ ${(sync.usersAdded ?? 0).toLocaleString('th-TH')}) · แพทย์/บุคลากร ${(sync.doctorsFetched ?? 0).toLocaleString('th-TH')} รายการ`}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-3">ยังไม่เคยซิงก์ กดปุ่ม "ซิงก์จาก HOSxP" เพื่อดึงรายชื่อ</p>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="มุมมอง" className="flex gap-2 border-b border-slate-200 dark:border-white/10">
        {([['users', 'รายชื่อผู้ใช้'], ['templates', 'เทมเพลตสิทธิ์ตามกลุ่ม']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`-mb-px min-h-[44px] border-b-2 px-4 text-sm font-semibold transition-colors cursor-pointer ${
              view === id ? 'border-[var(--brand-strong)] text-ink' : 'border-transparent text-slate-600 hover:text-ink dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'templates' && meta && (
        <GroupTemplates menus={meta.menus} roles={meta.roles} onNotice={(kind, message) => setNotice({ kind, message })} onUsersChanged={() => void load()} />
      )}

      {view === 'users' && inOtherTabs > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
          ไม่พบในแท็บนี้ แต่พบ {inOtherTabs.toLocaleString('th-TH')} รายการในแท็บอื่น
          <button type="button" onClick={() => setCategory('all')} className="min-h-[36px] rounded-lg px-3 font-semibold underline cursor-pointer">
            ดูในแท็บ "ทั้งหมด"
          </button>
        </div>
      )}

      {view === 'users' && (
      <DataTable
        ariaLabel="รายชื่อผู้ใช้งาน"
        storageKey="users-admin"
        data={visible}
        columns={columns}
        loading={loading}
        emptyText={users.length === 0 ? 'ยังไม่มีผู้ใช้ กดซิงก์จาก HOSxP เพื่อดึงรายชื่อ' : 'ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข'}
        selection={{ getRowKey: (u) => u.loginName, selected, onChange: setSelected }}
        rowActions={(u) => (
          <button type="button" onClick={() => setEditing([u])} title={u.source === 'local' ? 'แก้ไขสมาชิก' : 'กำหนดสิทธิ์'} aria-label={`กำหนดสิทธิ์ ${u.loginName}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer">
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        )}
        onRowClick={(u) => setEditing([u])}
        rowClassName={(u) =>
          [u.hosDisabled || u.hosMissing ? 'opacity-70' : '', newLogins.has(u.loginName) ? 'row-new' : flashLogins.has(u.loginName) ? 'row-flash' : ''].filter(Boolean).join(' ') || undefined
        }
        toolbar={
          <>
            <div className="relative flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อ ชื่อผู้ใช้ เลขที่ใบประกอบวิชาชีพ..."
                aria-label="ค้นหาผู้ใช้"
                className="pf-field w-full min-h-[40px] rounded-lg py-2 pl-9 pr-3 text-sm"
              />
            </div>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-soft px-3 py-1 text-sm font-semibold sm:ml-auto" role="status">
                เลือกแล้ว {selectedUsers.length.toLocaleString('th-TH')} คน
                <button type="button" onClick={() => setSelected(new Set())} className="inline-flex min-h-[32px] items-center gap-1 rounded px-2 text-xs underline cursor-pointer">
                  <X className="h-3.5 w-3.5" aria-hidden /> ยกเลิก
                </button>
                <button type="button" onClick={() => setEditing(selectedUsers)} className="btn-brand inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold cursor-pointer">
                  <Pencil className="h-4 w-4" aria-hidden /> กำหนดสิทธิ์
                </button>
                <button type="button" onClick={() => void quickToggle(true)} className="pf-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold cursor-pointer">
                  <UserCheck className="h-4 w-4" aria-hidden /> เปิดให้ใช้
                </button>
                <button type="button" onClick={() => void quickToggle(false)} className="pf-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold cursor-pointer">
                  <UserX className="h-4 w-4" aria-hidden /> ปิดการใช้
                </button>
              </div>
            )}
          </>
        }
        filters={
          <div className="space-y-3">
          <div role="tablist" aria-label="หมวดกลุ่มผู้ใช้" className="flex flex-wrap gap-2">
            {[...CATEGORIES, { id: OTHER_ID, label: 'อื่น ๆ' }].map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(c.id)}
                  className={`min-h-[40px] rounded-full px-4 text-sm font-semibold ring-1 transition-colors cursor-pointer ${
                    active
                      ? 'bg-brand-soft text-brand ring-current'
                      : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-[var(--pf-surface)] dark:text-slate-300 dark:ring-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)]'
                  }`}
                >
                  {c.label} <span className="tabular-nums">({(tabCounts[c.id] ?? 0).toLocaleString('th-TH')})</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-3">
            <div className="flex items-center gap-2">
              การเข้าระบบพัสดุ
              <Select
                value={access}
                onValueChange={(v) => setAccess(v as AccessFilter)}
                options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'enabled', label: 'อนุญาตแล้ว' }, { value: 'disabled', label: 'ยังไม่อนุญาต' }]}
                ariaLabel="กรองตามการเข้าระบบ"
              />
            </div>
            <div className="flex items-center gap-2">
              บัญชีใน HOSxP
              <Select
                value={hos}
                onValueChange={(v) => setHos(v as HosFilter)}
                options={[{ value: 'active', label: 'ใช้งานอยู่' }, { value: 'closed', label: 'ปิดบัญชีแล้ว' }, { value: 'all', label: 'ทั้งหมด' }]}
                ariaLabel="กรองตามสถานะใน HOSxP"
              />
            </div>
            <div className="flex items-center gap-2">
              กลุ่มผู้ใช้
              <Select
                value={group}
                onValueChange={setGroup}
                options={[{ value: '', label: 'ทั้งหมด' }, ...(meta?.groups ?? []).map((g) => ({ value: g.name, label: `${g.name} (${g.count})` }))]}
                ariaLabel="กรองตามกลุ่มผู้ใช้"
                className="max-w-[16rem]"
              />
            </div>
          </div>
          </div>
        }
      />
      )}

      {editing && meta && (
        <UserEditor key={editing.map((u) => u.loginName).join(',')} targets={editing} menus={meta.menus} roles={meta.roles} groupTemplate={editing.length === 1 ? templates.find((t) => t.groupName === editing[0].groupName) ?? null : null} onClose={() => setEditing(null)} onSave={save} onDelete={editing.length === 1 && editing[0].source === 'local' ? () => removeMember(editing[0]) : undefined} />
      )}
      {creating && meta && <CreateMemberDialog menus={meta.menus} roles={meta.roles} onClose={() => setCreating(false)} onCreate={createMember} />}
    </div>
  );
};
