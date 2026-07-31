/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0A0E14',
          900: '#0F1520',
          800: '#161E2B',
          700: '#202B3D',
          600: '#2E3B52',
        },
        steel: {
          400: '#7C93B8',
          300: '#9EB2D1',
          200: '#C4D1E8',
        },
        signal: {
          amber: '#E8A23D',
          teal: '#3DBFA8',
          coral: '#E86A5C',
          violet: '#8B7CE8',
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -8px rgba(0,0,0,0.6)',
      }
    },
  },
  plugins: [],
}
