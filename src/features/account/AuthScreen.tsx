import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './client'
import './account.css'

export type AuthMode = 'signin' | 'signup' | 'reset' | 'newPassword'

const TITLES: Record<AuthMode, string> = {
  signin: 'Sign in to Radar Opus',
  signup: 'Create an account',
  reset: 'Reset your password',
  newPassword: 'Choose a new password',
}

/**
 * Sign-in gate shown before the workspace loads: sign in, sign up, password reset email, and the
 * new-password form after following a reset link. Resolves through onAuthStateChange in the gate.
 */
export function AuthScreen({ initialMode = 'signin', onPasswordSet }: { initialMode?: AuthMode; onPasswordSet?: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => { first.current?.focus() }, [mode])
  const go = (m: AuthMode) => { setMode(m); setError(''); setInfo('') }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    try {
      const auth = supabase().auth
      const redirectTo = location.origin + location.pathname
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        if (error) throw error
        if (!data.session) { setInfo(`We sent a confirmation link to ${email}. Open it, then sign in.`); setMode('signin') }
      } else if (mode === 'reset') {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        setInfo(`If an account exists for ${email}, a reset link is on its way.`)
      } else {
        const { error } = await auth.updateUser({ password })
        if (error) throw error
        onPasswordSet?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const needsEmail = mode !== 'newPassword'
  const needsPassword = mode !== 'reset'
  const label = { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link', newPassword: 'Set password' }[mode]

  return (
    <div className="boot">
      <form className="acct-card" onSubmit={e => void submit(e)} aria-labelledby="acct-title">
        <div className="acct-head">
          <div className="boot-logo">R</div>
          <h1 id="acct-title">{TITLES[mode]}</h1>
        </div>
        {mode === 'signin' && <p className="acct-note">Patient records are stored in your account (EU) and cached on this device for offline work.</p>}
        {needsEmail && (
          <label className="acct-field"><span>Email</span>
            <input ref={first} className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
          </label>
        )}
        {needsPassword && (
          <label className="acct-field"><span>{mode === 'newPassword' ? 'New password' : 'Password'}</span>
            <input ref={needsEmail ? undefined : first} className="input" type="password" required minLength={mode === 'signin' ? undefined : 8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} />
          </label>
        )}
        {error && <p className="acct-msg acct-err" role="alert">{error}</p>}
        {info && <p className="acct-msg acct-info" role="status">{info}</p>}
        <button className="btn btn-primary acct-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : label}</button>
        {mode !== 'newPassword' && (
          <div className="acct-links">
            {mode !== 'signin' && <button type="button" className="acct-link" onClick={() => go('signin')}>Sign in</button>}
            {mode !== 'signup' && <button type="button" className="acct-link" onClick={() => go('signup')}>Create account</button>}
            {mode !== 'reset' && <button type="button" className="acct-link" onClick={() => go('reset')}>Forgot password?</button>}
          </div>
        )}
      </form>
    </div>
  )
}
