import { supabase, emailDesdeCodigo } from './supabase'
import { calcularProgramacion, DIAS_SEMANA, type DiaSemana } from './planificador'
import { fechaDeDia, toDateString } from './dias'
import type { Perfil, ProgramacionRow, Rol, Voto } from '../types'

export async function obtenerRoles(): Promise<Rol[]> {
  const { data, error } = await supabase.from('roles').select('*').order('id')
  if (error) throw new Error(error.message)
  return (data ?? []) as Rol[]
}

export async function obtenerPerfiles(): Promise<Perfil[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as Perfil[]
}

export async function obtenerRolesDePerfil(profileId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from('profile_roles')
    .select('rol_id')
    .eq('profile_id', profileId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => (r as { rol_id: number }).rol_id)
}

export async function obtenerVotosSemana(
  semanaInicio: string,
): Promise<{ porDia: Record<DiaSemana, string[]>; propios: Set<DiaSemana> }> {
  const { data: sesion } = await supabase.auth.getSession()
  const miId = sesion.session?.user.id

  const { data, error } = await supabase
    .from('votos')
    .select('profile_id, dia_semana')
    .eq('semana_inicio', semanaInicio)

  if (error) throw new Error(error.message)

  const porDia: Record<DiaSemana, string[]> = { Martes: [], Jueves: [], Sabado: [], Domingo: [] }
  const propios = new Set<DiaSemana>()
  for (const voto of (data ?? []) as Pick<Voto, 'profile_id' | 'dia_semana'>[]) {
    const dia = voto.dia_semana as DiaSemana
    if (!(dia in porDia)) continue
    porDia[dia].push(voto.profile_id)
    if (voto.profile_id === miId) propios.add(dia)
  }
  return { porDia, propios }
}

export async function votarDia(semanaInicio: string, dia: DiaSemana, activo: boolean) {
  const { data: sesion } = await supabase.auth.getSession()
  const miId = sesion.session?.user.id
  if (!miId) throw new Error('No hay sesión')

  if (activo) {
    const { error } = await supabase.from('votos').insert({
      profile_id: miId,
      semana_inicio: semanaInicio,
      dia_semana: dia,
    })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('votos')
      .delete()
      .eq('profile_id', miId)
      .eq('semana_inicio', semanaInicio)
      .eq('dia_semana', dia)
    if (error) throw new Error(error.message)
  }
}

export async function obtenerProgramacionSemana(semanaInicio: string) {
  const { data, error } = await supabase
    .from('programaciones')
    .select('*')
    .eq('semana_inicio', semanaInicio)
  if (error) throw new Error(error.message)
  return (data ?? []) as ProgramacionRow[]
}

/** Contador histórico por rol: cuántas veces ha sido asignada cada persona. */
export async function obtenerConteosHistoricos(semanaInicio: string) {
  const { data, error } = await supabase
    .from('programaciones')
    .select('profile_id, rol_id')
    .neq('semana_inicio', semanaInicio)
  if (error) throw new Error(error.message)

  const conteos: Record<number, Record<string, number>> = {}
  for (const fila of data ?? []) {
    const r = (fila as { profile_id: string; rol_id: number }).rol_id
    const p = (fila as { profile_id: string; rol_id: number }).profile_id
    conteos[r] ??= {}
    conteos[r][p] = (conteos[r][p] ?? 0) + 1
  }
  return conteos
}

export interface GenerarSemanaResultado {
  semana: string
  asignaciones: {
    semana_inicio: string
    fecha: string
    dia_semana: DiaSemana
    rol_id: number
    profile_id: string
  }[]
  noAsignados: Record<DiaSemana, string[]>
}

/**
 * Ejecuta la generación de la programación directamente en el navegador.
 * Requiere sesión de administrador (RLS lo valida al escribir).
 */
export async function generarProgramacionSemana(
  semanaInicio: Date,
): Promise<GenerarSemanaResultado> {
  const semanaStr = toDateString(semanaInicio)

  const [perfiles, votos, conteos] = await Promise.all([
    obtenerPerfiles(),
    obtenerVotosSemana(semanaStr),
    obtenerConteosHistoricos(semanaStr),
  ])

  const rolesPorPerfil: Record<string, number[]> = {}
  for (const perfil of perfiles) {
    rolesPorPerfil[perfil.id] = await obtenerRolesDePerfil(perfil.id)
  }

  const resultado = calcularProgramacion({
    votosPorDia: votos.porDia,
    rolesPorPerfil,
    conteos,
  })

  const asignaciones: GenerarSemanaResultado['asignaciones'] = []
  for (const dia of DIAS_SEMANA) {
    const fecha = toDateString(fechaDeDia(semanaInicio, dia))
    for (const a of resultado.dias[dia]) {
      asignaciones.push({
        semana_inicio: semanaStr,
        fecha,
        dia_semana: dia,
        rol_id: a.rol_id,
        profile_id: a.profile_id,
      })
    }
  }

  // Regenerar: borra lo existente de la semana y crea la nueva
  await supabase.from('programaciones').delete().eq('semana_inicio', semanaStr)

  if (asignaciones.length > 0) {
    const { error } = await supabase.from('programaciones').insert(asignaciones)
    if (error) throw new Error(error.message)
  }

  return { semana: semanaStr, asignaciones, noAsignados: resultado.noAsignados }
}

