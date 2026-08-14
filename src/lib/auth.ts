import { supabase, emailDesdeCodigo } from './supabase'

export async function iniciarSesion(codigo: string) {
  const limpio = codigo.trim()
  return supabase.auth.signInWithPassword({
    email: emailDesdeCodigo(limpio),
    password: limpio,
  })
}

export async function cerrarSesion() {
  return supabase.auth.signOut()
}
