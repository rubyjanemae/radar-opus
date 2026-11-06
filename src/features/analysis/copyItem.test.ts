import { describe, expect, it } from 'vitest'
import { copyCursor, setCopyCursor } from './copyItem'

describe('analysis copy cursor', () => {
  const item = { full: 'MIND - ABRUPT: Tarent.', text: 'MIND - ABRUPT', what: 'Copied' }

  it('reads the cursor of a visible grid only', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const off = setCopyCursor(() => el, () => item)
    // jsdom lays nothing out: a hidden (background) grid has no client rects
    expect(copyCursor()).toBeNull()
    el.getClientRects = () => ({ length: 1 }) as DOMRectList
    expect(copyCursor()).toEqual(item)
    off()
    expect(copyCursor()).toBeNull()
    el.remove()
  })
})
