import { supabase, emailDesdeCodigo } from './supabase'

interface ErrorLogin {
  message: string
  name?: string
  status?: number
}

export interface ResultadoLogin {
  data: { session: import('@supabase/supabase-js').Session | null }
  error: ErrorLogin | null
}

export async function iniciarSesion(codigo: string): Promise<ResultadoLogin> {
  const limpio = codigo.trim()
  const resultado = await supabase.auth.signInWithPassword({
    email: emailDesdeCodigo(limpio),
    password: limpio,
  })

  if (resultado.error || !resultado.data.session) {
    return {
      data: { session: null },
      error: resultado.error
        ? { message: resultado.error.message, name: resultado.error.name, status: resultado.error.status }
        : { message: 'No se pudo iniciar sesión' },
    }
  }

  const { data } = await supabase
    .from('profiles')
    .select('is_activo')
    .eq('id', resultado.data.session.user.id)
    .maybeSingle()

  if (data && (data as { is_activo?: boolean }).is_activo === false) {
    await supabase.auth.signOut()
    return {
      data: { session: null },
      error: {
        message: 'Tu cuenta aún está pendiente de activación por el administrador.',
        name: 'CuentaInactiva',
        status: 403,
      },
    }
  }

  return { data: { session: resultado.data.session }, error: null }
}

export async function cerrarSesion() {
  return supabase.auth.signOut()
}
