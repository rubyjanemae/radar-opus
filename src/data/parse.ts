import type { ParseRequest, ParseResponse } from './parseWorker'
import type { RepertoryFile } from './types'

/**
 * Parse a repertory file's bytes. Uses a shared worker thread when the platform has one, so
 * loading a 6 MB book (e.g. the idle prefetch) does not block input; falls back to the main thread.
 */
export function parseRepertory(buffer: ArrayBuffer): Promise<RepertoryFile> {
  return parseIn<RepertoryFile>(buffer, 'repertory')
}

/**
 * Parse any JSON data file off the main thread (the 1.4 MB materia medica would otherwise be a
 * long task on first open); falls back to the main thread without a worker.
 */
export function parseJsonOffThread<T>(buffer: ArrayBuffer): Promise<T> {
  return parseIn<T>(buffer, 'json')
}

function parseIn<T>(buffer: ArrayBuffer, kind: 'repertory' | 'json'): Promise<T> {
  const w = worker()
  if (!w) { try { return Promise.resolve(parseHere(buffer) as T) } catch (e) { return Promise.reject(e) } }
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (f: unknown) => void, reject, buffer })
    // copied, not transferred: the bytes stay here in case the worker cannot start
    w.postMessage({ id, buffer, kind } satisfies ParseRequest)
  })
}

function parseHere(buffer: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(buffer))
}

let seq = 0
let instance: Worker | null | undefined
const pending = new Map<number, { resolve: (f: unknown) => void; reject: (e: Error) => void; buffer: ArrayBuffer }>()

function worker(): Worker | null {
  if (instance !== undefined) return instance
  if (typeof Worker === 'undefined') return (instance = null)
  try {
    const w = new Worker(new URL('./parseWorker.ts', import.meta.url), { type: 'module', name: 'repertory-parser' })
    w.onmessage = (e: MessageEvent<ParseResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if ('file' in e.data) p.resolve(e.data.file)
      else p.reject(new SyntaxError(e.data.error))
    }
    // the worker could not start (blocked, unsupported): finish the waiting parses here and stop using it
    w.onerror = e => {
      e.preventDefault()
      instance = null
      w.terminate()
      for (const [id, p] of pending) {
        pending.delete(id)
        try { p.resolve(parseHere(p.buffer)) } catch (err) { p.reject(err instanceof Error ? err : new Error(String(err))) }
      }
    }
    return (instance = w)
  } catch {
    return (instance = null)
  }
}
