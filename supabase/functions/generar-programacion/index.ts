// GENERAR PROGRAMACIÓN (autónoma, sin imports de _shared).
// Pensada para desplegarse pegando este archivo completo en el dashboard
// de Supabase (Edge Functions). El motor está incluido abajo.
// Si usas la CLI de Supabase, puedes mover el motor a _shared/planificador.ts
// e importarlo; mantén sincronizado con src/lib/planificador.ts.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ============ MOTOR DE PROGRAMACIÓN ============
type DiaSemana = 'Martes' | 'Jueves' | 'Sabado' | 'Domingo'

const DIAS_SEMANA: DiaSemana[] = ['Martes', 'Jueves', 'Sabado', 'Domingo']

const ROL_ID = {
  CANTANTE: 1,
  PIANO: 2,
  GUITARRA: 3,
  BATERIA: 4,
  SAXOFONISTA: 5,
} as const

interface Asignacion {
  rol_id: number
  profile_id: string
  tipo: 'lider' | 'apoyo' | null
}

interface EntradaPlanificacion {
  votosPorDia: Record<DiaSemana, string[]>
  rolesPorPerfil: Record<string, number[]>
  conteos: Record<number, Record<string, number>>
}

interface ResultadoPlanificacion {
  dias: Record<DiaSemana, Asignacion[]>
  noAsignados: Record<DiaSemana, string[]>
}

const CUPOS: Record<number, number | 'todos' | 'especial'> = {
  [ROL_ID.CANTANTE]: 'especial',
  [ROL_ID.PIANO]: 1,
  [ROL_ID.BATERIA]: 1,
  [ROL_ID.GUITARRA]: 'todos',
  [ROL_ID.SAXOFONISTA]: 'todos',
}

const ORDEN_ROL: number[] = [
  ROL_ID.CANTANTE,
  ROL_ID.PIANO,
  ROL_ID.BATERIA,
  ROL_ID.GUITARRA,
  ROL_ID.SAXOFONISTA,
]

const MAX_APOYOS = 3

function compararPorConteo(conteos: Record<string, number>) {
  return (a: string, b: string): number => {
    const ca = conteos[a] ?? 0
    const cb = conteos[b] ?? 0
    if (ca !== cb) return ca - cb
    return a.localeCompare(b)
  }
}

function calcularProgramacion(entrada: EntradaPlanificacion): ResultadoPlanificacion {
  const dias: Record<DiaSemana, Asignacion[]> = { Martes: [], Jueves: [], Sabado: [], Domingo: [] }
  const noAsignados: Record<DiaSemana, string[]> = { Martes: [], Jueves: [], Sabado: [], Domingo: [] }

  for (const dia of DIAS_SEMANA) {
    const votantes = new Set(entrada.votosPorDia[dia] ?? [])
    const asignados = new Set<string>()

    for (const rol of ORDEN_ROL) {
      const conteosRol = entrada.conteos[rol] ?? {}
      const candidatos = [...votantes]
        .filter((id) => (entrada.rolesPorPerfil[id] ?? []).includes(rol) && !asignados.has(id))
        .sort(compararPorConteo(conteosRol))

      const cupo = CUPOS[rol]

      if (cupo === 'especial') {
        const lider = candidatos[0]
        if (lider) {
          asignados.add(lider)
          dias[dia].push({ rol_id: rol, profile_id: lider, tipo: 'lider' })
        }
        for (const apoyo of candidatos.slice(1, 1 + MAX_APOYOS)) {
          asignados.add(apoyo)
          dias[dia].push({ rol_id: rol, profile_id: apoyo, tipo: 'apoyo' })
        }
      } else if (cupo === 'todos') {
        for (const id of candidatos) {
          asignados.add(id)
          dias[dia].push({ rol_id: rol, profile_id: id, tipo: null })
        }
      } else {
        for (const id of candidatos.slice(0, cupo)) {
          asignados.add(id)
          dias[dia].push({ rol_id: rol, profile_id: id, tipo: null })
        }
      }
    }

    for (const id of votantes) {
      if (!asignados.has(id)) noAsignados[dia].push(id)
    }
  }

  return { dias, noAsignados }
}
// ============ FIN DEL MOTOR ============

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function toDateString(d: Date): string {
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function inicioSemana(fecha: Date): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return d
}

