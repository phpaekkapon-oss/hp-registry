import { apiFetch } from '../../services/apiClient';
import type { EnterpriseRole } from '../../services/enterpriseService';

export interface ManagedUser {
  loginName: string;
  displayName: string | null;
  doctorCode: string | null;
  groupName: string | null;
  department: string | null;
  /** Job title from HOSxP (overwritten on every sync) */
  positionName: string | null;
  /** Job title typed by an admin here (kept across syncs, shown instead of positionName) */
  positionCustom: string | null;
  licenseNo: string | null;
  /** Account is switched off in HOSxP (cannot sign in even if enabled here) */
  hosDisabled: boolean;
  /** No longer found in HOSxP at the last sync */
  hosMissing: boolean;
  role: EnterpriseRole;
  isEnabled: boolean;
  menus: string[];
  note: string | null;
  lastLogin: string | null;
  syncedAt: string | null;
  /** hosxp = synced from HOSxP, local = member added here with its own password */
  source: 'hosxp' | 'local';
  passwordChangedAt: string | null;
}

export interface MenuDef {
  id: string;
  label: string;
  group: string;
}

export interface SyncLogEntry {
  startedAt: string;
  finishedAt: string | null;
  runBy: string | null;
  status: 'running' | 'ok' | 'error';
  usersFetched: number | null;
  usersAdded: number | null;
  usersMissing: number | null;
  doctorsFetched: number | null;
  message: string | null;
}

export interface UserAdminMeta {
  menus: MenuDef[];
  roles: EnterpriseRole[];
  hosConfigured: boolean;
  counts: { total: number; enabled: number; hosDisabled: number; missing: number; local: number };
  groups: { name: string; count: number }[];
  lastSync: SyncLogEntry | null;
}

export interface GroupTemplateRow {
  groupName: string;
  members: number;
  /** Members whose HOSxP account is still open */
  active: number;
  /** Members allowed into the procurement system */
  enabled: number;
  template: { role: EnterpriseRole; menus: string[]; autoApply: boolean; updatedAt: string; updatedBy: string | null } | null;
}

export interface NewMember {
  loginName: string;
  displayName: string;
  positionCustom: string | null;
  department: string | null;
  password: string;
  role: EnterpriseRole;
  menus: string[];
  isEnabled: boolean;
  note: string | null;
}

export interface UserChange {
  role?: EnterpriseRole;
  isEnabled?: boolean;
  menus?: string[];
  note?: string | null;
  positionCustom?: string | null;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: { success?: boolean; data?: T; message?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response (e.g. proxy error page) */
  }
  if (!res.ok || !json?.success) throw new Error(json?.message ?? `เกิดข้อผิดพลาด (${res.status})`);
  return json.data as T;
}

export const userAdminApi = {
  meta: () => request<UserAdminMeta>('GET', '/api/users/meta'),
  list: () => request<ManagedUser[]>('GET', '/api/users'),
  sync: () => request<{ usersFetched: number; usersAdded: number; usersMissing: number; doctorsFetched: number; autoGranted: number }>('POST', '/api/users/sync'),
  templates: () => request<GroupTemplateRow[]>('GET', '/api/users/templates'),
  saveTemplate: (body: { groupName: string; role: EnterpriseRole; menus: string[]; autoApply: boolean }) => request<null>('PUT', '/api/users/templates', body),
  deleteTemplate: (groupName: string) => request<null>('POST', '/api/users/templates/delete', { groupName }),
  applyTemplate: (groupName: string, enable: boolean) => request<{ updated: number }>('POST', '/api/users/templates/apply', { groupName, enable }),
  update: (loginName: string, change: UserChange) => request<ManagedUser>('PUT', `/api/users/${encodeURIComponent(loginName)}`, change),
  bulk: (logins: string[], change: UserChange) => request<{ updated: number }>('POST', '/api/users/bulk', { logins, ...change }),

  // Members who are not in HOSxP (own password, kept out of the HOSxP sync)
  createMember: (body: NewMember) => request<ManagedUser>('POST', '/api/users/local', body),
  updateProfile: (loginName: string, body: { displayName: string; department: string | null }) => request<null>('PUT', `/api/users/${encodeURIComponent(loginName)}/profile`, body),
  setPassword: (loginName: string, password: string) => request<null>('POST', `/api/users/${encodeURIComponent(loginName)}/password`, { password }),
  removeMember: (loginName: string) => request<null>('DELETE', `/api/users/${encodeURIComponent(loginName)}`),
};