export function nombreDeId(perfiles: Perfil[], id: string): string {
  return perfiles.find((p) => p.id === id)?.nombre ?? id
}

export function nombreRoles(roles: Rol[], ids: number[]): string {
  const nombres = roles.filter((r) => ids.includes(r.id)).map((r) => r.nombre)
  return nombres.length > 0 ? nombres.join(', ') : 'Sin rol'
}

interface CrearUsuarioCuerpo {
  codigo: string
  nombre: string
  celular?: string | null
  correo?: string | null
  roles: number[]
}

async function mensajeDeErrorFuncion(error: unknown): Promise<string> {
  const conError = error as { name?: string; message?: string; context?: unknown }
  const contexto = conError.context

  if (contexto && typeof (contexto as { text?: unknown }).text === 'function') {
    try {
      const texto = await (contexto as Response).text()
      try {
        const json = JSON.parse(texto) as { error?: string }
        if (json.error) return json.error
      } catch {
        /* no era JSON */
      }
      if (texto) return texto
    } catch {
      /* no se pudo leer el cuerpo */
    }
  }

  if (conError.name === 'FunctionsFetchError') {
    return 'No se pudo contactar el servidor. Verifica que la edge function esté desplegada en Supabase y que la URL del proyecto sea correcta.'
  }

  return conError.message ?? 'Error desconocido'
}

/**
 * Crea un usuario vía la edge function (requiere sesión de administrador).
 */
export async function crearUsuario(cuerpo: CrearUsuarioCuerpo): Promise<void> {
  const { error } = await supabase.functions.invoke('crear-usuario', { body: cuerpo })
  if (error) throw new Error(await mensajeDeErrorFuncion(error))
}

interface RegistrarseCuerpo {
  codigo: string
  nombre: string
  celular?: string | null
  correo?: string | null
}

/**
 * Registro público directamente con Supabase Auth (sin edge function).
 * Usa el email que escribió el usuario (si lo dio); si no, genera uno
 * desde el código (codigo@iglesia.local).
 * Crea la cuenta INACTIVA: un trigger en auth.users (migración 0003) crea el
 * perfil con is_activo = false, y el AuthContext cierra la sesión automáticamente
 * hasta que un administrador active la cuenta.
 *
 * Requisitos en Supabase (Authentication → Sign In / Up):
 *  - "Allow new users to sign up" activado.
 *  - Si el usuario no escribe email, "Confirm email" debe estar desactivado
 *    (no se puede enviar correo a dominios @iglesia.local).
 */
export async function registrarse(cuerpo: RegistrarseCuerpo): Promise<void> {
  const email = cuerpo.correo?.trim() || emailDesdeCodigo(cuerpo.codigo)
  const { data, error } = await supabase.auth.signUp({
    email,
    password: cuerpo.codigo,
    options: {
      data: {
        codigo: cuerpo.codigo,
        nombre: cuerpo.nombre,
        celular: cuerpo.celular ?? '',
        correo: cuerpo.correo?.trim() ?? '',
      },
    },
  })

  if (error) {
    const mensaje = error.message
    const bajo = mensaje.toLowerCase()
    if (/(already|duplicate|unique|ya existe|conflict)/.test(bajo)) {
      throw new Error(
        'Ese código ya está registrado. Intenta iniciar sesión o espera la activación del administrador.',
      )
    }
    if (/database error/i.test(bajo)) {
      throw new Error(
        'No se pudo completar el registro. Verifica que el código no esté ya registrado e intenta de nuevo.',
      )
    }
    if (/(sign.?up|signups?|not allowed|registr)/.test(bajo)) {
      throw new Error(
        'El registro no está habilitado en Supabase. Activa "Allow new users to sign up" e intenta de nuevo.',
      )
    }
    throw new Error(mensaje)
  }

  if (!data.user) {
    throw new Error('No se pudo crear la cuenta. Intenta de nuevo más tarde.')
  }

  // Con "Confirm email" desactivado, signUp devuelve una sesión de cuenta inactiva:
  // el AuthContext detecta is_activo = false y cierra la sesión automáticamente.
}

// ------------------------------------------------------------------
// Repertorio por día
// ------------------------------------------------------------------

export async function obtenerRepertorios(semanaInicio: string) {
  const { data, error } = await supabase
    .from('repertorio_dia')
    .select('*')
    .eq('semana_inicio', semanaInicio)
  if (error) throw new Error(error.message)
  return (data ?? []) as import('../types').RepertorioDia[]
}

export async function guardarRepertorio(
  semanaInicio: string,
  diaSemana: string,
  repertorio: string,
) {
  const { error } = await supabase
    .from('repertorio_dia')
    .upsert(
      { semana_inicio: semanaInicio, dia_semana: diaSemana, repertorio },
      { onConflict: 'semana_inicio,dia_semana' },
    )
  if (error) throw new Error(error.message)
}

