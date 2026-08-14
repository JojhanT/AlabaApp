import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'

interface AuthState {
  cargando: boolean
  sesion: Session | null
  perfil: Perfil | null
  esAdmin: boolean
  recargarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  cargando: true,
  sesion: null,
  perfil: null,
  esAdmin: false,
  recargarPerfil: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  async function cargarPerfil(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    const perfilData = (data as Perfil) ?? null
    if (perfilData && perfilData.is_activo === false) {
      await supabase.auth.signOut()
      setSesion(null)
      setPerfil(null)
      return
    }
    setPerfil(perfilData)
  }

  useEffect(() => {
    let activo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      setSesion(data.session)
      if (data.session) void cargarPerfil(data.session.user.id)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session)
      if (session) void cargarPerfil(session.user.id)
      else setPerfil(null)
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
