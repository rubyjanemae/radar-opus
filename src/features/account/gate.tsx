import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './client'
import { AuthScreen } from './AuthScreen'
import { setAccountStatus } from './status'

export { startSync } from './sync'

/**
 * Resolve with the signed-in user, showing the sign-in screen (through `show`) until there is one.
 * A password-recovery link signs the user in and first asks for a new password.
 */
export async function signIn(show: (screen: ReactNode) => void): Promise<User> {
  const auth = supabase().auth
  const recovering = /type=recovery/.test(location.hash)
  const { data } = await auth.getSession()
  if (data.session && !recovering) return done(data.session.user)
  return new Promise<User>(resolve => {
    let resetPending = recovering
    const finish = (u: User) => { sub.subscription.unsubscribe(); resolve(done(u)) }
    const { data: sub } = auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { resetPending = true; show(<AuthScreen key="np" initialMode="newPassword" onPasswordSet={() => { resetPending = false; void auth.getUser().then(r => r.data.user && finish(r.data.user)) }} />); return }
      if (session && !resetPending && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setTimeout(() => finish(session.user), 0)
    })
    show(recovering
      ? <AuthScreen key="np" initialMode="newPassword" onPasswordSet={() => { resetPending = false; void auth.getUser().then(r => r.data.user && finish(r.data.user)) }} />
      : <AuthScreen key="si" />)
  })
}

function done(u: User): User {
  if (location.hash.includes('access_token') || location.hash.includes('type=')) history.replaceState(null, '', location.pathname + location.search)
  setAccountStatus({ email: u.email ?? u.id })
  return u
}
