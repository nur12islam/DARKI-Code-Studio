/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { studio: { bg: '#0f172a', panel: '#1e293b', border: '#334155', accent: '#38bdf8', warning: '#f97316' } } } },
  plugins: []
};