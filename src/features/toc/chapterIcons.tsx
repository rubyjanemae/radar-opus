/**
 * Radar Opus chapter icon set: an original glyph per repertory chapter, drawn as simple white
 * strokes on a soft gradient rounded square. The square's colours come from CSS variables per body
 * system (`--chi-<group>-a` / `-b` in toc.css), so the set follows the light and dark themes.
 *
 *   <ChapterIcon name="Head" size={32} />        // English (Publicum) or German (Kent) chapter names
 *   chapterIconKey('Gemüt') === 'mind'
 */
import { memo } from 'react'
import type { ReactNode } from 'react'
import './toc.css'

export type ChapterGroup = 'neuro' | 'senses' | 'oral' | 'digest' | 'urinary' | 'genital' | 'resp' | 'circ' | 'motor' | 'fever' | 'skin' | 'general'

interface Glyph { group: ChapterGroup; d: ReactNode }

const P = (d: string) => <path d={d} />
const C = (cx: number, cy: number, r: number, fill = false) => <circle cx={cx} cy={cy} r={r} className={fill ? 'chi-fill' : undefined} />

/** Glyphs in a 24x24 box, stroked by the tile's foreground colour. */
const GLYPHS: Record<string, Glyph> = {
  mind: { group: 'neuro', d: <>{P('M8 21v-3.4A7 7 0 1 1 18.6 11l1.7 2.9-1.7.6v2.4a2 2 0 0 1-2 2H14v2')}{P('M10 8.5c.6-1.2 2.6-1.4 3.4-.2.9-.4 2 .4 1.7 1.5.8.7.4 2-.6 2.1-.4 1-1.8 1.1-2.4.3-1 .5-2.3-.3-2.1-1.3-.9-.5-.8-1.9 0-2.4z')}</> },
  vertigo: { group: 'neuro', d: P('M12 12a1.5 1.5 0 0 1 1.5 1.5 3 3 0 0 1-3 3 4.5 4.5 0 0 1-4.5-4.5 6 6 0 0 1 6-6 7.5 7.5 0 0 1 7.5 7.5 8.5 8.5 0 0 1-2 5.5') },
  head: { group: 'senses', d: <>{P('M12 5c3.3 0 5.6 2.7 5.6 6.4 0 4.2-2.6 7.1-5.6 7.1s-5.6-2.9-5.6-7.1C6.4 7.7 8.7 5 12 5z')}{P('M9.7 17.7v3.8M14.3 17.7v3.8')}{P('M6.4 10.6c-1.1-.2-1.6.6-1.4 1.6.2 1.1.9 1.7 1.7 1.6M17.6 10.6c1.1-.2 1.6.6 1.4 1.6-.2 1.1-.9 1.7-1.7 1.6')}{P('M12 1.5v1.8M7.2 2.6l.9 1.4M16.8 2.6l-.9 1.4')}</> },
  eye: { group: 'senses', d: <>{P('M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z')}{C(12, 12, 3)}{C(12, 12, 1.1, true)}</> },
  vision: { group: 'senses', d: <>{C(7, 13.5, 3.5)}{C(17, 13.5, 3.5)}{P('M10.5 13.2c1-.8 2-.8 3 0M3.5 13 2.5 8.5M20.5 13l1-4.5')}</> },
  ear: { group: 'senses', d: <>{P('M7.5 9.5a5 5 0 0 1 10 0c0 3-2.4 4-3.4 6-.9 1.8-1 4.5-3.6 4.5a3 3 0 0 1-3-3')}{P('M10.5 10a2 2 0 0 1 4 0c0 1.5-1.6 2-1.6 3.5')}</> },
  hearing: { group: 'senses', d: <>{C(5.5, 12, 1.6, true)}{P('M9.5 8.5a5 5 0 0 1 0 7M13 6a8.5 8.5 0 0 1 0 12M16.5 3.5a12 12 0 0 1 0 17')}</> },
  nose: { group: 'senses', d: <>{P('M11.5 3.5c0 4.5-.8 7.3-3.4 10.3a2.6 2.6 0 0 0 1.9 4.4c.9 0 1.5-.4 2-1 .5.6 1.1 1 2 1a2.6 2.6 0 0 0 1.9-4.4')}{C(10.3, 16, .6, true)}{C(13.7, 16, .6, true)}</> },
  face: { group: 'senses', d: <>{C(12, 12, 8.5)}{C(9, 10, .9, true)}{C(15, 10, .9, true)}{P('M8.5 14.5a4 4 0 0 0 7 0')}</> },
  mouth: { group: 'oral', d: <>{P('M3 12c2-3 4.5-4.5 6-4.5 1.2 0 2.2.8 3 .8s1.8-.8 3-.8c1.5 0 4 1.5 6 4.5-2 3-5 5-9 5s-7-2-9-5z')}{P('M3 12h18')}</> },
  teeth: { group: 'oral', d: P('M7.5 3.5C5.3 3.5 4 5.2 4 7.6c0 3 1.5 4.4 2 6.9.5 2.6.8 6 2.3 6 1.6 0 1.5-4 2.6-5.5.4-.6 1.8-.6 2.2 0 1.1 1.5 1 5.5 2.6 5.5 1.5 0 1.8-3.4 2.3-6 .5-2.5 2-3.9 2-6.9 0-2.4-1.3-4.1-3.5-4.1-2 0-3 1-4.5 1s-2.5-1-4.5-1z') },
  throat: { group: 'oral', d: <>{P('M4.5 20v-8.5a7.5 7.5 0 0 1 15 0V20')}{P('M12 5.5v5')}{C(12, 11.8, 1.3)}{P('M7.5 20c1.5-2.6 7.5-2.6 9 0')}</> },
  extThroat: { group: 'oral', d: <>{P('M6.5 3.5c1.6 2 9.4 2 11 0')}{P('M9 5.6V11c0 2.6-4 3.8-5.5 8M15 5.6V11c0 2.6 4 3.8 5.5 8')}{P('M12 12.4c-.9-1.4-3-1.1-3 .4 0 1.4 2 1.7 3 .4 1 1.3 3 1 3-.4 0-1.5-2.1-1.8-3-.4z')}</> },
  appetite: { group: 'digest', d: <>{P('M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 3v18')}{P('M17.5 21V3c-2 1.5-3 4-3 7 0 1.6.8 2.6 3 2.6')}</> },
  stomach: { group: 'digest', d: P('M10 3v3.2c0 1 .6 2 1.6 2.5C16 10.5 19 12.3 19 15.6A5.4 5.4 0 0 1 13.6 21c-3 0-4-1.6-6-1.6-1.4 0-2.5.6-3.6 1.6') },
  abdomen: { group: 'digest', d: <>{P('M6.5 3c0 6-1.5 9-1.5 13 0 3 3 5 7 5s7-2 7-5c0-4-1.5-7-1.5-13')}{C(12, 13, 1.1)}</> },
  rectum: { group: 'digest', d: <>{P('M12 7.5C11 5.5 9.2 4.5 7.4 4.5 4.9 4.5 3.6 7 3.6 10.4c0 4.6 2.6 8.6 6 8.6 1.5 0 2.4-.9 2.4-2.6 0 1.7.9 2.6 2.4 2.6 3.4 0 6-4 6-8.6 0-3.4-1.3-5.9-3.8-5.9-1.8 0-3.6 1-4.6 3z')}{P('M12 7.5v8')}</> },
  stool: { group: 'digest', d: <>{P('M6.5 20h11a2.6 2.6 0 0 0 0-5.2h-11a2.6 2.6 0 0 0 0 5.2z')}{P('M8.3 14.8h7.4a2.3 2.3 0 0 0 0-4.6H8.3a2.3 2.3 0 0 0 0 4.6z')}{P('M10 10.2h4a2 2 0 0 0 .4-4C14 5 13.2 4 12 4')}</> },
  bladder: { group: 'urinary', d: <>{P('M5 8.5c0-2.6 3-4.2 7-4.2s7 1.6 7 4.2c0 4.4-2.8 7.8-5.4 8.8v3.2h-3.2v-3.2C7.8 16.3 5 12.9 5 8.5z')}{P('M5.6 10.6c2.1-1 4.3-1 6.4 0s4.3 1 6.4 0')}</> },
  kidneys: { group: 'urinary', d: <>{P('M8 4C5 4 3.5 7 3.5 11S5 18 8 18c1.6 0 2.5-1.2 2.5-2.5 0-1.6-1.5-2.5-1.5-4.5s1.5-2.9 1.5-4.5C10.5 5.2 9.6 4 8 4z')}{P('M16 4c3 0 4.5 3 4.5 7S19 18 16 18c-1.6 0-2.5-1.2-2.5-2.5 0-1.6 1.5-2.5 1.5-4.5s-1.5-2.9-1.5-4.5C13.5 5.2 14.4 4 16 4z')}</> },
  prostate: { group: 'urinary', d: <>{P('M10.5 2.5v19M13.5 2.5v19')}{P('M10.5 7.5C6.6 7.5 4.5 10 4.5 13.2s2.1 5.8 6 5.8M13.5 7.5c3.9 0 6 2.5 6 5.7s-2.1 5.8-6 5.8')}</> },
  urethra: { group: 'urinary', d: <>{P('M9.5 3v8a2.5 2.5 0 0 0 5 0V3')}{P('M12 15.5c-1.6 2-2.4 3.1-2.4 4.1a2.4 2.4 0 0 0 4.8 0c0-1-.8-2.1-2.4-4.1z')}</> },
  urine: { group: 'urinary', d: <>{P('M6.5 3.5h11v3h-11z')}{P('M7.5 6.5 8.6 19a1.6 1.6 0 0 0 1.6 1.5h3.6a1.6 1.6 0 0 0 1.6-1.5l1.1-12.5')}{P('M8.2 12.5h7.6')}</> },
  male: { group: 'genital', d: <>{C(10, 14, 5.5)}{P('M14 10l6-6M15 4h5v5')}</> },
  female: { group: 'genital', d: <>{C(12, 9, 5.5)}{P('M12 14.5V21M9 18h6')}</> },
  larynx: { group: 'resp', d: <>{P('M9 3v18M15 3v18')}{P('M9 7h6M9 11h6M9 15h6M9 19h6')}</> },
  respiration: { group: 'resp', d: P('M3 8.5h11a3 3 0 1 0-3-3M3 12.5h15a3 3 0 1 1-3 3M3 16.5h6') },
  cough: { group: 'resp', d: <>{P('M3.5 12c0-2.6 1.6-4.5 3.6-4.5s3.6 1.9 3.6 4.5-1.6 4.5-3.6 4.5-3.6-1.9-3.6-4.5z')}{P('M13.5 9.2 17 7M14 12h4.5M13.5 14.8 17 17')}{C(20, 5.6, .9, true)}{C(20.6, 12, .9, true)}{C(20, 18.4, .9, true)}</> },
  expectoration: { group: 'resp', d: <>{P('M4 13.5h16a8 8 0 0 1-16 0z')}{P('M9.4 4.6c1.4-1.3 4-1.4 5.3-.1 1.3 1.2.9 3.6-.8 4.4-1.6.8-3.7.6-4.7-.5-.9-1-.9-2.8.2-3.8z')}</> },
  chest: { group: 'resp', d: <>{P('M12 3v7M12 10l-2.2 1.6M12 10l2.2 1.6')}{P('M9.5 6.5C6 7 3 12.5 3 17c0 1.8 1 3 2.6 3 3 0 4.4-4 4.4-8.5V7.5')}{P('M14.5 6.5c3.5.5 6.5 6 6.5 10.5 0 1.8-1 3-2.6 3-3 0-4.4-4-4.4-8.5V7.5')}</> },
  heart: { group: 'circ', d: <>{P('M12 20s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15.4 12 20 12 20z')}{P('M6.5 12.5h3l1.3-2.3 2 4.6 1.4-2.3h3.3')}</> },
  blood: { group: 'circ', d: <>{P('M3 10c0-3 2.7-5 6.5-5S16 7 16 10s-2.7 5-6.5 5S3 13 3 10z')}{P('M7.3 10c0-.9 1-1.5 2.2-1.5s2.2.6 2.2 1.5-1 1.5-2.2 1.5-2.2-.6-2.2-1.5z')}{P('M17.2 9.6c2.4.6 3.8 2.3 3.8 4.4 0 3-2.7 5-6.5 5-2.6 0-4.7-.9-5.8-2.4')}</> },
  back: { group: 'motor', d: <>{P('M10 3.5h4v2.6h-4zM9.5 8h5v2.8h-5zM9 12.7h6v2.8H9zM9.5 17.4h5v2.8h-5z')}{P('M6 9.5c1 .3 2 .3 3.5 0M18 9.5c-1 .3-2 .3-3.5 0M5.5 14c1.3.3 2.3.3 3.5 0M18.5 14c-1.3.3-2.3.3-3.5 0')}</> },
  extremities: { group: 'motor', d: P('M7 3.3a2.1 2.1 0 0 0-3 3 2.1 2.1 0 0 0 1.3 3.5c.6 0 1.1-.2 1.5-.6l8.3 8.3c-.4.4-.6.9-.6 1.5a2.1 2.1 0 0 0 3.5 1.3 2.1 2.1 0 0 0 3-3 2.1 2.1 0 0 0-1.3-3.5c-.6 0-1.1.2-1.5.6L9.9 5.1c.4-.4.6-.9.6-1.5A2.1 2.1 0 0 0 7 3.3z') },
  sleep: { group: 'neuro', d: <>{P('M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z')}{P('M14.5 3.5h4l-4 4h4')}</> },
  chill: { group: 'fever', d: <>{P('M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9')}{P('M9.6 4.4 12 6.2l2.4-1.8M9.6 19.6l2.4-1.8 2.4 1.8')}</> },
  fever: { group: 'fever', d: <>{P('M10 14.3V5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z')}{P('M12 9.5v7.5')}{P('M16.5 6h2.5M16.5 9h2.5')}</> },
  perspiration: { group: 'fever', d: <>{P('M2.5 19.5c3-1.6 6-1.6 9.5 0s6.5 1.6 9.5 0')}{P('M6 9.5s-2.2 2.6-2.2 4.1a2.2 2.2 0 0 0 4.4 0C8.2 12.1 6 9.5 6 9.5z')}{P('M12 4s-2.8 3.3-2.8 5.2a2.8 2.8 0 0 0 5.6 0C14.8 7.3 12 4 12 4z')}{P('M18 9.5s-2.2 2.6-2.2 4.1a2.2 2.2 0 0 0 4.4 0c0-1.5-2.2-4.1-2.2-4.1z')}</> },
  skin: { group: 'skin', d: <>{P('M3 9.5c3-2 6 2 9 0s6-2 9 0')}{P('M3 14.5h18M3 19h18')}{P('M8 14.5V10M15.5 14.5V9.6')}</> },
  generalities: { group: 'general', d: <>{C(12, 12, 9.5)}{C(12, 7.4, 1.7)}{P('M12 9.8v5.2M8 11.6h8M12 15l-2.6 3.8M12 15l2.6 3.8')}</> },
  clinical: { group: 'general', d: <>{P('M6.5 3v5a4.5 4.5 0 0 0 9 0V3')}{P('M11 12.5v2.5a4.5 4.5 0 0 0 9 0v-2')}{C(20, 11, 1.8)}{P('M5 3h3M14 3h3')}</> },
  book: { group: 'general', d: <>{P('M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z')}{P('M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3')}</> },
}

