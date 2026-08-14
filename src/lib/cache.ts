import type { Perfil, ProgramacionRow, Rol } from '../types'

const CLAVE_CACHE_PROGRAMACIONES = 'prog_cache_programaciones'
const CLAVE_SEMANA = 'prog_semana_seleccionada'

export interface CacheSemana {
  guardadoEn: string
  filas: ProgramacionRow[]
  perfiles: Perfil[]
  roles: Rol[]
  conteos: Record<number, Record<string, number>>
}

type CacheProgramaciones = Record<string, CacheSemana>

function leerJson<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function leerCacheProgramaciones(): CacheProgramaciones {
  return leerJson<CacheProgramaciones>(CLAVE_CACHE_PROGRAMACIONES) ?? {}
}

export function guardarCacheProgramacion(
  semana: string,
  datos: Omit<CacheSemana, 'guardadoEn'>,
) {
  try {
    // Solo se conserva la semana actual: las anteriores se descartan.
    const nueva: CacheProgramaciones = {
      [semana]: { ...datos, guardadoEn: new Date().toISOString() },
    }
    localStorage.setItem(CLAVE_CACHE_PROGRAMACIONES, JSON.stringify(nueva))
  } catch {
    // Almacenamiento no disponible o lleno: se ignora.
  }
}

export function guardarSemanaSeleccionada(semanaStr: string) {
  try {
    localStorage.setItem(CLAVE_SEMANA, semanaStr)
  } catch {
    // Almacenamiento no disponible: se ignora.
  }
}

export function leerSemanaSeleccionada(): string | null {
  const valor = leerJson<string>(CLAVE_SEMANA)
  return typeof valor === 'string' && valor ? valor : null
}
