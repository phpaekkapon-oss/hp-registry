/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans Thai"', '"Noto Sans Thai Fallback"', '"Segoe UI"', 'Tahoma', 'sans-serif'],
        prompt: ['"Noto Sans Thai"', '"Noto Sans Thai Fallback"', '"Segoe UI"', 'Tahoma', 'sans-serif'],
        sarabun: ['"Noto Sans Thai"', '"Noto Sans Thai Fallback"', '"Segoe UI"', 'Tahoma', 'sans-serif'],
        heading: ['"Noto Sans Thai"', '"Noto Sans Thai Fallback"', '"Segoe UI"', 'Tahoma', 'sans-serif'],
        doc: ['"TH Sarabun New"', '"Sarabun"', 'Tahoma', 'sans-serif'],
        mono: ['"Noto Sans Thai"', '"Noto Sans Thai Fallback"', '"Segoe UI"', 'Tahoma', 'sans-serif'],
      },
      colors: {
        chroma: {
          canvas: 'var(--token-surface-canvas)',
          card: 'var(--token-surface-card)',
          elevated: 'var(--token-surface-elevated)',
          border: 'var(--token-border-subtle)',
          optical: 'var(--token-border-optical)',
        },
        ink: {
          DEFAULT: 'var(--text-ink)',
          2: 'var(--text-ink-2)',
          3: 'var(--text-ink-3)',
          4: 'var(--text-ink-4)',
          5: 'var(--text-ink-5)',
          6: 'var(--text-ink-6)',
        },
      },
      fontSize: {
        'fluid-xs': ['clamp(0.8125rem, 0.79rem + 0.15vw, 0.875rem)', { lineHeight: '1.5' }],
        'fluid-sm': ['clamp(0.9375rem, 0.9rem + 0.18vw, 1rem)', { lineHeight: '1.55' }],
        'fluid-base': ['clamp(0.9375rem, 0.9rem + 0.22vw, 1.03125rem)', { lineHeight: '1.6' }],
        'fluid-lg': ['clamp(1.0625rem, 1.0rem + 0.32vw, 1.2rem)', { lineHeight: '1.45' }],
        'fluid-xl': ['clamp(1.1875rem, 1.1rem + 0.45vw, 1.375rem)', { lineHeight: '1.35' }],
        'fluid-2xl': ['clamp(1.375rem, 1.24rem + 0.68vw, 1.75rem)', { lineHeight: '1.25' }],
        'fluid-kpi': ['clamp(1.375rem, 1.25rem + 0.7vw, 1.75rem)', { lineHeight: '1.15', }],
      },
      spacing: {
        '8pt-1': '0.5rem',   /* 8px */
        '8pt-2': '1rem',     /* 16px */
        '8pt-3': '1.5rem',   /* 24px */
        '8pt-4': '2rem',     /* 32px */
        '8pt-5': '2.5rem',   /* 40px */
        '8pt-6': '3rem',     /* 48px (Minimum Touch Target) */
      },
      transitionTimingFunction: {
        'spring-ios': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'spring-tactile': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};

