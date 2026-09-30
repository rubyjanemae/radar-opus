import { useEffect, useRef, useState } from 'react'
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { strategyInfo } from '../../engine/analysis'
import { DEFAULT_PARAMS, mergeParams } from '../../engine/model'
import type { AnalysisOptions, StrategyId, StrategyParams } from '../../engine/model'

type Group = keyof StrategyParams

interface NumSpec { kind: 'num'; path: string[]; label: string; hint: string; min: number; max: number; step: number; int?: boolean }
interface BoolSpec { kind: 'bool'; path: string[]; label: string; hint: string }
type FieldSpec = NumSpec | BoolSpec

/** Every editable strategy parameter (scoring-spec §6), grouped as the engine reads them. */
export const PARAM_GROUPS: { group: Group; title: string; fields: FieldSpec[] }[] = [
  {
    group: 'smallRubrics', title: 'Small rubrics', fields: [
      { kind: 'num', path: ['threshold'], label: 'Threshold (remedies)', hint: 'A rubric with this many remedies or fewer counts as small', min: 1, max: 1000, step: 1, int: true },
      { kind: 'num', path: ['factor'], label: 'Factor', hint: 'Multiplier for small rubrics', min: 0, max: 100, step: 0.5 },
    ],
  },
  {
    group: 'smallRubricsCont', title: 'Small rubrics (continuous)', fields: [
      { kind: 'num', path: ['wMax'], label: 'Maximum weight', hint: 'Weight of a one-remedy rubric', min: 1, max: 1000, step: 1 },
      { kind: 'num', path: ['halfLife'], label: 'Half-life (remedies)', hint: 'Rubric size over which the extra weight halves', min: 0.1, max: 1000, step: 1 },
    ],
  },
  {
    group: 'smallRemedies', title: 'Small remedies', fields: [
      { kind: 'num', path: ['mRef'], label: 'Reference size', hint: 'Remedy size (rubrics) that gets factor 1', min: 1, max: 100000, step: 100 },
      { kind: 'num', path: ['alpha'], label: 'Exponent α', hint: 'Strength of the correction', min: 0, max: 4, step: 0.1 },
      { kind: 'num', path: ['fMin'], label: 'Minimum factor', hint: 'Lower clamp of the remedy-size factor', min: 0, max: 100, step: 0.1 },
      { kind: 'num', path: ['fMax'], label: 'Maximum factor', hint: 'Upper clamp of the remedy-size factor', min: 0, max: 100, step: 0.5 },
    ],
  },
  {
    group: 'prominence', title: 'Prominence', fields: [
      { kind: 'num', path: ['k'], label: 'Top grade shared by at most', hint: 'A top grade counts when this many remedies or fewer hold it', min: 1, max: 100, step: 1, int: true },
      { kind: 'bool', path: ['soleBonus'], label: 'Double a sole top grade', hint: 'A remedy alone at the top grade counts twice' },
    ],
  },
  {
    group: 'kent', title: 'Kent hierarchy', fields: [
      { kind: 'num', path: ['weights', 'mental'], label: 'κ mental', hint: 'Weight of Mind symptoms', min: 0, max: 100, step: 0.5 },
      { kind: 'num', path: ['weights', 'general'], label: 'κ general', hint: 'Weight of general symptoms (Generalities, Sleep, Fever …)', min: 0, max: 100, step: 0.5 },
      { kind: 'num', path: ['weights', 'particular'], label: 'κ particular', hint: 'Weight of local symptoms', min: 0, max: 100, step: 0.5 },
      { kind: 'bool', path: ['mustCoverStrong'], label: 'Must cover strong symptoms', hint: 'Remedies missing any symptom of intensity 3 or 4 are excluded' },
      { kind: 'bool', path: ['markedMentalEliminative'], label: 'Marked mental is eliminative', hint: 'The first Mind symptom of intensity 3 or 4 becomes eliminative' },
    ],
  },
  {
    group: 'polarity', title: 'Polarity', fields: [
      { kind: 'num', path: ['low'], label: 'Low grade (≤)', hint: 'Contraindicated when the symptom grade is at most this …', min: 0, max: 5, step: 1, int: true },
      { kind: 'num', path: ['high'], label: 'High opposite grade (≥)', hint: '… and the opposite rubric grade at least this', min: 0, max: 5, step: 1, int: true },
      { kind: 'num', path: ['allowMissing'], label: 'Polar symptoms allowed missing', hint: 'Candidates cover all polar symptoms but this many', min: 0, max: 50, step: 1, int: true },
      { kind: 'num', path: ['minLinesWarn'], label: 'Warn below (polar symptoms)', hint: 'Show a warning with fewer polar symptoms', min: 0, max: 50, step: 1, int: true },
      { kind: 'bool', path: ['includeNonPolar'], label: 'Count non-polar symptoms', hint: 'Add the degrees of symptoms without an opposite' },
    ],
  },
  {
    group: 'segments', title: 'Segments', fields: [
      { kind: 'num', path: ['topK'], label: 'Top ranks per clipboard', hint: 'A remedy scores a segment when it ranks this high in it', min: 1, max: 500, step: 1, int: true },
    ],
  },
  {
    group: 'composite', title: 'Composite', fields: [
      { kind: 'num', path: ['soleTopFactor'], label: 'Sole top grade factor', hint: 'Multiplier when the remedy alone holds the rubric\'s top grade', min: 0, max: 100, step: 0.5 },
    ],
  },
]

