// IMPORTANTE: este archivo es la versión fuente del motor de programación.
// Mantén sincronizada la copia incrustada en
// supabase/functions/generar-programacion/index.ts (la edge function se sube
// como un solo archivo en el dashboard de Supabase).

export type DiaSemana = 'Martes' | 'Jueves' | 'Sabado' | 'Domingo'

export const DIAS_SEMANA: DiaSemana[] = ['Martes', 'Jueves', 'Sabado', 'Domingo']

export const ROL_ID = {
  PIANO: 2,
  GUITARRA: 3,
  BATERIA: 4,
  SAXOFONISTA: 5,
  LIDER: 6,
  APOYO: 7,
} as const

export const ROL_EMOJI: Record<number, string> = {
  [ROL_ID.LIDER]: '🎤',
  [ROL_ID.PIANO]: '🎹',
  [ROL_ID.GUITARRA]: '🎸',
  [ROL_ID.BATERIA]: '🥁',
  [ROL_ID.SAXOFONISTA]: '🎷',
  [ROL_ID.APOYO]: '🎶',
}

export interface Asignacion {
  rol_id: number
  profile_id: string
}

export interface EntradaPlanificacion {
  votosPorDia: Record<DiaSemana, string[]>
  rolesPorPerfil: Record<string, number[]>
  conteos: Record<number, Record<string, number>>
}

export interface ResultadoPlanificacion {
  dias: Record<DiaSemana, Asignacion[]>
  noAsignados: Record<DiaSemana, string[]>
}

// Cuántas personas se asignan por rol cada día.
// Un líder NO puede ser apoyo el mismo día (el motor lo excluye).
export const CUPOS: Record<number, number> = {
  [ROL_ID.LIDER]: 1,
  [ROL_ID.PIANO]: 1,
  [ROL_ID.BATERIA]: 1,
  [ROL_ID.GUITARRA]: 1,
  [ROL_ID.SAXOFONISTA]: 1,
  [ROL_ID.APOYO]: 3,
}

// Orden en que se asignan: primero el líder, luego instrumentistas, al final apoyos.
export const ORDEN_ROL: number[] = [
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

export function calcularProgramacion(entrada: EntradaPlanificacion): ResultadoPlanificacion {
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

      // Solo el líder puede duplicarse con PIANO (y solo si él toca piano),
      // únicamente como respaldo cuando no hay otro pianista disponible.
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
