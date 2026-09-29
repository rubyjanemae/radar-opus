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
  rubricCount: number
  entryCount: number
  file: string
}

/** On-disk columnar repertory (public/data/rep-*.json), rubrics in book order. */
export interface RepertoryFile {
  abbrev: string
  title: string
  lang: string
  chapters: number[]
  text: string[]
  parent: number[]
  depth: number[]
  chapter: number[]
  /** rubric i owns data[offsets[i] .. offsets[i+1]) */
  offsets: number[]
  /** remedyId * 4 + (grade - 1) */
  data: number[]
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
