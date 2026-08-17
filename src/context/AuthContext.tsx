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

    // getSession() lee de localStorage. Si falla (sin red), igual usamos la sesión
    // que haya guardada: el usuario puede navegar y el perfil se carga cuando haya conexión.
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      const session = data?.session ?? null
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
      } else if (event === 'SIGNED_OUT') {
        setPerfil(null)
        setSesion(null)
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setSesion(session)
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
