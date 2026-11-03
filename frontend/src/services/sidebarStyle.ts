/** Looks of the left menu bar (chosen from the palette button in the header, saved on this device) */
export type SidebarStyle = 'clean' | 'tint' | 'gradient' | 'premium' | 'solid';

export const SIDEBAR_STYLES: { id: SidebarStyle; label: string; hint: string }[] = [
  { id: 'clean', label: 'สะอาด', hint: 'แถบเมนูสีขาวเรียบ อ่านง่าย (ค่าเริ่มต้น)' },
  { id: 'tint', label: 'ซ้อนสี', hint: 'พื้นแถบเมนูอมสีธีมอ่อน ๆ' },
  { id: 'gradient', label: 'ไล่สี', hint: 'ไล่เฉดสีธีมจากบนลงล่าง' },
  { id: 'premium', label: 'พรีเมียม', hint: 'แถบเมนูโทนเข้ม กลมกลืนกับหน้าจอ' },
  { id: 'solid', label: 'สีเต็ม', hint: 'แถบเมนูเป็นสีธีมเต็มแถบ โดดเด่น' },
];

export const DEFAULT_SIDEBAR_STYLE: SidebarStyle = 'clean';
const KEY = 'his_egov_sidebar_style';

export function readSidebarStyle(): SidebarStyle {
  try {
    const v = localStorage.getItem(KEY);
    if (SIDEBAR_STYLES.some((s) => s.id === v)) return v as SidebarStyle;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_SIDEBAR_STYLE;
}

export function saveSidebarStyle(style: SidebarStyle): void {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    /* ignore */
  }
}
