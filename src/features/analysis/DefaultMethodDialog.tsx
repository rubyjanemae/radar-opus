import { useState } from 'react'
import { RO_METHODS, strategyInfo } from '../../engine/analysis'
import type { StrategyId } from '../../engine/model'
import { useApp } from '../../state/store'
import { Dialog } from '../../ui/Dialog'
import { setDefaultStrategy } from './ops'
import './analysis.css'

/**
 * Analysis › Select your default analysis method: RadarOpus's methods as radio buttons; OK makes the
 * chosen one the default (and the current analysis's method), Cancel / Escape changes nothing. A default
 * chosen elsewhere among the engine's further strategies (Preferences) is listed after them.
 */
export function DefaultMethodDialog({ onClose }: { onClose: () => void }) {
  const current = useApp(s => s.settings.defaultStrategy)
  const [pick, setPick] = useState<StrategyId>(current)
  const ids: StrategyId[] = RO_METHODS.includes(current) ? [...RO_METHODS] : [...RO_METHODS, current]
  const ok = () => { if (pick !== current) setDefaultStrategy(pick); onClose() }
  return (
    <Dialog
      title="Select your default analysis method" onClose={onClose} width={380} initialFocus="input:checked"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={ok}>OK</button></>}
    >
      <form className="an-method-list" role="radiogroup" aria-label="Default analysis method" onSubmit={e => { e.preventDefault(); ok() }}>
        {ids.map((id, i) => {
          const info = strategyInfo(id)
          return (
            <label key={id} className={`an-method${i === RO_METHODS.length ? ' an-method-extra' : ''}`} title={info.description}>
              <input
                type="radio" name="an-default-method" value={id} checked={pick === id}
                onChange={() => setPick(id)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ok() } }}
                onDoubleClick={ok}
              />
              <span>{info.name}</span>
            </label>
          )
        })}
      </form>
    </Dialog>
  )
}
