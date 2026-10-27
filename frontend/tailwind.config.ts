import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  safelist: [
    {
      pattern:
        /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(from-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(via-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern:
        /^(to-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern: /^shadow-(?:none|sm|base|lg|xl|2xl|inner|drop)/,
    },
  ],
  theme: {
    extend: {
      colors: {
        risk: {
          bg: {
            primary: '#050b18',
            secondary: '#0a1428',
            card: '#0d1a31',
            raised: '#11233f',
          },
          border: {
            DEFAULT: '#1d3557',
            strong: '#2a4a72',
          },
          text: {
            primary: '#e6f1ff',
            secondary: '#9fb4d6',
            muted: '#6379a4',
          },
          accent: {
            blue: '#1f7dff',
            cyan: '#22d3ee',
            teal: '#14b8a6',
            green: '#34d399',
            amber: '#fbbf24',
            rose: '#fb7185',
            purple: '#a78bfa',
          },
        },
      },
      backgroundImage: {
        'risk-gradient-hero': 'linear-gradient(135deg, #0a1832 0%, #142a52 100%)',
        'risk-gradient-card':
          'linear-gradient(180deg, rgba(31, 125, 255, 0.06) 0%, rgba(34, 211, 238, 0.02) 100%)',
      },
      boxShadow: {
        'risk-glow-blue': '0 0 24px rgba(31, 125, 255, 0.15)',
        'risk-glow-cyan': '0 0 24px rgba(34, 211, 238, 0.12)',
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'JetBrains Mono',
          'ui-monospace',
          'Cascadia Code',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      keyframes: {
        'fade-slide': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 12px rgba(34, 211, 238, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(34, 211, 238, 0.4)' },
        },
      },
      animation: {
        'fade-slide': 'fade-slide 0.28s ease-out both',
        shimmer: 'shimmer 1.6s infinite ease-in-out',
        'pulse-glow': 'pulse-glow 3s infinite ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
