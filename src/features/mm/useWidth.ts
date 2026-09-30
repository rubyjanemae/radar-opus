import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefCallback, RefObject } from 'react'

/**
 * Width of an element, tracked with a ResizeObserver (0 until measured). Returns the width and a
 * callback ref to attach to the element: the observer follows the element when it mounts later or
 * is replaced (conditional rendering) and is disconnected when it unmounts. `target`, when given,
 * is kept pointing at the element too, for callers that also need the node.
 */
export function useWidth<T extends HTMLElement = HTMLElement>(target?: RefObject<T | null>): [number, RefCallback<T>] {
  const [w, setW] = useState(0)
  const ro = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: T | null) => {
    if (target) target.current = el
    ro.current?.disconnect()
    ro.current = null
    if (!el) return
    setW(el.clientWidth)
    const obs = new ResizeObserver(() => setW(el.clientWidth))
    obs.observe(el)
    ro.current = obs
  }, [target])
  useEffect(() => () => { ro.current?.disconnect(); ro.current = null }, [])
  return [w, ref]
}
