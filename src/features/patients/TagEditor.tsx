import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { normalizeTag } from './logic'

/** Chip list with an input: Enter or comma adds, Backspace on empty removes the last tag. */
export function TagEditor({ tags, onChange, suggestions = [], label = 'Add tag' }: { tags: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; label?: string }) {
  const [text, setText] = useState('')
  const listId = useId()
  const add = (raw: string) => {
    const t = normalizeTag(raw)
    if (t && !tags.includes(t)) onChange([...tags, t])
    setText('')
  }
  return (
    <div className="pt-tags-edit" onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
      {tags.map(t => (
        <span key={t} className="pt-tag">
          {t}
          <button type="button" className="pt-tag-x" aria-label={`Remove tag ${t}`} onClick={e => { e.stopPropagation(); onChange(tags.filter(x => x !== t)) }}><X size={11} /></button>
        </span>
      ))}
      <input
        className="pt-tags-input" value={text} aria-label={label} placeholder={tags.length ? '' : 'Add tag…'} list={listId}
        onChange={e => { const v = e.target.value; if (v.endsWith(',')) add(v.slice(0, -1)); else setText(v) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) add(text) }
          else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => { if (text.trim()) add(text) }}
      />
      <datalist id={listId}>{suggestions.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
    </div>
  )
}
