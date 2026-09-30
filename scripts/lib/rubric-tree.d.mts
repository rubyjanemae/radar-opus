export interface TreeNode { text: string; children: TreeNode[]; parent: TreeNode | null; mergedInto?: TreeNode; synthetic?: boolean }
export const TIMES: Record<string, { names: string[]; start: number }[]>
export const CONNECTORS: Record<string, Set<string>>
export function timeSlot(text: string, lang: string): number
export function parseClock(text: string, lang?: string): { start: number; end: number | null } | null
export function childComparator(lang: string, parentText: string | null): (a: { text: string }, b: { text: string }) => number
export function isConnector(text: string, lang: string): boolean
export function foldConnectors<N extends TreeNode>(roots: N[], lang: string, sameEntries: (parent: N, child: N) => boolean): number
export type PathNode<X> = X & { path: string; text: string; parent: PathNode<X> | null; children: PathNode<X>[]; synthetic?: boolean }
export const MIN_HEADING_CHILDREN: number
export function linkParents<X extends { path: string }>(nodes: X[], makeSynthetic: (path: string) => Omit<X, 'path'>, opts?: { lang?: string; minChildren?: number }): { roots: PathNode<X>[]; synthetic: PathNode<X>[] }
export function duplicatePaths(rows: { path: string }[]): { path: string; count: number }[]
