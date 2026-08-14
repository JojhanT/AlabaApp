import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env (copia .env.example a .env)',
  )
}

export const supabase = createClient(url, anonKey)

export function emailDesdeCodigo(codigo: string): string {
  return `${codigo.trim()}@iglesia.local`
}
