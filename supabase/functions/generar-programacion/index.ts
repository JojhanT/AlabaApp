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
  PIANO: 2,
  GUITARRA: 3,
  BATERIA: 4,
  SAXOFONISTA: 5,
  LIDER: 6,
  APOYO: 7,
} as const

interface Asignacion {
  rol_id: number
  profile_id: string
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

const CUPOS: Record<number, number> = {
  [ROL_ID.LIDER]: 1,
  [ROL_ID.PIANO]: 1,
  [ROL_ID.BATERIA]: 1,
  [ROL_ID.GUITARRA]: 1,
  [ROL_ID.SAXOFONISTA]: 1,
  [ROL_ID.APOYO]: 3,
}

const ORDEN_ROL: number[] = [
  ROL_ID.LIDER,
  ROL_ID.PIANO,
  ROL_ID.BATERIA,
  ROL_ID.GUITARRA,
  ROL_ID.SAXOFONISTA,
  ROL_ID.APOYO,
]

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
    let liderId: string | null = null
    let liderDoble = false

    for (const rol of ORDEN_ROL) {
      const conteosRol = entrada.conteos[rol] ?? {}
      let candidatos = [...votantes]
        .filter((id) => (entrada.rolesPorPerfil[id] ?? []).includes(rol) && !asignados.has(id))
        .sort(compararPorConteo(conteosRol))

      if (
        candidatos.length === 0 &&
        rol === ROL_ID.PIANO &&
        liderId &&
        !liderDoble &&
        (entrada.rolesPorPerfil[liderId] ?? []).includes(ROL_ID.PIANO)
      ) {
        candidatos = [liderId]
      }

      const cupo = CUPOS[rol]
      const elegidos = candidatos.slice(0, cupo)
      for (const id of elegidos) {
        asignados.add(id)
        if (rol === ROL_ID.LIDER) liderId = id
        if (liderId && id === liderId && rol !== ROL_ID.LIDER) liderDoble = true
        dias[dia].push({ rol_id: rol, profile_id: id })
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
