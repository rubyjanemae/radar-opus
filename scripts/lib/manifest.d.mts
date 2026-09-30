export const DATA_DIR: string
export const MANIFEST: string
export function contentHash(buf: Uint8Array): string
export function computeManifest(dir?: string): Record<string, string>
export function writeManifest(dir?: string, file?: string): Record<string, string>
