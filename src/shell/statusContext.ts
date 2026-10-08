import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * What the shown document says about itself in the status bar's left segment (e.g. an analysis:
 * "Sympt + Deg · 11 symptoms · 125 remedies · Top 30"). A document publishes it while it is visible;
 * the status bar falls back to its own text (rubric path, "Ready") when nothing is published.
 */
export const useStatusContext = create<{ owner: string | null; text: string | null }>(() => ({ owner: null, text: null }))

/** Publish `text` for the status bar while the calling component is shown. `owner` is the tab id. */
export function usePublishStatus(owner: string, text: string | null) {
  useEffect(() => {
    useStatusContext.setState({ owner, text })
  }, [owner, text])
  useEffect(() => () => {
    if (useStatusContext.getState().owner === owner) useStatusContext.setState({ owner: null, text: null })
  }, [owner])
}
