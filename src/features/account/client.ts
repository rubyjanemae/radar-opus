import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from './env'

let client: SupabaseClient | null = null
/** The one Supabase client (session persisted in localStorage, refreshed automatically). */
export function supabase(): SupabaseClient {
  return (client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }))
}
