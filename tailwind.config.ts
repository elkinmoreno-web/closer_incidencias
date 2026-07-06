import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#7BB4B8',
        'primary-dark': '#5F9599',
        ink: '#2C3E50',
        'ink-muted': '#64748B',
        surface: '#FFFFFF',
        bg: '#F4F7F8',
        border: '#E1E8EB',
        danger: '#E74C3C',
        warning: '#D39E00',
        success: '#2E9E6B',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'sans-serif'],
      },
      borderRadius: {
        card: '24px',
      },
    },
  },
  plugins: [],
};

export default config;
