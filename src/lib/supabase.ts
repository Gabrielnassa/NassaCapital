import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false quando o .env ainda não foi preenchido: o app mostra as instruções em vez de quebrar. */
export const isConfigured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'sem-chave')
