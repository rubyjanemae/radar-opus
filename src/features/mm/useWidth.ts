import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Width of an element, tracked with a ResizeObserver (0 until measured). Follows the element
 * behind the ref when it mounts later or is replaced (conditional rendering).
 */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  const [el, setEl] = useState<HTMLElement | null>(null)
  // runs after every render: pick up a (re)mounted element
  useLayoutEffect(() => { if (ref.current !== el) setEl(ref.current) })
  useLayoutEffect(() => {
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return w
}
