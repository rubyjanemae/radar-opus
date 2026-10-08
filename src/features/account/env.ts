/** Supabase project settings from the build env. Both missing (local dev, tests, e2e): the app runs local-only. */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || ''
export const accountConfigured = !!(SUPABASE_URL && SUPABASE_KEY)
