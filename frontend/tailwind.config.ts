import type { Config } from 'tailwindcss';

const neutral = {
  50: '#f4f5f5', 100: '#e6e8ea', 200: '#d7dbdf', 300: '#bcc3ca',
  400: '#9aa4ad', 500: '#8b959e', 600: '#65707a', 700: '#3b434c',
  800: '#252b32', 900: '#191e24', 950: '#111418',
};
const accent = {
  50: '#eef3f6', 100: '#dce7ee', 200: '#c6d8e3', 300: '#b1c7d6',
  400: '#9cb7ca', 500: '#7e9caf', 600: '#637f93', 700: '#465f72',
  800: '#304454', 900: '#24333e', 950: '#17232c',
};
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: neutral, gray: neutral,
        cyan: accent, blue: accent, sky: accent, indigo: accent, violet: neutral,
        rose: {100:'#e7bfbc',200:'#ddb0ab',300:'#ce918b',400:'#c1817b',500:'#b06d67',600:'#925a55',700:'#6c4440',900:'#382624'},
        orange: {100:'#e7cfb6',200:'#dbc0a0',300:'#c5a27d',400:'#bd9670',500:'#ac855e',600:'#906e4d',700:'#6b533d'},
        amber: {100:'#e5d8b9',200:'#d7c69e',300:'#c4ad7d',400:'#b6a06e',500:'#a38d5e',600:'#8a764e',700:'#66583b'},
        emerald: {100:'#d2dfd2',200:'#bed0bd',300:'#a1b89e',400:'#8fa98c',500:'#7a9577',600:'#617b5f',700:'#495c47'},
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: { xs: ['12px','16px'], sm: ['14px','20px'], base: ['16px','24px'], lg: ['20px','28px'], xl: ['20px','28px'], '2xl': ['28px','36px'], '3xl': ['28px','36px'] },
      borderRadius: { DEFAULT:'4px', md:'6px', lg:'6px', xl:'6px', '2xl':'6px' },
    },
  },
  plugins: [],
};
export default config;
