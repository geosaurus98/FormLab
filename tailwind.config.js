/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a' },
        fuel: { 500: '#f59e0b', 600: '#d97706' },
        lift: { 500: '#6366f1', 600: '#4f46e5' },
        pantry: { 500: '#22c55e', 600: '#16a34a' }
      },
      fontFamily: { sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] }
    }
  },
  plugins: []
};
