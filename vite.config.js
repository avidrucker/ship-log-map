import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    process.env.ANALYZE === '1' && visualizer({
      open: true,
      gzipSize: true,
      filename: 'dist/bundle-stats.html',
    }),
  ].filter(Boolean),
  base: '/ship-log-map/',
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      }
    }
  },
  publicDir: 'public',
})
