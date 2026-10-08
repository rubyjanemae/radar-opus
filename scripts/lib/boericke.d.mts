export interface BoerickeRemedy { id: number; abbrev: string; name: string; altName: string | null }
export interface BoerickeEntry { remedyId: number; heading: string; commonName: string; intro: string; sections: { heading: string; text: string }[] }
export const HEADING_VARIANTS: Record<string, string>
export function headingNamesRemedy(heading: string, remedy: BoerickeRemedy): boolean
export function buildBoericke(
  chapters: (string | null)[][],
  sections: (string | null)[][],
  remedies: BoerickeRemedy[],
): { entries: BoerickeEntry[]; log: string[] }
export function isRelationshipHeading(heading: string | null | undefined): boolean
export function splitTrailingRelationships(sections: { heading: string; text: string }[]): { sections: { heading: string; text: string }[]; split: string[] }
