import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Single source of the app version: package.json (shown in Help > About). */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // keep function names in production: readable component stacks in error reports, and the e2e
  // render-count test identifies components by name against a production build too
  build: { rolldownOptions: { output: { keepNames: true } } },
})
