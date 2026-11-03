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
  { id: 'navy', name: 'Royal Navy', thaiName: 'กรมท่ามาตรฐานราชการ', shortName: 'กรมท่า', hex: '#1E3A8A', hoverHex: '#1E40AF', softBgLight: '#EFF6FF', softBgDark: '#172554' },
  { id: 'cobalt', name: 'Ministry Cobalt', thaiName: 'น้ำเงินกระทรวง', shortName: 'น้ำเงิน', hex: '#2563EB', hoverHex: '#1D4ED8', softBgLight: '#EFF6FF', softBgDark: '#1E3A8A' },
  { id: 'sky', name: 'Clinical Sky', thaiName: 'ฟ้าการแพทย์', shortName: 'ฟ้าการแพทย์', hex: '#0284C7', hoverHex: '#0369A1', softBgLight: '#F0F9FF', softBgDark: '#0C4A6E' },
  { id: 'teal', name: 'Public Health Teal', thaiName: 'เขียวสาธารณสุข', shortName: 'เขียวสาธารณสุข', hex: '#0D9488', hoverHex: '#0F766E', softBgLight: '#F0FDFA', softBgDark: '#134E4A' },
  { id: 'emerald', name: 'Medical Emerald', thaiName: 'เขียวมรกตโรงพยาบาล', shortName: 'เขียวมรกต', hex: '#059669', hoverHex: '#047857', softBgLight: '#ECFDF5', softBgDark: '#064E3B' },
  { id: 'green', name: 'Forest Administration', thaiName: 'เขียวบริหารส่วนภูมิภาค', shortName: 'เขียวภูมิภาค', hex: '#16A34A', hoverHex: '#15803D', softBgLight: '#F0FDF4', softBgDark: '#14532D' },
  { id: 'cyan', name: 'Digital Gov Cyan', thaiName: 'ฟ้ารัฐบาลดิจิทัล', shortName: 'ฟ้าดิจิทัล', hex: '#0891B2', hoverHex: '#0E7490', softBgLight: '#ECFEFF', softBgDark: '#164E63' },
  { id: 'indigo', name: 'Executive Indigo', thaiName: 'ครามบริหารจัดการ', shortName: 'ครามบริหาร', hex: '#4F46E5', hoverHex: '#4338CA', softBgLight: '#EEF2FF', softBgDark: '#312E81' },
  { id: 'violet', name: 'Academic Violet', thaiName: 'ม่วงสถาบันวิจัย', shortName: 'ม่วงวิจัย', hex: '#7C3AED', hoverHex: '#6D28D9', softBgLight: '#F5F3FF', softBgDark: '#4C1D95' },
  { id: 'purple', name: 'Provincial Purple', thaiName: 'ม่วงส่วนงานราชการ', shortName: 'ม่วงราชการ', hex: '#9333EA', hoverHex: '#7E22CE', softBgLight: '#FAF5FF', softBgDark: '#581C87' },
  { id: 'slate', name: 'Official Slate', thaiName: 'เทาสเลททางการ', shortName: 'เทาทางการ', hex: '#334155', hoverHex: '#1E293B', softBgLight: '#F1F5F9', softBgDark: '#1E293B' },
  { id: 'amber', name: 'Treasury Amber', thaiName: 'ทองคลังราชการ', shortName: 'ทองคลัง', hex: '#D97706', hoverHex: '#B45309', softBgLight: '#FFFBEB', softBgDark: '#78350F' },
  { id: 'orange', name: 'Emergency Orange', thaiName: 'ส้มศูนย์ปฏิบัติการ', shortName: 'ส้มปฏิบัติการ', hex: '#EA580C', hoverHex: '#C2410C', softBgLight: '#FFF7ED', softBgDark: '#7C2D12' },
  { id: 'crimson', name: 'National Crimson', thaiName: 'แดงชาดทางการ', shortName: 'แดงชาด', hex: '#DC2626', hoverHex: '#B91C1C', softBgLight: '#FEF2F2', softBgDark: '#7F1D1D' },
  { id: 'rose', name: 'Cardiology Rose', thaiName: 'ชมพูศูนย์โรคหัวใจ', shortName: 'ชมพูหัวใจ', hex: '#E11D48', hoverHex: '#BE123C', softBgLight: '#FFF1F2', softBgDark: '#881337' },
  { id: 'bronze', name: 'Archive Bronze', thaiName: 'น้ำตาลสารบรรณ', shortName: 'น้ำตาลสารบรรณ', hex: '#854D0E', hoverHex: '#713F12', softBgLight: '#FEFCE8', softBgDark: '#422006' },
];
