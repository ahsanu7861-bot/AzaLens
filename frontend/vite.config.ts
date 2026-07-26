import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'],
    globals: false,
    setupFiles: './src/test/setup.ts',
  },
})
