import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { AlertTriangle, BarChart3, BookOpen, Check, Database, Download, HardDrive, Monitor, Moon, RotateCcw, SlidersHorizontal, Sun, Upload } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Dialog } from '../../ui/Dialog'
import { useCatalog } from '../../data/CatalogContext'
import { formatKeys, runCommand } from '../../commands/registry'
import { actions, selectActiveConsultation, useApp } from '../../state/store'
import { DEFAULT_SETTINGS } from '../../state/workspace'
import type { Settings } from '../../state/workspace'
import { STRATEGIES } from '../../engine/analysis'
import { formatBytes, requestPersistence, resetAllData, storageInfo } from './data'
import type { StorageInfo } from './data'
import './workspace.css'

export type SettingsTab = 'general' | 'repertory' | 'analysis' | 'data'
const TABS: { id: SettingsTab; label: string; icon: typeof Sun }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'repertory', label: 'Repertory', icon: BookOpen },
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'data', label: 'Data', icon: Database },
]

export const RESULT_LIMITS = [10, 20, 30, 50, 100, 200, 100000]
const limitLabel = (n: number) => (n >= 100000 ? 'All remedies' : `Top ${n}`)

const set = (patch: Partial<Settings>) => actions.setSettings(patch)

/** Restore display and analysis defaults (keeping the default repertory), with an Undo toast. */
export function restoreDefaults() {
  const before = { ...useApp.getState().settings }
  const next = defaultsKeeping(before)
  if (sameSettings(before, next)) { actions.toast('Settings already match the defaults', 'info'); return }
  set(next)
  actions.toast('Settings restored to defaults', 'success', { label: 'Undo', run: () => set(before) })
}

/** The defaults, keeping choices that are not "display" preferences (the default repertory). */
export function defaultsKeeping(cur: Settings): Settings {
  return { ...cur, ...DEFAULT_SETTINGS, defaultRepertory: cur.defaultRepertory }
}

export function sameSettings(a: Settings, b: Settings): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Settings>
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}

