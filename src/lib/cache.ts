import type { Perfil, ProgramacionRow, RepertorioDia, Rol } from '../types'
import type { DiaConfig } from './api'

// ── Config ───────────────────────────────────────────────────
const CACHE_VERSION = 2
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min: si el cache es más fresco, no se consulta al servidor
const MAX_SEMANAS_EN_CACHE = 8
const CLAVE_CACHE_V2 = `prog_cache_v${CACHE_VERSION}`
const CLAVE_CACHE_LEGACY = 'prog_cache_programaciones'
const CLAVE_SEMANA = 'prog_semana_seleccionada'
const CLAVE_GLOBAL = `prog_global_v${CACHE_VERSION}`

export interface CacheSemana {
  guardadoEn: string // ISO
  filas: ProgramacionRow[]
  perfiles: Perfil[]
  roles: Rol[]
  conteos: Record<number, Record<string, number>>
  // opcionales para reducir consultas futuras (si se guardan, se reutilizan)
  diasConfig?: DiaConfig[]
  repertorios?: RepertorioDia[]
  votosPorDia?: Record<string, string[]>
  rolesPerfil?: Record<string, number[]>
}

type CacheProgramaciones = Record<string, CacheSemana>

interface StoreV2 {
  version: number
  semanas: CacheProgramaciones
}

