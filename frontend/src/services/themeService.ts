export interface ThemeColorConfig {
  id: string;
  name: string;
  thaiName: string;
  /** Compact Thai label for dense pickers */
  shortName: string;
  hex: string;
  hoverHex: string;
  softBgLight: string;
  softBgDark: string;
}

export const GOVERNMENT_THEMES: ThemeColorConfig[] = [
  { id: 'blue', name: 'Vivid Blue', thaiName: 'น้ำเงินสด', shortName: 'น้ำเงิน', hex: '#3B82F6', hoverHex: '#2563EB', softBgLight: '#EFF6FF', softBgDark: '#1E3A8A' },
  { id: 'sky', name: 'Vivid Sky', thaiName: 'ฟ้าสด', shortName: 'ฟ้า', hex: '#0EA5E9', hoverHex: '#0284C7', softBgLight: '#F0F9FF', softBgDark: '#0C4A6E' },
  { id: 'indigo', name: 'Vivid Indigo', thaiName: 'คราม', shortName: 'คราม', hex: '#6366F1', hoverHex: '#4F46E5', softBgLight: '#EEF2FF', softBgDark: '#312E81' },
  { id: 'violet', name: 'Vivid Violet', thaiName: 'ม่วง', shortName: 'ม่วง', hex: '#8B5CF6', hoverHex: '#7C3AED', softBgLight: '#F5F3FF', softBgDark: '#4C1D95' },
  { id: 'purple', name: 'Vivid Purple', thaiName: 'ม่วงสด', shortName: 'ม่วงสด', hex: '#A855F7', hoverHex: '#9333EA', softBgLight: '#FAF5FF', softBgDark: '#581C87' },
  { id: 'pink', name: 'Vivid Pink', thaiName: 'ชมพู', shortName: 'ชมพู', hex: '#EC4899', hoverHex: '#DB2777', softBgLight: '#FDF2F8', softBgDark: '#831843' },
  { id: 'rose', name: 'Vivid Rose', thaiName: 'ชมพูกุหลาบ', shortName: 'กุหลาบ', hex: '#F43F5E', hoverHex: '#E11D48', softBgLight: '#FFF1F2', softBgDark: '#881337' },
  { id: 'red', name: 'Vivid Red', thaiName: 'แดง', shortName: 'แดง', hex: '#EF4444', hoverHex: '#DC2626', softBgLight: '#FEF2F2', softBgDark: '#7F1D1D' },
  { id: 'orange', name: 'Vivid Orange', thaiName: 'ส้ม', shortName: 'ส้ม', hex: '#F97316', hoverHex: '#EA580C', softBgLight: '#FFF7ED', softBgDark: '#7C2D12' },
  { id: 'amber', name: 'Vivid Amber', thaiName: 'ส้มทอง', shortName: 'ส้มทอง', hex: '#F59E0B', hoverHex: '#D97706', softBgLight: '#FFFBEB', softBgDark: '#78350F' },
  { id: 'yellow', name: 'Vivid Yellow', thaiName: 'เหลือง', shortName: 'เหลือง', hex: '#EAB308', hoverHex: '#CA8A04', softBgLight: '#FEFCE8', softBgDark: '#713F12' },
  { id: 'lime', name: 'Vivid Lime', thaiName: 'เขียวมะนาว', shortName: 'มะนาว', hex: '#84CC16', hoverHex: '#65A30D', softBgLight: '#F7FEE7', softBgDark: '#365314' },
  { id: 'green', name: 'Vivid Green', thaiName: 'เขียว', shortName: 'เขียว', hex: '#22C55E', hoverHex: '#16A34A', softBgLight: '#F0FDF4', softBgDark: '#14532D' },
  { id: 'emerald', name: 'Vivid Emerald', thaiName: 'เขียวมรกต', shortName: 'มรกต', hex: '#10B981', hoverHex: '#059669', softBgLight: '#ECFDF5', softBgDark: '#064E3B' },
  { id: 'teal', name: 'Vivid Teal', thaiName: 'เขียวน้ำทะเล', shortName: 'น้ำทะเล', hex: '#14B8A6', hoverHex: '#0D9488', softBgLight: '#F0FDFA', softBgDark: '#134E4A' },
  { id: 'cyan', name: 'Vivid Cyan', thaiName: 'ฟ้าเขียว', shortName: 'ฟ้าเขียว', hex: '#06B6D4', hoverHex: '#0891B2', softBgLight: '#ECFEFF', softBgDark: '#164E63' },
];
