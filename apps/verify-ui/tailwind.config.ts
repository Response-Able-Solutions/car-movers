import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#60A0DB',
        secondary: '#99CCFF',
        alt: '#FFFFFF',
        ink: '#10314D',
        mist: '#EAF4FD',
      },
      fontFamily: {
        sans: ['Avenir Next', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 30px 80px rgba(58, 113, 161, 0.16)',
      },
      keyframes: {
        rise: {
          '0%': {
            opacity: '0',
            transform: 'translateY(12px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
      animation: {
        rise: 'rise 320ms ease',
      },
    },
  },
  plugins: [],
} satisfies Config;
