#!/usr/bin/env node
/**
 * Screenshot helper for visual QA.
 *   node scripts/shot.mjs <url> <out.png> [--w 1440] [--h 900] [--dark] [--eval "js"] [--keys "Mod+K,Escape"] [--wait 800]
 * Starts from a clean profile unless --keep is given. Prints console errors.
 */
import { chromium } from '@playwright/test'
const args = process.argv.slice(2)
const url = args[0], out = args[1]
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const flag = k => args.includes(k)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: Number(opt('--w', 1440)), height: Number(opt('--h', 900)) }, colorScheme: flag('--dark') ? 'dark' : 'light' })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))
await page.goto(url)
await page.waitForSelector('.shell', { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(Number(opt('--wait', 800)))
const ev = opt('--eval'); if (ev) { await page.evaluate(ev); await page.waitForTimeout(400) }
const keys = opt('--keys'); if (keys) for (const k of keys.split(',')) { await page.keyboard.press(k.replace('Mod', 'Control')); await page.waitForTimeout(250) }
await page.screenshot({ path: out })
if (errors.length) console.log('console errors:\n' + errors.join('\n'))
await browser.close()
