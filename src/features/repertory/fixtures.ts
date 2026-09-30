import { Repertory } from '../../data/repertory'
import type { RepertoryFile, RepertoryInfo } from '../../data/types'

/** Two chapters: Mind(0) > fear(1) > alone(2), fear > night(3), Mind > anger(4); Head(5) > pain(6). */
export function tinyRepertory(): Repertory {
  const file: RepertoryFile = {
    abbrev: 't', title: 'Tiny', lang: 'en', chapters: [0, 5],
    text: ['Mind', 'fear', 'alone', 'night', 'anger', 'Head', 'pain'],
    parent: [-1, 0, 1, 1, 0, -1, 5],
    depth: [0, 1, 2, 2, 1, 0, 1],
    chapter: [0, 0, 0, 0, 0, 1, 1],
    offsets: [0, 0, 2, 3, 4, 5, 5, 7],
    data: [1 * 4 + 2, 2 * 4 + 0, 1 * 4 + 3, 3 * 4 + 1, 2 * 4 + 0, 1 * 4 + 0, 3 * 4 + 2],
  }
  const info: RepertoryInfo = { abbrev: 't', title: 'Tiny', fullTitle: 'Tiny', lang: 'en', author: '', year: null, publisher: '', license: '', rubricCount: 7, entryCount: 7, file: '' }
  return new Repertory(info, file)
}
