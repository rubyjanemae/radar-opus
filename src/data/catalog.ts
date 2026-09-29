import { Repertory } from './repertory'
import type { MateriaMedicaEntry, MateriaMedicaFile, Remedy, RepertoryFile, RepertoryInfo, RubricRef } from './types'

const BASE = `${import.meta.env.BASE_URL}data/`

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(BASE + file)
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`)
  return res.json() as Promise<T>
}

/** All reference data: remedies, repertories (loaded on demand) and materia medica. */
export class Catalog {
  readonly remedies: Map<number, Remedy>
  readonly remedyByAbbrev: Map<string, Remedy>
  readonly repertoryInfos: RepertoryInfo[]
  private readonly loaded = new Map<string, Repertory>()
  private readonly loading = new Map<string, Promise<Repertory>>()
  private mm: Map<number, MateriaMedicaEntry> | null = null
  mmInfo: Omit<MateriaMedicaFile, 'remedies'> | null = null

  constructor(remedies: Remedy[], infos: RepertoryInfo[]) {
    this.remedies = new Map(remedies.map(r => [r.id, r]))
    this.remedyByAbbrev = new Map(remedies.map(r => [r.abbrev.toLowerCase(), r]))
    this.repertoryInfos = infos
  }

  static async load(): Promise<Catalog> {
    const [rows, infos] = await Promise.all([
      getJson<[number, string, string, string | null][]>('remedies.json'),
      getJson<RepertoryInfo[]>('repertories.json'),
    ])
    return new Catalog(rows.map(([id, abbrev, name, altName]) => ({ id, abbrev, name, altName })), infos)
  }

  remedy(id: number): Remedy {
    return this.remedies.get(id) ?? { id, abbrev: `#${id}`, name: `Unknown remedy ${id}`, altName: null }
  }

  repertory(abbrev: string): Repertory | undefined { return this.loaded.get(abbrev) }

  loadRepertory(abbrev: string): Promise<Repertory> {
    const hit = this.loaded.get(abbrev)
    if (hit) return Promise.resolve(hit)
    let p = this.loading.get(abbrev)
    if (!p) {
      const info = this.repertoryInfos.find(r => r.abbrev === abbrev)
      if (!info) return Promise.reject(new Error(`Unknown repertory ${abbrev}`))
      p = getJson<RepertoryFile>(info.file).then(f => {
        const rep = new Repertory(info, f)
        this.loaded.set(abbrev, rep)
        return rep
      })
      p.catch(() => this.loading.delete(abbrev))
      this.loading.set(abbrev, p)
    }
    return p
  }

  async loadMateriaMedica(): Promise<Map<number, MateriaMedicaEntry>> {
    if (this.mm) return this.mm
    const f = await getJson<MateriaMedicaFile>('mm-boericke.json')
    const { remedies, ...info } = f
    this.mmInfo = info
    this.mm = new Map(remedies.map(r => [r.remedyId, r]))
    return this.mm
  }

  /** Resolve a RubricRef against loaded repertories. */
  resolve(ref: RubricRef): { rep: Repertory; index: number } | null {
    const i = ref.lastIndexOf(':')
    const rep = this.loaded.get(ref.slice(0, i))
    const index = Number(ref.slice(i + 1))
    return rep && index >= 0 && index < rep.size ? { rep, index } : null
  }
}

export function parseRef(ref: RubricRef): { repertory: string; index: number } {
  const i = ref.lastIndexOf(':')
  return { repertory: ref.slice(0, i), index: Number(ref.slice(i + 1)) }
}
