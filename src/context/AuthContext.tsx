import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'

interface AuthState {
  cargando: boolean
  sesion: Session | null
  perfil: Perfil | null
  esAdmin: boolean
  recargarPerfil: () => Promise<boolean>
}

const AuthContext = createContext<AuthState>({
  cargando: true,
  sesion: null,
  perfil: null,
  esAdmin: false,
  recargarPerfil: async () => false,
})

/** Lee la sesión directamente de localStorage (fallback cuando no hay red). */
function sesionDesdeStorage(): Session | null {
  try {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!key) return null
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { current_session?: Session | null }
    return parsed.current_session ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  async function cargarPerfil(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) return true
      const perfilData = (data as Perfil) ?? null
      if (perfilData && perfilData.is_activo === false) {
        await supabase.auth.signOut()
        setSesion(null)
        setPerfil(null)
        return false
      }
      setPerfil(perfilData)
      return true
    } catch {
      return true
    }
  }

  useEffect(() => {
    let activo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      const session = data?.session ?? sesionDesdeStorage()
      if (session) {
        setSesion(session)
        setCargando(false)
        void cargarPerfil(session.user.id)
      } else {
        setCargando(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setSesion(session)
        void cargarPerfil(session.user.id)
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setSesion(session)
      } else if (event === 'SIGNED_OUT') {
        if (!sesionDesdeStorage()) {
          setPerfil(null)
          setSesion(null)
        }
      }
    })

    return () => {
      activo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ cargando, sesion, perfil, esAdmin: perfil?.is_admin ?? false, recargarPerfil: () => cargarPerfil(sesion?.user.id ?? '') }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
