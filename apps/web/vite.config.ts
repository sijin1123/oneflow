import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // dhtmlx-gantt is shared by two lazy routes (timeline, reports) —
        // without this it hoists into the MAIN chunk. Keep it async-only.
        manualChunks(id: string) {
          if (id.includes('dhtmlx-gantt')) return 'dhtmlx-gantt'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
})
