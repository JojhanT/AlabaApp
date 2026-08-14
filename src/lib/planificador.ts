// IMPORTANTE: este archivo es la versión fuente del motor de programación.
// Mantén sincronizada la copia incrustada en
// supabase/functions/generar-programacion/index.ts (la edge function se sube
// como un solo archivo en el dashboard de Supabase).

export type DiaSemana = 'Martes' | 'Jueves' | 'Sabado' | 'Domingo'

export const DIAS_SEMANA: DiaSemana[] = ['Martes', 'Jueves', 'Sabado', 'Domingo']

export const ROL_ID = {
  CANTANTE: 1,
  PIANO: 2,
  GUITARRA: 3,
  BATERIA: 4,
  SAXOFONISTA: 5,
} as const

export type TipoAsignacion = 'lider' | 'apoyo' | null

export interface Asignacion {
  rol_id: number
  profile_id: string
  tipo: TipoAsignacion
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

export const CUPOS: Record<number, number | 'todos' | 'especial'> = {
  [ROL_ID.CANTANTE]: 'especial',
  [ROL_ID.PIANO]: 1,
  [ROL_ID.BATERIA]: 1,
  [ROL_ID.GUITARRA]: 'todos',
  [ROL_ID.SAXOFONISTA]: 'todos',
}

export const ORDEN_ROL: number[] = [
  ROL_ID.CANTANTE,
  ROL_ID.PIANO,
  ROL_ID.BATERIA,
  ROL_ID.GUITARRA,
  ROL_ID.SAXOFONISTA,
]

export const MAX_APOYOS = 3

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