/** Chapter names (English and German, folded to lower case) to glyph keys. */
const NAMES: Record<string, string> = {
  mind: 'mind', 'gemüt': 'mind', gemut: 'mind',
  vertigo: 'vertigo', schwindel: 'vertigo',
  head: 'head', kopf: 'head',
  eye: 'eye', eyes: 'eye', auge: 'eye', augen: 'eye',
  vision: 'vision', sehen: 'vision',
  ear: 'ear', ears: 'ear', ohr: 'ear', ohren: 'ear',
  hearing: 'hearing', 'gehör': 'hearing', gehor: 'hearing',
  nose: 'nose', nase: 'nose',
  face: 'face', gesicht: 'face',
  mouth: 'mouth', mund: 'mouth',
  teeth: 'teeth', 'zähne': 'teeth', zahne: 'teeth',
  throat: 'throat', hals: 'throat',
  'external throat': 'extThroat', 'hals-außenseite': 'extThroat', 'hals-aussenseite': 'extThroat',
  appetite: 'appetite', appetit: 'appetite',
  stomach: 'stomach', magen: 'stomach',
  abdomen: 'abdomen', bauch: 'abdomen',
  rectum: 'rectum', mastdarm: 'rectum',
  stool: 'stool', stuhl: 'stool',
  bladder: 'bladder', blase: 'bladder',
  kidneys: 'kidneys', kidney: 'kidneys', nieren: 'kidneys',
  'prostate gland': 'prostate', prostate: 'prostate', prostata: 'prostate',
  urethra: 'urethra', 'harnröhre': 'urethra',
  urine: 'urine', urin: 'urine', harn: 'urine',
  'genitalia male': 'male', 'male genitalia': 'male', 'geschlechtsorgane männlich': 'male', 'männliche geschlechtsorgane': 'male',
  'genitalia female': 'female', 'female genitalia': 'female', 'geschlechtsorgane weiblich': 'female', 'weibliche geschlechtsorgane': 'female',
  'larynx and trachea': 'larynx', larynx: 'larynx', 'kehlkopf und luftröhre': 'larynx', kehlkopf: 'larynx',
  respiration: 'respiration', atmung: 'respiration',
  cough: 'cough', husten: 'cough',
  expectoration: 'expectoration', auswurf: 'expectoration',
  chest: 'chest', brust: 'chest',
  'heart & circulation': 'heart', 'heart and circulation': 'heart', heart: 'heart', herz: 'heart', 'herz und kreislauf': 'heart',
  back: 'back', 'rücken': 'back', rucken: 'back',
  extremities: 'extremities', 'extremitäten': 'extremities', glieder: 'extremities',
  sleep: 'sleep', schlaf: 'sleep',
  chill: 'chill', frost: 'chill',
  fever: 'fever', fieber: 'fever',
  perspiration: 'perspiration', 'schweiß': 'perspiration', schweiss: 'perspiration',
  skin: 'skin', haut: 'skin',
  blood: 'blood', blut: 'blood',
  generalities: 'generalities', generals: 'generalities', allgemeines: 'generalities',
  clinical: 'clinical', klinik: 'clinical', klinisches: 'clinical',
}

/** Glyph key of a chapter name; 'book' for a chapter the set has no glyph for. */
export function chapterIconKey(name: string): string {
  return NAMES[name.trim().toLocaleLowerCase()] ?? 'book'
}

/** Every glyph key of the set (for tests and previews). */
export const CHAPTER_ICON_KEYS = Object.keys(GLYPHS)

export function chapterIconGroup(key: string): ChapterGroup { return (GLYPHS[key] ?? GLYPHS.book).group }

/** A chapter tile: the glyph on its rounded gradient square. Decorative: name the control that holds it. */
export const ChapterIcon = memo(function ChapterIcon({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const key = chapterIconKey(name)
  const g = GLYPHS[key] ?? GLYPHS.book
  return (
    // the glyph fills most of the tile with a bold stroke, so the tiles read at a glance without captions
    <span className={`chi chi-${g.group}${className ? ` ${className}` : ''}`} data-icon={key} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.84)} height={Math.round(size * 0.84)} fill="none" stroke="currentColor"
        strokeWidth={size >= 40 ? 1.7 : size >= 24 ? 2 : 2.2} strokeLinecap="round" strokeLinejoin="round">{g.d}</svg>
    </span>
  )
})
