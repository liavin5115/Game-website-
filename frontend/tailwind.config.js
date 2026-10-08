/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        felt: {
          50: '#f0f7f0',
          100: '#dceadc',
          200: '#bcd5bc',
          300: '#8dbb8d',
          400: '#5a9d5a',
          500: '#2d7d32',
          600: '#256629',
          700: '#1e5020',
          800: '#1a421c',
          900: '#163818',
          950: '#0a1e0c',
        },
        gold: {
          50: '#fffbf0',
          100: '#fff3cc',
          200: '#ffe799',
          300: '#ffd666',
          400: '#ffc533',
          500: '#ffb300',
          600: '#cc8f00',
          700: '#996b00',
          800: '#735200',
          900: '#5c4200',
          950: '#332400',
        },
      },
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'serif'],
        ui: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}