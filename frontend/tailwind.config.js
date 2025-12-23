/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        xbox: {
          green: '#107C10',
          dark: '#0e7a0d',
          light: '#52b043'
        }
      }
    },
  },
  plugins: [],
}
