import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, Eye, EyeOff, Loader2, Shuffle, UserPlus, X } from 'lucide-react';
import type { EnterpriseRole } from '../../services/enterpriseService';
import type { MenuDef, NewMember } from './api';
import { MenuPicker, RolePicker } from './PermissionPickers';

/** 10 characters, always with letters and digits; no look-alikes (0/O, 1/l/I) so it can be read out or copied by hand */
export function generatePassword(): string {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  for (;;) {
    const p = Array.from({ length: 10 }, () => pick(all)).join('');
    if (/[A-Za-z]/.test(p) && /[0-9]/.test(p)) return p;
  }
}

/** Same rule as the server: 8+ characters with a letter and a digit */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'อย่างน้อย 8 ตัวอักษร';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'ต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข';
  return null;
}

const field = 'pf-field w-full min-h-[44px] rounded-lg px-3 py-2 text-sm';
const labelCls = 'mb-1.5 block text-xs font-semibold text-ink-3';

/** Password box with show/hide, "generate" and "copy" (the admin passes the password on to the member) */
export const PasswordField: React.FC<{ id: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string }> = ({ id, value, onChange, required, placeholder }) => {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const problem = value ? passwordProblem(value) : null;
  const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] dark:hover:text-white cursor-pointer';
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-hint`}
          className={`${field} pr-32 font-mono`}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <button type="button" onClick={() => setShow((s) => !s)} title={show ? 'ซ่อนรหัส' : 'แสดงรหัส'} aria-label={show ? 'ซ่อนรหัส' : 'แสดงรหัส'} className={btn}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            type="button"
            disabled={!value}
            onClick={() => {
              void navigator.clipboard?.writeText(value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            title="คัดลอก"
            aria-label="คัดลอกรหัสผ่าน"
            className={btn}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => { onChange(generatePassword()); setShow(true); }} title="สุ่มรหัสผ่าน" aria-label="สุ่มรหัสผ่าน" className={btn}>
            <Shuffle className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p id={`${id}-hint`} className={`mt-1 text-xs ${problem ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-ink-4'}`}>
        {problem ?? 'อย่างน้อย 8 ตัวอักษร มีตัวอักษรภาษาอังกฤษและตัวเลข · กดสุ่มแล้วคัดลอกส่งให้สมาชิก'}
      </p>
    </div>
  );
};

interface Props {
  menus: MenuDef[];
  roles: EnterpriseRole[];
  onClose: () => void;
  onCreate: (member: NewMember) => Promise<void>;
}

/** Add a person who is not in HOSxP (e.g. finance, procurement staff): they sign in with the password set here */
export const CreateMemberDialog: React.FC<Props> = ({ menus, roles, onClose, onCreate }) => {
  const [loginName, setLoginName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState(generatePassword);
  const [role, setRole] = useState<EnterpriseRole>('Staff');
  const [picked, setPicked] = useState<Set<string>>(new Set(['orders', 'contracts']));
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginOk = /^[A-Za-z0-9._-]{3,50}$/.test(loginName.trim());
  const ready = loginOk && displayName.trim() !== '' && !passwordProblem(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        loginName: loginName.trim(),
        displayName: displayName.trim(),
        positionCustom: position.trim() || null,
        department: department.trim() || null,
        password,
        role,
        menus: role === 'Admin' ? menus.map((m) => m.id) : [...picked],
        isEnabled: enabled,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white" aria-hidden>
                  <UserPlus className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="font-prompt text-lg font-bold text-ink">เพิ่มสมาชิก</Dialog.Title>
                  <Dialog.Description className="text-sm text-ink-3">สำหรับเจ้าหน้าที่ที่ไม่มีบัญชีใน HOSxP เช่น การเงิน พัสดุ · เข้าระบบด้วยรหัสผ่านที่ตั้งที่นี่</Dialog.Description>
                </div>
              </div>
              <button type="button" onClick={onClose} disabled={busy} aria-label="ปิด" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <legend className="px-1 text-sm font-semibold text-ink">ข้อมูลสมาชิก</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="m-name" className={labelCls}>ชื่อ-สกุล <span className="text-rose-600">*</span></label>
                    <input id="m-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={250} required placeholder="เช่น นางสาวสมใจ ใจดี" className={field} />
                  </div>
                  <div>
                    <label htmlFor="m-position" className={labelCls}>ตำแหน่ง</label>
                    <input id="m-position" value={position} onChange={(e) => setPosition(e.target.value)} maxLength={250} placeholder="เช่น นักวิชาการพัสดุปฏิบัติการ" className={field} />
                  </div>
                  <div>
                    <label htmlFor="m-dept" className={labelCls}>กลุ่มงาน/ฝ่าย</label>
                    <input id="m-dept" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={250} placeholder="เช่น การเงิน, พัสดุ" className={field} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <legend className="px-1 text-sm font-semibold text-ink">บัญชีเข้าใช้งาน</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="m-login" className={labelCls}>ชื่อผู้ใช้ (ใช้ล็อกอิน) <span className="text-rose-600">*</span></label>
                    <input
                      id="m-login"
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value.replace(/\s/g, ''))}
                      maxLength={50}
                      required
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="เช่น somjai.j"
                      aria-invalid={loginName !== '' && !loginOk ? true : undefined}
                      className={`${field} font-mono`}
                    />
                    <p className={`mt-1 text-xs ${loginName !== '' && !loginOk ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-ink-4'}`}>
                      ภาษาอังกฤษ ตัวเลข หรือ . _ - ยาว 3-50 ตัวอักษร ห้ามซ้ำกับชื่อใน HOSxP
                    </p>
                  </div>
                  <div>
                    <label htmlFor="m-password" className={labelCls}>รหัสผ่านเริ่มต้น <span className="text-rose-600">*</span></label>
                    <PasswordField id="m-password" value={password} onChange={setPassword} required />
                  </div>
                </div>
                <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-ink">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-[var(--brand-strong,#1d4ed8)]" />
                  <span>
                    <span className="font-semibold">อนุญาตให้เข้าระบบพัสดุทันที</span>
                    <span className="block text-xs text-ink-4">สมาชิกเปลี่ยนรหัสผ่านเองได้ที่ โปรไฟล์ & ความปลอดภัย</span>
                  </span>
                </label>
              </fieldset>

              <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <legend className="px-1 text-sm font-semibold text-ink">ระดับสิทธิ์</legend>
                <RolePicker roles={roles} value={role} onChange={setRole} />
              </fieldset>

              <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <legend className="px-1 text-sm font-semibold text-ink">เมนูที่มองเห็น</legend>
                <MenuPicker menus={menus} picked={picked} onChange={setPicked} isAdmin={role === 'Admin'} />
              </fieldset>

              <div>
                <label htmlFor="m-note" className={labelCls}>หมายเหตุ</label>
                <input id="m-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="เช่น ลูกจ้างชั่วคราว ถึง 30 ก.ย. 2570" className={field} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-4 dark:border-white/10">
              {error ? <p role="alert" className="mr-auto text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p> : <span className="mr-auto" />}
              <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer">
                ยกเลิก
              </button>
              <button type="submit" disabled={busy || !ready} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:opacity-50 cursor-pointer">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                เพิ่มสมาชิก
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
