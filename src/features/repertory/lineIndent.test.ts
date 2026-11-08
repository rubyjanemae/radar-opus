import { describe, expect, it } from 'vitest'
import { BOOK, lineIndent } from './estimate'

describe('lineIndent', () => {
  it('hangs wrapped lines at the level marker down to level 4', () => {
    for (const d of [1, 2, 3, 4]) expect(lineIndent(d)).toEqual({ pad: BOOK.text + (d - 1) * BOOK.indent, first: 0 })
  })
  it('wraps deeper levels at the level-4 indent, the first line still at its own marker', () => {
    expect(lineIndent(5)).toEqual({ pad: BOOK.text + 3 * BOOK.indent, first: BOOK.indent })
    expect(lineIndent(6)).toEqual({ pad: BOOK.text + 3 * BOOK.indent, first: 2 * BOOK.indent })
  })
})
