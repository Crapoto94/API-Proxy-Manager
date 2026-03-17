/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dsihub: {
          red: '#E30613',
          navy: '#003366'
        }
      }
    },
  },
  plugins: [],
}
