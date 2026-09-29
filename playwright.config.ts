import { defineConfig } from '@playwright/test'

/**
 * E2E against a running server: E2E_URL (default http://localhost:4173, `npx vite preview`).
 * Uses the preinstalled Chromium; set CHROME_PATH to override.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
    trace: 'retain-on-failure',
  },
})
