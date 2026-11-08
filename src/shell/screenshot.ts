import { downloadBlob } from '../ui/files'

/** The browser can capture the screen (a tab, a window or a whole screen) for "Take a screenshot". */
export const canTakeScreenshot = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function'

const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

/**
 * RadarOpus's Screenshot (toolbar, Tools › Take a screenshot): a picture of the window saved as a PNG.
 * The browser asks which surface to share (this tab is offered first); one frame of it is saved, then
 * the capture stops. Resolves to the file name, or null when the user cancelled the browser's prompt.
 */
export async function takeScreenshot(): Promise<string | null> {
  if (!canTakeScreenshot()) throw new Error('This browser cannot take screenshots.')
  let stream: MediaStream
  try {
    // preferCurrentTab / selfBrowserSurface (Chromium) offer this tab first; other browsers ignore them
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions)
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return null
    throw e
  }
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await video.play()
    // the browser's "sharing this tab" bar can shift the page for a moment: wait two frames
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    video.pause()
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('The screenshot could not be encoded.')
    const name = `Radar Opus ${stamp()}.png`
    downloadBlob(blob, name)
    return name
  } finally {
    for (const t of stream.getTracks()) t.stop()
  }
}