export function SettingsDialog({ onClose, tab: initial }: { onClose: () => void; tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(TABS.some(t => t.id === initial) ? initial! : 'general')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const baseId = useId()

  const onTabKey = (e: ReactKeyboardEvent, i: number) => {
    let n = -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % TABS.length
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = TABS.length - 1
    if (n < 0) return
    e.preventDefault()
    setTab(TABS[n].id)
    tabRefs.current[n]?.focus()
  }

  return (
    <Dialog title="Settings" onClose={onClose} width={760} initialFocus=".ws-settings-tab[aria-selected='true']"
      footer={<>
        <span className="ws-foot-note">Changes apply immediately and are saved with the workspace.</span>
        <button className="btn" onClick={restoreDefaults} title="Restore display and analysis defaults (can be undone)">
          <RotateCcw size={13} />Restore defaults
        </button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      <div className="ws-settings">
        <div className="ws-settings-tabs" role="tablist" aria-orientation="vertical" aria-label="Settings sections">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={el => { tabRefs.current[i] = el }}
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-controls={`${baseId}-panel`}
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className="ws-settings-tab"
              onClick={() => setTab(t.id)}
              onKeyDown={e => onTabKey(e, i)}
            >
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>
        <div className="ws-settings-panel" role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`}>
          {tab === 'general' && <GeneralPane />}
          {tab === 'repertory' && <RepertoryPane />}
          {tab === 'analysis' && <AnalysisPane />}
          {tab === 'data' && <DataPane onClose={onClose} />}
        </div>
      </div>
    </Dialog>
  )
}

function Row({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="ws-row">
      <div className="ws-row-label">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {hint && <div className="ws-row-hint">{hint}</div>}
      </div>
      <div className="ws-row-control">{children}</div>
    </div>
  )
}

/** Segmented control: a radiogroup of buttons with arrow-key navigation. */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: typeof Sun }[]; onChange: (v: T) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div className="seg ws-seg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={el => { refs.current[i] = el }}
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className="seg-btn ws-seg-btn"
          onClick={() => onChange(o.value)}
          onKeyDown={e => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (!d) return
            e.preventDefault()
            const n = (i + d + options.length) % options.length
            onChange(options[n].value)
            refs.current[n]?.focus()
          }}
        >
          {o.icon && <o.icon size={13} />}{o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="ws-check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function GeneralPane() {
  const s = useApp(st => st.settings)
  const catalog = useCatalog()
  const id = useId()
  const pct = Math.round(s.fontScale * 100)
  return (
    <section className="ws-pane" aria-label="General">
      <h3>Appearance</h3>
      <Row label="Theme" hint="Match system follows your operating system.">
        <Segmented label="Theme" value={s.theme} onChange={v => set({ theme: v })} options={[
          { value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Monitor },
        ]} />
      </Row>
      <Row label="Density" hint="Comfortable adds row height and a larger base font.">
        <Segmented label="Density" value={s.density} onChange={v => set({ density: v })} options={[
          { value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' },
        ]} />
      </Row>
      <Row label="Text size" htmlFor={`${id}-fs`} hint={<>Also <span className="kbd">{formatKeys('Mod+=')}</span> <span className="kbd">{formatKeys('Mod+-')}</span> <span className="kbd">{formatKeys('Mod+0')}</span></>}>
        <div className="ws-slider">
          <input id={`${id}-fs`} type="range" min={80} max={150} step={5} value={pct}
            aria-valuetext={`${pct} percent`} onChange={e => set({ fontScale: Number(e.target.value) / 100 })} />
          <output htmlFor={`${id}-fs`} className="ws-slider-val">{pct}%</output>
          <button className="icon-btn" aria-label="Reset text size" title="Reset to 100%" disabled={pct === 100} onClick={() => set({ fontScale: 1 })}><RotateCcw size={13} /></button>
        </div>
      </Row>
      <Row label="Motion" hint="Animations are also reduced when your system asks for it.">
        <Toggle id={`${id}-rm`} checked={s.reduceMotion} onChange={v => set({ reduceMotion: v })} label="Reduce motion" />
      </Row>
      <h3>Startup</h3>
      <Row label="Default repertory" htmlFor={`${id}-rep`} hint="Used for new repertory tabs, searches and Find.">
        <select id={`${id}-rep`} className="select ws-select" value={s.defaultRepertory} onChange={e => set({ defaultRepertory: e.target.value })}>
          {catalog.repertoryInfos.map(r => <option key={r.abbrev} value={r.abbrev}>{r.title}</option>)}
        </select>
      </Row>
    </section>
  )
}

const SAMPLE: { abbrev: string; name: string; g: 1 | 2 | 3 | 4 }[] = [
  { abbrev: 'Acon.', name: 'Aconitum napellus', g: 4 }, { abbrev: 'Bell.', name: 'Belladonna', g: 3 },
  { abbrev: 'Bry.', name: 'Bryonia alba', g: 2 }, { abbrev: 'Cham.', name: 'Chamomilla', g: 2 },
  { abbrev: 'Gels.', name: 'Gelsemium sempervirens', g: 1 }, { abbrev: 'Puls.', name: 'Pulsatilla pratensis', g: 1 },
]

function RepertoryPane() {
  const s = useApp(st => st.settings)
  const id = useId()
  const shown = SAMPLE.filter(r => r.g >= s.minGradeShown)
  return (
    <section className="ws-pane" aria-label="Repertory">
      <h3>Rubric display</h3>
      <Row label="Remedy names" hint="How remedies print after a rubric.">
        <Segmented label="Remedy names" value={s.remedyStyle} onChange={v => set({ remedyStyle: v })} options={[
          { value: 'abbrev', label: 'Abbreviations' }, { value: 'name', label: 'Full names' },
        ]} />
      </Row>
      <Row label="Show remedies" hint="Hide lower grades to read large rubrics faster.">
        <Segmented label="Minimum grade shown" value={s.minGradeShown} onChange={v => set({ minGradeShown: v })} options={[
          { value: 1, label: 'All grades' }, { value: 2, label: 'Grade 2+' }, { value: 3, label: 'Grade 3+' },
        ]} />
      </Row>
      <Row label="Navigator" hint="Remedy counts after each rubric in the tree.">
        <Toggle id={`${id}-rc`} checked={s.showRemedyCounts} onChange={v => set({ showRemedyCounts: v })} label="Show remedy counts" />
      </Row>
      <div className="ws-preview" aria-label="Preview">
        <div className="ws-preview-label">Preview</div>
        <div className="ws-preview-rubric">
          <span className="ws-preview-path">Mind; anxiety; night</span>
          {s.showRemedyCounts && <span className="ws-preview-count">(6)</span>}
          <span className="ws-preview-rems">
            {shown.map((r, i) => (
              <span key={r.abbrev}><span className={`g${r.g}`}>{s.remedyStyle === 'name' ? r.name : r.abbrev}</span>{i < shown.length - 1 ? ', ' : ''}</span>
            ))}
            {shown.length < SAMPLE.length && <span className="ws-preview-hidden"> +{SAMPLE.length - shown.length} hidden</span>}
          </span>
        </div>
        <div className="ws-preview-legend">
          <span className="g1">1 plain</span><span className="g2">2 italic</span><span className="g3">3 bold</span><span className="g4">4 caps</span>
        </div>
      </div>
    </section>
  )
}

function AnalysisPane() {
  const s = useApp(st => st.settings)
  const consultation = useApp(selectActiveConsultation)
  const id = useId()
  const cur = consultation?.analysis
  const differs = !!cur && (cur.strategy !== s.defaultStrategy || cur.limit !== s.analysisLimit)
  return (
    <section className="ws-pane" aria-label="Analysis">
      {consultation && (
        <div className="ws-callout ws-callout-top">
          <span>The active consultation uses <strong>{STRATEGIES.find(x => x.id === cur?.strategy)?.name ?? cur?.strategy}</strong>, {limitLabel(cur?.limit ?? 30).toLowerCase()}.</span>
          <button className="btn btn-sm" disabled={!differs} onClick={() => { actions.setAnalysis(consultation.id, { strategy: s.defaultStrategy, limit: s.analysisLimit }); actions.toast('Defaults applied to the active consultation', 'success') }}>
            {differs ? 'Apply to active consultation' : <><Check size={12} />Matches defaults</>}
          </button>
        </div>
      )}
      <h3>New consultations</h3>
      <Row label="Result limit" htmlFor={`${id}-lim`} hint="Remedies listed in the analysis.">
        <select id={`${id}-lim`} className="select ws-select" value={s.analysisLimit} onChange={e => set({ analysisLimit: Number(e.target.value) })}>
          {RESULT_LIMITS.map(n => <option key={n} value={n}>{limitLabel(n)}</option>)}
          {!RESULT_LIMITS.includes(s.analysisLimit) && <option value={s.analysisLimit}>{limitLabel(s.analysisLimit)}</option>}
        </select>
      </Row>
      <div className="ws-row ws-row-block">
        <div className="ws-row-label"><span id={`${id}-strat`}>Default strategy</span></div>
        <div className="ws-strategies" role="radiogroup" aria-labelledby={`${id}-strat`}>
          {STRATEGIES.map(st => (
            <label key={st.id} className={`ws-strategy${s.defaultStrategy === st.id ? ' on' : ''}`}>
              <input type="radio" name={`${id}-strategy`} value={st.id} checked={s.defaultStrategy === st.id} onChange={() => set({ defaultStrategy: st.id })} />
              <span className="ws-strategy-text">
                <span className="ws-strategy-name">{st.name}</span>
                <span className="ws-strategy-desc">{st.description}</span>
                <code className="ws-strategy-formula">{st.formula}</code>
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}

function DataPane({ onClose }: { onClose: () => void }) {
  const counts = useApp(useShallow(s => ({ p: Object.keys(s.patients).length, c: Object.keys(s.consultations).length, b: s.bookmarks.length, n: Object.keys(s.rubricNotes).length })))
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => { let live = true; void storageInfo().then(i => { if (live) setInfo(i) }); return () => { live = false } }, [])
  // the confirmation opens on the safe choice; closing it returns focus to the button that opened it
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (wasConfirming.current) resetRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  const pct = info?.usage != null && info.quota ? Math.min(100, (info.usage / info.quota) * 100) : null

  return (
    <section className="ws-pane" aria-label="Data">
      <h3>Backup</h3>
      <p className="ws-text">A backup holds every patient, consultation, clipboard, bookmark and note, plus your layout and settings, in one JSON file.</p>
      <div className="ws-stats">
        <div><strong>{counts.p}</strong><span>patients</span></div>
        <div><strong>{counts.c}</strong><span>consultations</span></div>
        <div><strong>{counts.b}</strong><span>bookmarks</span></div>
        <div><strong>{counts.n}</strong><span>rubric notes</span></div>
      </div>
      <div className="ws-btnrow">
        <button className="btn" onClick={() => runCommand('file.exportWorkspace')}><Download size={13} />Export workspace backup…</button>
        <button className="btn" onClick={() => { onClose(); runCommand('file.importWorkspace') }}><Upload size={13} />Restore workspace backup…</button>
      </div>

      <h3>Storage</h3>
      <div className="ws-storage">
        <HardDrive size={16} className="ws-storage-icon" />
        <div className="ws-storage-main">
          {info == null ? <span className="ws-muted">Measuring…</span> : info.usage == null ? <span className="ws-muted">This browser does not report storage use.</span> : (
            <>
              <div className="ws-storage-line">
                <span><strong>{formatBytes(info.usage)}</strong> used{info.quota ? ` of ${formatBytes(info.quota)} available` : ''}</span>
                <span className="ws-muted">{info.persisted ? 'Persistent: the browser will not evict it' : 'Best effort: the browser may clear it under storage pressure'}</span>
              </div>
              {pct != null && <div className="ws-meter" role="meter" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><span style={{ width: `${Math.max(pct, 0.5)}%` }} /></div>}
            </>
          )}
          <p className="ws-row-hint">Data stays in this browser on this device. Reference books are loaded from the app and are not counted here beyond the browser cache.</p>
        </div>
        {info && info.persisted === false && (
          <button className="btn btn-sm" onClick={async () => {
            const ok = await requestPersistence()
            actions.toast(ok ? 'Storage marked persistent' : 'The browser declined persistent storage', ok ? 'success' : 'info')
            setInfo(await storageInfo())
          }}>Make persistent</button>
        )}
      </div>

      <h3>Reset</h3>
      {!confirming ? (
        <div className="ws-btnrow">
          <button ref={resetRef} className="btn btn-danger" onClick={() => setConfirming(true)}><RotateCcw size={13} />Reset demo data…</button>
          <span className="ws-row-hint">Erases everything and restores the sample patients.</span>
        </div>
      ) : (
        <div
          className="ws-danger" role="alertdialog" aria-labelledby="ws-reset-title" aria-describedby="ws-reset-desc"
          onKeyDown={e => { if (e.key === 'Escape' && !resetting) { e.stopPropagation(); e.preventDefault(); setConfirming(false) } }}
        >
          <AlertTriangle size={18} className="ws-danger-icon" />
          <div>
            <strong id="ws-reset-title">Erase all data in this browser?</strong>
            <p id="ws-reset-desc">This deletes {counts.p} patients, {counts.c} consultations, bookmarks, notes, layout and settings, then reloads with the demo cases. It cannot be undone. Export a backup first if you may need it.</p>
            <div className="ws-btnrow">
              <button ref={cancelRef} className="btn" disabled={resetting} onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn" disabled={resetting} onClick={() => runCommand('file.exportWorkspace')}><Download size={13} />Export backup first</button>
              <button className="btn ws-btn-danger ws-btn-push" disabled={resetting} onClick={() => { setResetting(true); void resetAllData() }}>
                {resetting ? 'Erasing…' : 'Erase and reload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
