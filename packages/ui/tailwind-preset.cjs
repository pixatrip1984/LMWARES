/**
 * Preset Tailwind compartido por public-web y admin-web.
 * Uso en cada app: presets: [require('@starter/ui/tailwind-preset')]
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcd9ff',
          300: '#8ec0ff',
          400: '#599dff',
          500: '#3478f6',
          600: '#1f5bdb',
          700: '#1a48b0',
          800: '#1b3e8c',
          900: '#1b376f',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f6f7f9',
          border: '#e5e7eb',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
};
