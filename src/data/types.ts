/** Remedy grade as printed in the repertory: 1 plain, 2 italic, 3 bold, 4 bold caps. */
export type Grade = 1 | 2 | 3 | 4

export interface Remedy {
  id: number
  abbrev: string
  name: string
  altName: string | null
}

export interface RepertoryInfo {
  abbrev: string
  title: string
  fullTitle: string
  lang: string
  author: string
  year: number | null
  publisher: string
  license: string
  /** Source rubrics (rows of the source database, duplicate full paths included); synthetic headings are not counted. */
  rubricCount: number
  /** Distinct full paths of the source (duplicates merged into one rubric). */
  uniquePaths?: number
  /** Rubrics in the file (after merging duplicates and folding connectors, synthetic headings included). */
  nodeCount?: number
  /** Synthetic headings created for missing intermediate paths (no remedies). */
  syntheticCount?: number
  /** Full paths that occurred more than once in the source and were merged. */
  duplicatePaths?: number
  entryCount: number
  file: string
}

/** A numeric column: a plain array as read from JSON, or an Int32Array when parsed off the main thread. */
export type IntColumn = ArrayLike<number>

/** On-disk columnar repertory (public/data/rep-*.json), rubrics in book order. */
export interface RepertoryFile {
  abbrev: string
  title: string
  lang: string
  chapters: number[]
  text: string[]
  parent: IntColumn
  depth: IntColumn
  chapter: IntColumn
  /** rubric i owns data[offsets[i] .. offsets[i+1]) */
  offsets: IntColumn
  /** remedyId * 4 + (grade - 1) */
  data: IntColumn
  /** Indexes of synthetic headings (a missing intermediate path of the source; no remedies). Absent in older files. */
  synthetic?: number[]
}

/** Globally unique rubric reference: "<repertory>:<index>". */
export type RubricRef = string

export interface RemedyEntry {
  remedyId: number
  grade: Grade
}

export interface MateriaMedicaSection {
  heading: string
  text: string
}

export interface MateriaMedicaEntry {
  remedyId: number
  heading: string
  commonName: string
  intro: string
  sections: MateriaMedicaSection[]
}

export interface MateriaMedicaFile {
  abbrev: string
  lang: string
  title: string
  author: string
  year: number
  publisher: string
  license: string
  remedies: MateriaMedicaEntry[]
}
