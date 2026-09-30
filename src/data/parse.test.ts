// @vitest-environment node
// Pure logic: no DOM needed, so skip the jsdom setup.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseJsonOffThread, parseRepertory } from './parse'
import type { ParseResponse } from './parseWorker'
import type { RepertoryFile } from './types'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

const bytes = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer
const file = { abbrev: 'x', title: 'X', lang: 'en', chapters: [0], text: ['Mind', 'fear'], parent: [-1, 0], depth: [0, 1], chapter: [0, 0], offsets: [0, 0, 1], data: [7] }

describe('parseRepertory', () => {
  it('parses on the main thread where there is no Worker', async () => {
    expect(typeof Worker).toBe('undefined')
    expect(await parseRepertory(bytes(file))).toEqual(file)
    expect(await parseJsonOffThread(bytes({ a: [1] }))).toEqual({ a: [1] })
    await expect(parseRepertory(new TextEncoder().encode('{"text": [').buffer as ArrayBuffer)).rejects.toThrow(SyntaxError)
  })
})

describe('parse worker', () => {
  it('returns Int32Array columns and transfers their buffers; reports bad JSON', async () => {
    const posted: { msg: ParseResponse; transfer: Transferable[] }[] = []
    const scope = { onmessage: null as null | ((e: { data: unknown }) => void), postMessage: (msg: ParseResponse, transfer: Transferable[]) => posted.push({ msg, transfer }) }
    vi.stubGlobal('self', scope)
    await import('./parseWorker')
    scope.onmessage!({ data: { id: 1, buffer: bytes(file) } })
    const ok = posted[0].msg
    if (!('file' in ok)) throw new Error('expected a file')
    expect(ok.id).toBe(1)
    const f = ok.file as RepertoryFile
    expect(f.data).toBeInstanceOf(Int32Array)
    expect(Array.from(f.parent)).toEqual([-1, 0])
    expect(f.text).toEqual(['Mind', 'fear'])
    expect(posted[0].transfer).toHaveLength(5)
    scope.onmessage!({ data: { id: 2, buffer: bytes('x').slice(0, 2) } })
    expect(posted[1].msg).toMatchObject({ id: 2, error: expect.any(String) })
    // plain JSON files (the materia medica) come back as parsed, with nothing transferred
    scope.onmessage!({ data: { id: 3, buffer: bytes({ remedies: [{ remedyId: 5 }] }), kind: 'json' } })
    expect(posted[2].msg).toEqual({ id: 3, file: { remedies: [{ remedyId: 5 }] } })
    expect(posted[2].transfer).toHaveLength(0)
  })
})
