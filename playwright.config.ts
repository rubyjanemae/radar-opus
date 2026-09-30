import { defineConfig } from '@playwright/test'

/**
 * E2E against the Vite dev server this config starts on E2E_PORT (default 5199), never a shared `dist`.
 * Set E2E_URL to test an already running server instead (the dev server is then reused if it answers there).
 * PW_OUTPUT redirects traces and failure artefacts (default test-results). Uses the preinstalled
 * Chromium; set CHROME_PATH to override.
 */
const port = Number(process.env.E2E_PORT ?? 5199)
const baseURL = process.env.E2E_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: 'e2e',
  outputDir: process.env.PW_OUTPUT ?? 'test-results',
  timeout: 60_000,
  // assertions poll for up to 10 s: parallel runs load the machine, and waits are expectations, never sleeps
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: process.env.E2E_URL ?? baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  // assertions poll for up to 10 s: parallel runs load the machine, and waits are expectations, never sleeps
  expect: { timeout: 10_000 },
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
    trace: 'retain-on-failure',
  },
})
