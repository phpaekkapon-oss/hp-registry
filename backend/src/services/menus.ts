/**
 * Menus a user can be given access to (ticked by an admin in the user-management page).
 * The same ids are used by the frontend to decide which tabs / sidebar items to show,
 * and by the API to refuse requests for registers the user may not open.
 */
export const MENUS = [
  { id: 'incoming', label: 'ทะเบียนหนังสือรับ', group: 'งานพัสดุ' },
  { id: 'orders', label: 'ทะเบียนใบสั่งซื้อ/จ้าง', group: 'งานพัสดุ' },
  { id: 'contracts', label: 'ทะเบียนสัญญา', group: 'งานพัสดุ' },
  { id: 'guarantees', label: 'หลักประกันสัญญา', group: 'งานพัสดุ' },
  { id: 'progress', label: 'ความก้าวหน้า', group: 'งานพัสดุ' },
  { id: 'summary', label: 'รายงานสรุป', group: 'งานพัสดุ' },
  { id: 'settings', label: 'ธีมและการแสดงผล (หน้าตั้งค่า)', group: 'ระบบ' },
] as const;

export type MenuId = (typeof MENUS)[number]['id'];

export const MENU_IDS: MenuId[] = MENUS.map((m) => m.id);
export const PROCURE_MENU_IDS: MenuId[] = MENUS.filter((m) => m.group === 'งานพัสดุ').map((m) => m.id);

/** Only admins can open user management; it is a role, not a tickable menu, so nobody can grant it by accident */
export const USER_ADMIN_MENU = 'usermgmt';
/** Audit log page: also admin-only */
export const AUDIT_MENU = 'audit';

export type Role = 'Admin' | 'Doctor' | 'Staff';
export const ROLES: Role[] = ['Admin', 'Doctor', 'Staff'];

/** Keeps only known menu ids, without duplicates, in a stable order */
export function normalizeMenus(input: unknown): MenuId[] {
  if (!Array.isArray(input)) return [];
  const wanted = new Set(input.filter((v): v is string => typeof v === 'string'));
  return MENU_IDS.filter((id) => wanted.has(id));
}

/** What the signed-in user actually gets: admins see everything, everyone else only what was ticked */
export function effectiveMenus(role: Role, ticked: readonly string[]): string[] {
  if (role === 'Admin') return [...MENU_IDS, USER_ADMIN_MENU, AUDIT_MENU];
  return normalizeMenus(ticked);
}
