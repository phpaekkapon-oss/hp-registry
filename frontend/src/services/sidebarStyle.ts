/** Looks of the left menu bar (chosen from the palette button in the header, saved on this device) */
export type SidebarStyle = 'clean' | 'tint' | 'gradient' | 'premium' | 'solid';

export const SIDEBAR_STYLES: { id: SidebarStyle; label: string; hint: string }[] = [
  { id: 'clean', label: 'สะอาด', hint: 'แถบเมนูสีขาวเรียบ อ่านง่าย' },
  { id: 'tint', label: 'ซ้อนสี', hint: 'พื้นแถบเมนูอมสีธีมอ่อน ๆ' },
  { id: 'gradient', label: 'ไล่สี', hint: 'ไล่เฉดสีธีมจากบนลงล่าง' },
  { id: 'premium', label: 'พรีเมียม', hint: 'แถบเมนูโทนเข้ม กลมกลืนกับหน้าจอ' },
  { id: 'solid', label: 'สีเต็ม', hint: 'ไล่สีธีมสดจากบนลงล่าง โดดเด่น (ค่าเริ่มต้น)' },
];

/** CSS background of the mini sidebar swatch; mirrors the --sb-bg values in index.css (light and dark) */
export function sidebarPreviewBackground(style: SidebarStyle, hex: string, dark: boolean): string {
  switch (style) {
    case 'clean':
      return dark ? `color-mix(in srgb, ${hex} 10%, #0D1424)` : '#ffffff';
    case 'tint':
      return dark ? `color-mix(in srgb, ${hex} 20%, #0D1424)` : `color-mix(in srgb, ${hex} 9%, #ffffff)`;
    case 'gradient':
      return dark
        ? `linear-gradient(180deg, color-mix(in srgb, ${hex} 42%, #0D1424) 0%, #0D1424 75%)`
        : `linear-gradient(180deg, color-mix(in srgb, ${hex} 22%, #ffffff) 0%, #ffffff 70%)`;
    case 'premium':
      return `color-mix(in srgb, ${hex} 10%, #0D1424)`;
    case 'solid':
      return dark
        ? `linear-gradient(180deg, color-mix(in srgb, ${hex} 62%, #0D1424) 0%, color-mix(in srgb, ${hex} 34%, #0D1424) 45%, color-mix(in srgb, ${hex} 16%, #0D1424) 100%)`
        : `linear-gradient(180deg, color-mix(in srgb, ${hex} 78%, #000000) 0%, color-mix(in srgb, ${hex} 38%, #000000) 42%, color-mix(in srgb, ${hex} 14%, #000000) 100%)`;
  }
}

export const DEFAULT_SIDEBAR_STYLE: SidebarStyle = 'solid';
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
