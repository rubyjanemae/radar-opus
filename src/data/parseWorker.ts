/**
 * Parses a repertory file off the main thread: JSON text in, columns out, with the numeric
 * columns as Int32Arrays whose buffers are transferred (no copy). See parseRepertory().
 */
import type { RepertoryFile } from './types'

/** kind 'repertory' (default) converts the numeric columns; 'json' just parses (e.g. the materia medica). */
export interface ParseRequest { id: number; buffer: ArrayBuffer; kind?: 'repertory' | 'json' }
export type ParseResponse = { id: number; file: unknown } | { id: number; error: string }

const NUMERIC = ['parent', 'depth', 'chapter', 'offsets', 'data'] as const

const scope = self as unknown as { onmessage: ((e: MessageEvent<ParseRequest>) => void) | null; postMessage(m: ParseResponse, transfer: Transferable[]): void }

scope.onmessage = ({ data: { id, buffer, kind } }) => {
  try {
    if (kind === 'json') { scope.postMessage({ id, file: JSON.parse(new TextDecoder().decode(buffer)) as unknown }, []); return }
    const f = JSON.parse(new TextDecoder().decode(buffer)) as RepertoryFile
    const transfer: Transferable[] = []
    for (const k of NUMERIC) {
      const col = Int32Array.from(f[k])
      f[k] = col
      transfer.push(col.buffer)
    }
    scope.postMessage({ id, file: f }, transfer)
  } catch (e) {
    scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) }, [])
  }
}
