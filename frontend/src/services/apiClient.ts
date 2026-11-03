/**
 * Frontend API Client (เชื่อมต่อกับ Backend Server ที่ /api/*)
 * จัดการเรียกข้อมูลจากหลังบ้าน (Node.js Express) พร้อมระบบ Offline Fallback
 */

export interface BackendHealth {
  status: string;
  mode: string;
  server: string;
  uptimeSeconds: number;
  timestamp: string;
}

let onUnauthorized: (() => void) | null = null;
let onLocked: (() => void) | null = null;
let onSetup2fa: (() => void) | null = null;

/** The auth layer registers this so an expired session returns the user to the login page */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** The auth layer registers this so a locked screen (423) shows the PIN pad, e.g. after a reload or from another tab */
export function setLockedHandler(handler: (() => void) | null): void {
  onLocked = handler;
}

/** The auth layer registers this so a 428 (2FA setup required by the admin's policy) shows the setup screen */
export function setSetup2faHandler(handler: (() => void) | null): void {
  onSetup2fa = handler;
}

/** fetch() for authenticated API calls: a 401 means the session is gone, a 423 that the screen is locked */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) onUnauthorized?.();
  if (res.status === 423) onLocked?.();
  if (res.status === 428) onSetup2fa?.();
  return res;
}

export const apiClient = {
  /**
   * ตรวจสอบสถานะการเชื่อมต่อกับ Backend Server
   */
  async checkHealth(): Promise<BackendHealth | null> {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
};
