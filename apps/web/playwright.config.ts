import { defineConfig, devices } from '@playwright/test'

/* UI smoke (PLAN §1.3 #15): chromium only, API fully mocked via page.route —
   no backend/DB required, reproducible in CI. */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  // Retry in CI so a rare lazy-load (Tiptap) timing flake doesn't red the run; the
  // trace is captured on the first retry for diagnosis.
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
