/**
 * Timing for performance budgets in unit tests. Returns the fastest of `runs` timed calls (ms) and
 * the last result. On a shared or loaded machine preemption only ever adds time, so the minimum is
 * the noise-robust measure of how fast the code runs; a budget on it still catches regressions.
 * `setup` runs untimed before each call (e.g. to build a fresh, cold input).
 */
export function fastest<T>(runs: number, fn: () => T, setup?: () => void): { ms: number; result: T } {
  let ms = Infinity
  let result!: T
  for (let i = 0; i < runs; i++) {
    setup?.()
    const t0 = performance.now()
    result = fn()
    ms = Math.min(ms, performance.now() - t0)
  }
  return { ms, result }
}