// ── Utilidades localStorage ──────────────────────────────────
function leerJson<T>(clave: string): T | null {
  try {
    const raw = localStorage.getItem(clave)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function escribirJson(clave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
    return true
  } catch {
    // quota excedida: intentar limpiar expirados y reintentar una vez
    try {
      limpiarCacheExpirada(CACHE_TTL_MS * 2)
      localStorage.setItem(clave, JSON.stringify(valor))
      return true
    } catch {
      return false
    }
  }
}

// ── Migración legacy ─────────────────────────────────────────
function migrarLegacy(): void {
  try {
    const legacy = leerJson<CacheProgramaciones>(CLAVE_CACHE_LEGACY)
    if (!legacy || Object.keys(legacy).length === 0) return
    const actual = leerStore()
    let migrado = false
    for (const [semana, data] of Object.entries(legacy)) {
      if (!actual.semanas[semana]) {
        actual.semanas[semana] = data as CacheSemana
        migrado = true
      }
    }
    if (migrado) escribirJson(CLAVE_CACHE_V2, actual)
    localStorage.removeItem(CLAVE_CACHE_LEGACY)
  } catch {
    /* ignorar */
  }
}

function leerStore(): StoreV2 {
  migrarLegacy()
  const raw = leerJson<StoreV2>(CLAVE_CACHE_V2)
  if (raw && typeof raw === 'object' && raw.version === CACHE_VERSION && raw.semanas) {
    return raw
  }
  return { version: CACHE_VERSION, semanas: {} }
}

function escribirStore(store: StoreV2) {
  // limitar tamaño: conservar solo las N semanas más recientes
  const entradas = Object.entries(store.semanas).sort(
    (a, b) => new Date(b[1].guardadoEn).getTime() - new Date(a[1].guardadoEn).getTime(),
  )
  if (entradas.length > MAX_SEMANAS_EN_CACHE) {
    store.semanas = Object.fromEntries(entradas.slice(0, MAX_SEMANAS_EN_CACHE))
  }
  escribirJson(CLAVE_CACHE_V2, store)
}

// ── API pública (compat) ─────────────────────────────────────
export function leerCacheProgramaciones(): CacheProgramaciones {
  return leerStore().semanas
}

export function leerCacheSemana(semana: string): CacheSemana | null {
  return leerStore().semanas[semana] ?? null
}

export function esCacheFresca(semana: string, ttlMs: number = CACHE_TTL_MS): boolean {
  const c = leerCacheSemana(semana)
  if (!c?.guardadoEn) return false
  const edad = Date.now() - new Date(c.guardadoEn).getTime()
  return edad >= 0 && edad < ttlMs
}

export function guardarCacheProgramacion(
  semana: string,
  datos: Omit<CacheSemana, 'guardadoEn'>,
) {
  const store = leerStore()
  store.semanas[semana] = { ...datos, guardadoEn: new Date().toISOString() }
  escribirStore(store)
}

/** Invalida solo una semana (borra su entrada). Úsalo tras guardar/generar. */
export function invalidarCacheProgramacion(semana: string) {
  const store = leerStore()
  if (store.semanas[semana]) {
    delete store.semanas[semana]
    escribirStore(store)
  }
}

/** Invalida toda la caché de programaciones (ej. logout, cambio de versión). */
export function invalidarTodoCache() {
  try {
    localStorage.removeItem(CLAVE_CACHE_V2)
    localStorage.removeItem(CLAVE_CACHE_LEGACY)
  } catch {
    /* ignorar */
  }
}

/** Borra entradas más viejas que ttlMs (por defecto 2x TTL). */
export function limpiarCacheExpirada(ttlMs: number = CACHE_TTL_MS * 2) {
  const store = leerStore()
  const ahora = Date.now()
  let cambios = false
  for (const [semana, c] of Object.entries(store.semanas)) {
    const edad = ahora - new Date(c.guardadoEn).getTime()
    if (Number.isNaN(edad) || edad > ttlMs) {
      delete store.semanas[semana]
      cambios = true
    }
  }
  if (cambios) escribirStore(store)
}

// ── Caché global (perfiles/roles) ────────────────────────────
// Para reducir consultas de datos que cambian poco, se cachean 30 min.
const GLOBAL_TTL_MS = 30 * 60 * 1000

interface GlobalCache {
  guardadoEn: string
  perfiles: Perfil[]
  roles: Rol[]
}

export function leerCacheGlobal(): GlobalCache | null {
  const data = leerJson<GlobalCache>(CLAVE_GLOBAL)
  if (!data?.guardadoEn) return null
  const edad = Date.now() - new Date(data.guardadoEn).getTime()
  if (edad < 0 || edad > GLOBAL_TTL_MS) return null
  return data
}

export function guardarCacheGlobal(perfiles: Perfil[], roles: Rol[]) {
  escribirJson(CLAVE_GLOBAL, { perfiles, roles, guardadoEn: new Date().toISOString() } as GlobalCache)
}

export function invalidarCacheGlobal() {
  try {
    localStorage.removeItem(CLAVE_GLOBAL)
  } catch {
    /* ignorar */
  }
}

// ── Disponibilidad por usuario (solo la ve el propio usuario) ──
// Clave: prog_disp_v2 -> Record<`${userId}:${semana}`, DispCache>
const CLAVE_DISP = `prog_disp_v${CACHE_VERSION}`
const DISP_TTL_MS = 3 * 60 * 1000 // 3 min para disponibilidad personal

export interface DispCache {
  guardadoEn: string
  votos: string[] // propios (dias donde el usuario votó)
  dias: { nombre: string; fecha: string }[]
  misRoles: number[]
}

type DispStore = Record<string, DispCache>

function claveDisp(userId: string, semana: string): string {
  return `${userId}:${semana}`
}

function leerDispStore(): DispStore {
  return leerJson<DispStore>(CLAVE_DISP) ?? {}
}

function escribirDispStore(store: DispStore) {
  // limitar a 16 entradas (8 semanas x2 usuarios aprox) para no crecer sin límite
  const entradas = Object.entries(store).sort((a, b) => new Date(b[1].guardadoEn).getTime() - new Date(a[1].guardadoEn).getTime())
  const recortado = Object.fromEntries(entradas.slice(0, 16))
  escribirJson(CLAVE_DISP, recortado)
}

export function leerCacheDisponibilidad(userId: string, semana: string): DispCache | null {
  const store = leerDispStore()
  return store[claveDisp(userId, semana)] ?? null
}

export function esCacheDispFresca(userId: string, semana: string, ttlMs: number = DISP_TTL_MS): boolean {
  const c = leerCacheDisponibilidad(userId, semana)
  if (!c?.guardadoEn) return false
  const edad = Date.now() - new Date(c.guardadoEn).getTime()
  return edad >= 0 && edad < ttlMs
}

export function guardarCacheDisponibilidad(
  userId: string,
  semana: string,
  datos: Omit<DispCache, 'guardadoEn'>,
) {
  const store = leerDispStore()
  store[claveDisp(userId, semana)] = { ...datos, guardadoEn: new Date().toISOString() }
  escribirDispStore(store)
}

export function invalidarCacheDisponibilidad(userId: string, semana: string) {
  const store = leerDispStore()
  const k = claveDisp(userId, semana)
  if (store[k]) {
    delete store[k]
    escribirJson(CLAVE_DISP, store)
  }
}

export function invalidarCacheDisponibilidadUsuario(userId: string) {
  const store = leerDispStore()
  let cambios = false
  for (const k of Object.keys(store)) {
    if (k.startsWith(`${userId}:`)) {
      delete store[k]
      cambios = true
    }
  }
  if (cambios) escribirJson(CLAVE_DISP, store)
}

export const DISP_TTL = DISP_TTL_MS

// ── Votos por semana (vista admin) ───────────────────────────
const CLAVE_VOTOS = `prog_votos_v${CACHE_VERSION}`
const VOTOS_TTL_MS = 2 * 60 * 1000 // 2 min, los votos cambian seguido

export interface VotosCache {
  guardadoEn: string
  perfiles: Perfil[]
  porDia: Record<string, string[]>
  diasConfig: import('./api').DiaConfig[]
}

type VotosStore = Record<string, VotosCache> // key = semana

function leerVotosStore(): VotosStore {
  return leerJson<VotosStore>(CLAVE_VOTOS) ?? {}
}
function escribirVotosStore(store: VotosStore) {
  const entradas = Object.entries(store).sort((a, b) => new Date(b[1].guardadoEn).getTime() - new Date(a[1].guardadoEn).getTime())
  escribirJson(CLAVE_VOTOS, Object.fromEntries(entradas.slice(0, 8)))
}
export function leerCacheVotos(semana: string): VotosCache | null {
  return leerVotosStore()[semana] ?? null
}
export function esCacheVotosFresca(semana: string, ttlMs: number = VOTOS_TTL_MS): boolean {
  const c = leerCacheVotos(semana)
  if (!c?.guardadoEn) return false
  const edad = Date.now() - new Date(c.guardadoEn).getTime()
  return edad >= 0 && edad < ttlMs
}
export function guardarCacheVotos(semana: string, datos: Omit<VotosCache, 'guardadoEn'>) {
  const store = leerVotosStore()
  store[semana] = { ...datos, guardadoEn: new Date().toISOString() }
  escribirVotosStore(store)
}
export function invalidarCacheVotos(semana: string) {
  const store = leerVotosStore()
  if (store[semana]) {
    delete store[semana]
    escribirJson(CLAVE_VOTOS, store)
  }
}
export function invalidarTodoVotos() {
  try {
    localStorage.removeItem(CLAVE_VOTOS)
  } catch {
    /* ignorar */
  }
}

// ── Usuarios (admin) ─────────────────────────────────────────
const CLAVE_USUARIOS = `prog_usuarios_v${CACHE_VERSION}`
const USUARIOS_TTL_MS = 5 * 60 * 1000 // 5 min

export interface UsuariosCache {
  guardadoEn: string
  perfiles: Perfil[]
  roles: Rol[]
  rolesPerfil: Record<string, number[]>
}

export function leerCacheUsuarios(): UsuariosCache | null {
  const data = leerJson<UsuariosCache>(CLAVE_USUARIOS)
  if (!data?.guardadoEn) return null
  const edad = Date.now() - new Date(data.guardadoEn).getTime()
  if (edad < 0 || edad > USUARIOS_TTL_MS) return null
  return data
}
export function esCacheUsuariosFresca(): boolean {
  const c = leerCacheUsuarios()
  return !!c
}
export function guardarCacheUsuarios(datos: Omit<UsuariosCache, 'guardadoEn'>) {
  escribirJson(CLAVE_USUARIOS, { ...datos, guardadoEn: new Date().toISOString() } as UsuariosCache)
}
export function invalidarCacheUsuarios() {
  try {
    localStorage.removeItem(CLAVE_USUARIOS)
  } catch {
    /* ignorar */
  }
}

export const VOTOS_TTL = VOTOS_TTL_MS
export const USUARIOS_TTL = USUARIOS_TTL_MS

// ── Semana seleccionada (sin cambios) ────────────────────────
export function guardarSemanaSeleccionada(semanaStr: string, clave = CLAVE_SEMANA) {
  try {
    localStorage.setItem(clave, semanaStr)
  } catch {
    // Almacenamiento no disponible: se ignora.
  }
}

export function leerSemanaSeleccionada(clave = CLAVE_SEMANA): string | null {
  const valor = leerJson<string>(clave)
  return typeof valor === 'string' && valor ? valor : null
}

// ── Constantes exportadas para tests / UI ────────────────────
export const CACHE_TTL = CACHE_TTL_MS
export const GLOBAL_CACHE_TTL = GLOBAL_TTL_MS