function offsetDia(dia: DiaSemana): number {
  const map: Record<DiaSemana, number> = { Martes: 1, Jueves: 3, Sabado: 5, Domingo: 6 }
  return map[dia]
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const cronSecret = Deno.env.get('CRON_SECRET') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  // Si CRON_SECRET está configurado, se exige el encabezado.
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  const url = new URL(req.url)
  const semanaParam = url.searchParams.get('semana')

  const semanaInicio = semanaParam
    ? new Date(`${semanaParam}T00:00:00`)
    : inicioSemana(new Date())
  const semanaStr = toDateString(semanaInicio)

  const db = createClient(supabaseUrl, serviceRoleKey)

  const { data: votos } = await db
    .from('votos')
    .select('profile_id, dia_semana')
    .eq('semana_inicio', semanaStr)

  const { data: perfiles } = await db
    .from('profiles')
    .select('id')

  const { data: profileRoles } = await db
    .from('profile_roles')
    .select('profile_id, rol_id')

  // Histórico de asignaciones para el contador de equidad (excluye la semana actual)
  const { data: historico } = await db
    .from('programaciones')
    .select('profile_id, rol_id')
    .neq('semana_inicio', semanaStr)

  const votosPorDia: Record<DiaSemana, string[]> = {
    Martes: [],
    Jueves: [],
    Sabado: [],
    Domingo: [],
  }
  for (const voto of votos ?? []) {
    const dia = voto.dia_semana as DiaSemana
    if (dia in votosPorDia) votosPorDia[dia].push(voto.profile_id as string)
  }

  const rolesPorPerfil: Record<string, number[]> = {}
  for (const pr of profileRoles ?? []) {
    const id = pr.profile_id as string
    rolesPorPerfil[id] ??= []
    rolesPorPerfil[id].push(pr.rol_id as number)
  }

  const conteos: Record<number, Record<string, number>> = {}
  for (const h of historico ?? []) {
    const rid = h.rol_id as number
    const pid = h.profile_id as string
    conteos[rid] ??= {}
    conteos[rid][pid] = (conteos[rid][pid] ?? 0) + 1
  }

  const resultado = calcularProgramacion({ votosPorDia, rolesPorPerfil, conteos })

  // Regenerar: borra la programación existente de la semana y crea la nueva
  await db.from('programaciones').delete().eq('semana_inicio', semanaStr)

  const filas = []
  for (const dia of DIAS_SEMANA) {
    const offset = offsetDia(dia)
    const fecha = new Date(semanaInicio)
    fecha.setDate(fecha.getDate() + offset)
    const fechaStr = toDateString(fecha)
    for (const asignacion of resultado.dias[dia]) {
      filas.push({
        semana_inicio: semanaStr,
        fecha: fechaStr,
        dia_semana: dia,
        rol_id: asignacion.rol_id,
        profile_id: asignacion.profile_id,
        tipo: asignacion.tipo,
      })
    }
  }

  if (filas.length > 0) {
    const { error } = await db.from('programaciones').insert(filas)
    if (error) return json({ error: error.message }, 500)
  }

  const total = filas.length
  const conVotos = Object.keys(votosPorDia).reduce(
    (acc, d) => acc + votosPorDia[d as DiaSemana].length,
    0,
  )

  return json({
    ok: true,
    semana: semanaStr,
    dias_generados: total,
    votantes: conVotos,
    perfiles_en_sistema: (perfiles ?? []).length,
  })
})
