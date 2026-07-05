import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Component tests run under vitest + jsdom and are scoped to `*.test.tsx`, so the
// node:test pure-function suites (`*.test.ts`, run via `npm run test:unit`) never
// collide with them.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    css: false,
  },
})