/** Parameter groups each strategy reads. */
export const STRATEGY_GROUPS: Partial<Record<StrategyId, Group[]>> = {
  'small-rubrics': ['smallRubrics'],
  'small-rubrics-cont': ['smallRubricsCont'],
  'remedy-size': ['smallRemedies'],
  'small-remedies': ['smallRubrics', 'smallRemedies'],
  prominence: ['prominence'],
  kent: ['kent'],
  polarity: ['polarity'],
  segments: ['segments'],
  composite: ['composite', 'kent', 'smallRubricsCont', 'smallRemedies'],
}

const get = (obj: unknown, path: string[]): unknown => path.reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj)
function set<T>(obj: T, path: string[], value: unknown): T {
  const [k, ...rest] = path
  const cur = obj as Record<string, unknown>
  return { ...cur, [k]: rest.length ? set(cur[k], rest, value) : value } as T
}

/** Deep equality of two parameter sets (plain JSON values). */
export const sameParams = (a: StrategyParams, b: StrategyParams) => JSON.stringify(a) === JSON.stringify(b)

/** True when a case's saved parameters differ from the defaults. */
export const hasCustomParams = (o: Pick<AnalysisOptions, 'params'> | null | undefined) => !!o?.params && !sameParams(mergeParams(o.params), DEFAULT_PARAMS)

/** Number input that commits on Enter, blur and the spin buttons; Escape reverts. Invalid text never reaches the engine. */
function NumField({ spec, value, onCommit, id }: { spec: NumSpec; value: number; onCommit: (v: number) => void; id: string }) {
  const [draft, setDraft] = useState(String(value))
  const [bad, setBad] = useState(false)
  useEffect(() => { setDraft(String(value)); setBad(false) }, [value])
  const commit = (text = draft) => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n) || n < spec.min || n > spec.max || (spec.int && !Number.isInteger(n))) { setBad(true); return }
    setBad(false)
    if (n !== value) onCommit(n)
  }
  return (
    <input
      id={id}
      className={`input an-param-num${bad ? ' invalid' : ''}`}
      type="number" inputMode="decimal" min={spec.min} max={spec.max} step={spec.step}
      value={draft}
      aria-invalid={bad || undefined}
      aria-describedby={`${id}-hint`}
      onChange={e => {
        setDraft(e.target.value)
        // spin buttons and arrow keys step the value: apply at once (typing waits for Enter / blur)
        const ne = e.nativeEvent as InputEvent
        if (!ne.inputType) commit(e.target.value)
      }}
      onBlur={() => commit()}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        else if (e.key === 'Escape' && draft !== String(value)) { e.stopPropagation(); setDraft(String(value)); setBad(false) }
      }}
    />
  )
}

interface Props {
  strategy: StrategyId
  params: AnalysisOptions['params']
  onChange: (params: StrategyParams | null) => void
  onClose: () => void
}

/** "Advanced" drawer of the strategy panel: every strategy parameter, saved with the analysis (scoring-spec §6, ANA-022). */
export function ParamsDrawer({ strategy, params, onChange, onClose }: Props) {
  const merged = mergeParams(params)
  const used = new Set(STRATEGY_GROUPS[strategy] ?? [])
  const custom = !sameParams(merged, DEFAULT_PARAMS)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true }) }, [])
  const groups = [...PARAM_GROUPS].sort((a, b) => Number(used.has(b.group)) - Number(used.has(a.group)))
  const update = (group: Group, path: string[], v: unknown) => onChange(set(merged, [group, ...path], v))
  return (
    <section
      ref={ref}
      id="an-params"
      className="an-params"
      aria-label="Strategy parameters"
      data-testid="analysis-params"
      onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onClose() } }}
    >
      <header className="an-params-head">
        <SlidersHorizontal size={13} aria-hidden="true" />
        <strong>Advanced: strategy parameters</strong>
        <span className="an-muted an-ellipsis">
          {used.size ? `${strategyInfo(strategy).name} uses the highlighted groups.` : `${strategyInfo(strategy).name} has no parameters; these apply to the other strategies.`} Saved with this analysis.
        </span>
        <span className="an-spacer" />
        <button className="btn btn-sm" disabled={!custom} onClick={() => onChange(null)} title="Restore every parameter to its default"><RotateCcw size={12} /> Reset to defaults</button>
        <button className="icon-btn" aria-label="Close strategy parameters" title="Close (Esc)" onClick={onClose}><X size={14} /></button>
      </header>
      <div className="an-params-grid">
        {groups.map(g => (
          <fieldset key={g.group} className={`an-params-group${used.has(g.group) ? ' used' : ''}`}>
            <legend>{g.title}{used.has(g.group) && <span className="sr-only"> (used by the current strategy)</span>}</legend>
            {g.fields.map(f => {
              const id = `an-p-${g.group}-${f.path.join('-')}`
              const v = get(merged[g.group], f.path)
              const def = get(DEFAULT_PARAMS[g.group], f.path)
              const changed = v !== def
              return f.kind === 'num' ? (
                <div key={id} className={`an-param${changed ? ' changed' : ''}`} title={`${f.hint}. Default ${def}`}>
                  <label htmlFor={id}>{f.label}</label>
                  <NumField id={id} spec={f} value={v as number} onCommit={n => update(g.group, f.path, n)} />
                  <span id={`${id}-hint`} className="sr-only">{f.hint}. Default {String(def)}</span>
                </div>
              ) : (
                <label key={id} className={`an-param an-param-bool${changed ? ' changed' : ''}`} title={f.hint}>
                  <input type="checkbox" checked={!!v} onChange={e => update(g.group, f.path, e.target.checked)} aria-describedby={`${id}-hint`} />
                  <span>{f.label}</span>
                  <span id={`${id}-hint`} className="sr-only">{f.hint}</span>
                </label>
              )
            })}
          </fieldset>
        ))}
      </div>
    </section>
  )
}
