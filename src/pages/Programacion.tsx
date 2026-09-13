import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import SemanaSelector from '../components/SemanaSelector'
import { useSemana } from '../hooks/useSemana'
import { DIAS_SEMANA, ORDEN_ROL, ROL_EMOJI, type DiaSemana } from '../lib/planificador'
import { toDateString, fechaDeDia, formatFechaLarga } from '../lib/dias'
import {
  guardarCacheProgramacion,
  leerCacheSemana,
  esCacheFresca,
  invalidarCacheProgramacion,
  leerCacheGlobal,
  guardarCacheGlobal,
  type CacheSemana,
} from '../lib/cache'
import {
  generarProgramacionSemana,
  obtenerConteosHistoricos,
  obtenerDiasConfig,
  guardarDiasConfig,
  obtenerPerfiles,
  obtenerProgramacionSemana,
  obtenerRepertorios,
  obtenerRoles,
  obtenerMapaRoles,
  obtenerVotosSemana,
  guardarRepertorio,
  nombreDeId,
  type DiaConfig,
} from '../lib/api'
import type { Perfil, ProgramacionRow, RepertorioDia, Rol } from '../types'

interface Agrupado {
  [rolId: number]: ProgramacionRow[]
}

interface DiaExtra {
  nombre: string
  fecha: string
}

export default function Programacion() {
  const { esAdmin } = useAuth()
  const { semana, cambiarSemana } = useSemana()
  const [filas, setFilas] = useState<ProgramacionRow[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [conteos, setConteos] = useState<Record<number, Record<string, number>>>({})
  const [rolesPerfil, setRolesPerfil] = useState<Record<string, number[]>>({})
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [verContadores, setVerContadores] = useState(false)
  const [limiteContadores, setLimiteContadores] = useState(15)
  const [noAsignados, setNoAsignados] = useState<Record<string, string[]>>({})
  const [repertorios, setRepertorios] = useState<RepertorioDia[]>([])
  const [repEdit, setRepEdit] = useState<Record<string, string>>({})
  const [repGuardando, setRepGuardando] = useState<string | null>(null)
  const [votosPorDia, setVotosPorDia] = useState<Record<string, string[]>>({})

  // ── Dias configurados ───────────────────────────────────────
  const [diasConfig, setDiasConfig] = useState<DiaConfig[]>([])

  // ── Edit mode ──────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [edicion, setEdicion] = useState<Record<string, Record<number, string[]>>>({})
  const [filtro, setFiltro] = useState<Record<string, string>>({})
  const [rolesExpandidos, setRolesExpandidos] = useState<Set<string>>(new Set())
  const [diasEdit, setDiasEdit] = useState<DiaExtra[]>([])
  const [nuevoDiaNombre, setNuevoDiaNombre] = useState('')
  const [nuevoDiaFecha, setNuevoDiaFecha] = useState('')

  function aplicarCache(cache: CacheSemana) {
    setFilas(cache.filas)
    setPerfiles(cache.perfiles)
    setRoles(cache.roles)
    setConteos(cache.conteos)
    if (cache.diasConfig) setDiasConfig(cache.diasConfig)
    if (cache.repertorios) setRepertorios(cache.repertorios)
    if (cache.votosPorDia) setVotosPorDia(cache.votosPorDia)
    if (cache.rolesPerfil) setRolesPerfil(cache.rolesPerfil)
  }

  async function cargar(opts: { force?: boolean } = {}) {
    const semanaStr = toDateString(semana)
    const cache = leerCacheSemana(semanaStr)
    const fresca = esCacheFresca(semanaStr)

    // Hidratación desde cache (stale-while-revalidate): mostrar cache al instante y revalidar en background
    if (cache && !opts.force) {
      aplicarCache(cache)
      setCargando(false)
      if (!navigator.onLine) {
        if (!fresca) setError('Sin conexión. Mostrando datos en caché (pueden estar desactualizados).')
        return
      }
      // Aunque esté fresca, revalidar en background para que otros dispositivos vean cambios tras guardar.
      // No retornamos: seguimos al fetch (sin spinner, ya se hidrato)
    } else {
      setCargando(true)
      if (!navigator.onLine) {
        if (cache) {
          aplicarCache(cache)
          setError('Sin conexión. Mostrando datos en caché.')
        } else {
          setError('Sin conexión y sin datos en caché para esta semana.')
        }
        setCargando(false)
        return
      }
    }

    try {
      // Reusar caché global para perfiles/roles (30 min) para reducir consultas
      const global = !opts.force ? leerCacheGlobal() : null
      let perfilesData: Perfil[]
      let rolesData: Rol[]
      let filasData: ProgramacionRow[]
      let conteosData: Record<number, Record<string, number>>
      let repData: RepertorioDia[]
      let votosData: { porDia: Record<string, string[]>; propios: Set<string> }
      let diasData: DiaConfig[]
      let mapa: Record<string, number[]>

      if (global) {
        perfilesData = global.perfiles
        rolesData = global.roles
        ;[filasData, conteosData, repData, votosData, diasData, mapa] = await Promise.all([
          obtenerProgramacionSemana(semanaStr),
          obtenerConteosHistoricos(semanaStr),
          obtenerRepertorios(semanaStr).catch(() => [] as RepertorioDia[]),
          obtenerVotosSemana(semanaStr).catch(() => ({ porDia: {} as Record<string, string[]>, propios: new Set<string>() })),
          obtenerDiasConfig(semanaStr).catch(() => [] as DiaConfig[]),
          obtenerMapaRoles().catch(() => ({} as Record<string, number[]>)),
        ])
      } else {
        const resultados = await Promise.all([
          obtenerProgramacionSemana(semanaStr),
          obtenerPerfiles(),
          obtenerRoles(),
          obtenerConteosHistoricos(semanaStr),
          obtenerRepertorios(semanaStr).catch(() => [] as RepertorioDia[]),
          obtenerVotosSemana(semanaStr).catch(() => ({ porDia: {} as Record<string, string[]>, propios: new Set<string>() })),
          obtenerDiasConfig(semanaStr).catch(() => [] as DiaConfig[]),
          obtenerMapaRoles().catch(() => ({} as Record<string, number[]>)),
        ])
        filasData = resultados[0] as ProgramacionRow[]
        perfilesData = resultados[1] as Perfil[]
        rolesData = resultados[2] as Rol[]
        conteosData = resultados[3] as Record<number, Record<string, number>>
        repData = resultados[4] as RepertorioDia[]
        votosData = resultados[5] as { porDia: Record<string, string[]>; propios: Set<string> }
        diasData = resultados[6] as DiaConfig[]
        mapa = resultados[7] as Record<string, number[]>
        guardarCacheGlobal(perfilesData, rolesData)
      }

      setFilas(filasData)
      setPerfiles(perfilesData)
      setRoles(rolesData)
      setConteos(conteosData)
      setRepertorios(repData)
      setVotosPorDia(votosData.porDia)
      setDiasConfig(diasData)
      setRolesPerfil(mapa)

      guardarCacheProgramacion(semanaStr, {
        filas: filasData,
        perfiles: perfilesData,
        roles: rolesData,
        conteos: conteosData,
        diasConfig: diasData,
        repertorios: repData,
        votosPorDia: votosData.porDia,
        rolesPerfil: mapa,
      })
    } catch {
      if (!cache) setError('No se pudo cargar la programación.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    setError('')
    setMensaje('')
    setEditing(false)
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semana])

  async function generar() {
    if (!window.confirm('¿Generar la programación de esta semana? Se reemplazará la existente.')) return
    setGenerando(true)
    setMensaje('')
    setError('')
    try {
      const resultado = await generarProgramacionSemana(semana)
      setNoAsignados(resultado.noAsignados)
      setMensaje(`Programación generada correctamente (${resultado.asignaciones.length} asignaciones).`)
      // Invalidar cache para forzar refresco fresco y reducir inconsistencia
      invalidarCacheProgramacion(toDateString(semana))
      await cargar({ force: true })
    } catch {
      setError('No se pudo generar la programación. Verifica que tengas permisos de administrador.')
    } finally {
      setGenerando(false)
    }
  }

  // ── Helpers para días visibles ─────────────────────────────
  const diasExistentesExtra = Array.from(
    new Set(filas.map((f) => f.dia_semana).filter((d) => !(DIAS_SEMANA as string[]).includes(d))),
  )

  function diasVisiblesActuales(): DiaExtra[] {
    if (editing) return diasEdit
    if (diasConfig.length > 0) {
      return diasConfig.map((d) => ({ nombre: d.dia_semana, fecha: d.fecha }))
    }
    // Si no hay dias_config (tabla aún no existe o semana sin config) y hay programación guardada,
    // derivar los días visibles desde las filas (respeta borrado de días por defecto)
    if (filas.length > 0) {
      const mapa = new Map<string, string>()
      for (const f of filas) {
        if (!mapa.has(f.dia_semana)) mapa.set(f.dia_semana, f.fecha)
      }
      const lista = Array.from(mapa.entries()).map(([nombre, fecha]) => ({ nombre, fecha }))
      lista.sort((a, b) => a.fecha.localeCompare(b.fecha))
      return lista
    }
    // Fallback legacy: defaults + extras de filas (solo cuando no hay programación aún)
    const base: DiaExtra[] = DIAS_SEMANA.map((nombre) => ({
      nombre,
      fecha: toDateString(fechaDeDia(semana, nombre as DiaSemana)),
    }))
    for (const nombre of diasExistentesExtra) {
      if (!base.find((b) => b.nombre === nombre)) {
        const fila = filas.find((f) => f.dia_semana === nombre)
        base.push({ nombre, fecha: fila?.fecha ?? toDateString(semana) })
      }
    }
    return base
  }

  const diasVisibles = diasVisiblesActuales()
  const todosDiasVisibles = diasVisibles.map((d) => d.nombre)

  function agregarDiaExtra() {
    const nombre = nuevoDiaNombre.trim()
    const fecha = nuevoDiaFecha
    setError('')
    setMensaje('')
    if (!nombre || !fecha) {
      setError('Debes ingresar nombre y fecha para el día especial.')
      return
    }
    const existe = diasEdit.some((d) => d.nombre.toLowerCase() === nombre.toLowerCase())
    if (existe) {
      setError(`Ya existe un día llamado "${nombre}". Usa otro nombre (ej: "${nombre} PM").`)
      return
    }
    setDiasEdit((prev) => [...prev, { nombre, fecha }])
    setEdicion((prev) => ({ ...prev, [nombre]: {} }))
    setFiltro((prev) => ({ ...prev, [nombre]: '' }))
    setNuevoDiaNombre('')
    setNuevoDiaFecha('')
    setMensaje(`Día "${nombre}" agregado. No olvides asignar integrantes y guardar.`)
  }

  function quitarDia(nombre: string) {
    setDiasEdit((prev) => prev.filter((d) => d.nombre !== nombre))
    setEdicion((prev) => {
      const next = { ...prev }
      delete next[nombre]
      return next
    })
    setFiltro((prev) => {
      const next = { ...prev }
      delete next[nombre]
      return next
    })
    setMensaje(`Día "${nombre}" quitado. Recuerda guardar para aplicar cambios.`)
    setError('')
  }

  // ── Edit functions ──────────────────────────────────────────
  function entrarEdicion() {
    const visibles = (() => {
      if (diasConfig.length > 0) {
        return diasConfig.map((d) => ({ nombre: d.dia_semana, fecha: d.fecha }))
      }
      if (filas.length > 0) {
        const mapa = new Map<string, string>()
        for (const f of filas) {
          if (!mapa.has(f.dia_semana)) mapa.set(f.dia_semana, f.fecha)
        }
        const lista = Array.from(mapa.entries()).map(([nombre, fecha]) => ({ nombre, fecha }))
        lista.sort((a, b) => a.fecha.localeCompare(b.fecha))
        return lista
      }
      const base: DiaExtra[] = DIAS_SEMANA.map((nombre) => ({
        nombre,
        fecha: toDateString(fechaDeDia(semana, nombre as DiaSemana)),
      }))
      for (const nombre of diasExistentesExtra) {
        if (!base.find((b) => b.nombre === nombre)) {
          const fila = filas.find((f) => f.dia_semana === nombre)
          base.push({ nombre, fecha: fila?.fecha ?? toDateString(semana) })
        }
      }
      return base
    })()

    const init: Record<string, Record<number, string[]>> = {}
    for (const d of visibles) init[d.nombre] = {}
    for (const fila of filas) {
      const dia = fila.dia_semana
      if (!init[dia]) init[dia] = {}
      init[dia][fila.rol_id] ??= []
      init[dia][fila.rol_id].push(fila.profile_id)
      if (!visibles.find((v) => v.nombre === dia)) {
        visibles.push({ nombre: dia, fecha: fila.fecha })
        init[dia] ??= {}
      }
    }
    for (const d of visibles) init[d.nombre] ??= {}

    setDiasEdit(visibles)
    setEdicion(init)
    const filtroInit: Record<string, string> = {}
    for (const d of visibles) filtroInit[d.nombre] = ''
    setFiltro(filtroInit)
    setEditing(true)
    setRolesExpandidos(new Set())
    setError('')
    setMensaje('')
  }

  function cancelarEdicion() {
    setEditing(false)
    setDiasEdit([])
    setError('')
    setMensaje('')
  }

  function agregarAlSlot(dia: string, rolId: number, profileId: string) {
    setEdicion((prev) => ({
      ...prev,
      [dia]: { ...prev[dia], [rolId]: [...(prev[dia][rolId] ?? []), profileId] },
    }))
  }

  function quitarDelSlot(dia: string, rolId: number, profileId: string) {
    setEdicion((prev) => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        [rolId]: (prev[dia][rolId] ?? []).filter((id) => id !== profileId),
      },
    }))
  }

  function toggleSlot(dia: string, rolId: number, profileId: string) {
    const asignados = edicion[dia]?.[rolId] ?? []
    if (asignados.includes(profileId)) quitarDelSlot(dia, rolId, profileId)
    else agregarAlSlot(dia, rolId, profileId)
  }

  async function guardarEdicion() {
    setError('')
    setMensaje('')
    if (diasEdit.length === 0) {
      setError('Debe haber al menos un día habilitado.')
      return
    }
    const semanaStr = toDateString(semana)
    setGuardando(true)
    try {
      await guardarDiasConfig(
        semanaStr,
        diasEdit.map((d) => ({ dia_semana: d.nombre, fecha: d.fecha })),
      )

      await supabase.from('programaciones').delete().eq('semana_inicio', semanaStr)

      const rows: {
        semana_inicio: string
        fecha: string
        dia_semana: string
        rol_id: number
        profile_id: string
      }[] = []

      for (const diaExtra of diasEdit) {
        const dia = diaExtra.nombre
        const fecha = diaExtra.fecha
        for (const [rolIdStr, personas] of Object.entries(edicion[dia] ?? {})) {
          const rolId = Number(rolIdStr)
          for (const profileId of personas) {
            rows.push({
              semana_inicio: semanaStr,
              fecha,
              dia_semana: dia,
              rol_id: rolId,
              profile_id: profileId,
            })
          }
        }
      }
      if (rows.length > 0) {
        const { error: errIns } = await supabase.from('programaciones').insert(rows)
        if (errIns) throw new Error(errIns.message)
      }

      // Actualizar caché localmente para evitar una consulta extra y mostrar datos frescos al instante
      const nuevasFilas: ProgramacionRow[] = rows.map((r, i) => ({
        id: `tmp-${i}`,
        semana_inicio: r.semana_inicio,
        fecha: r.fecha,
        dia_semana: r.dia_semana,
        rol_id: r.rol_id,
        profile_id: r.profile_id,
        created_at: new Date().toISOString(),
      }))
      const nuevosDiasConfig: DiaConfig[] = diasEdit.map((d) => ({
        semana_inicio: semanaStr,
        dia_semana: d.nombre,
        fecha: d.fecha,
      }))
      setFilas(nuevasFilas)
      setDiasConfig(nuevosDiasConfig)
      guardarCacheProgramacion(semanaStr, {
        filas: nuevasFilas,
        perfiles,
        roles,
        conteos,
        diasConfig: nuevosDiasConfig,
        repertorios,
        votosPorDia,
        rolesPerfil,
      })

      setEditing(false)
      setMensaje('Programación guardada correctamente.')
      // Forzar refresco en background para validar con servidor (sin bloquear UI)
      void cargar({ force: true })
    } catch (e) {
      setError((e as Error).message)
      // En error, invalidar para no dejar caché corrupto
      invalidarCacheProgramacion(semanaStr)
    } finally {
      setGuardando(false)
    }
  }

  // ── Derived data ────────────────────────────────────────────
  const porDia: Record<string, Agrupado> = {}
  for (const fila of filas) {
    const dia = fila.dia_semana
    porDia[dia] ??= {}
    porDia[dia][fila.rol_id] ??= []
    porDia[dia][fila.rol_id].push(fila)
  }

  const totalPorDia = (dia: string): number =>
    Object.values(porDia[dia] ?? {}).reduce((acc, arr) => acc + arr.length, 0)

  const fechaParaDia = (dia: string): string => {
    const extra = diasVisibles.find((d) => d.nombre === dia)
    if (extra?.fecha) {
      const d = new Date(extra.fecha + 'T12:00:00')
      return formatFechaLarga(d)
    }
    if ((DIAS_SEMANA as string[]).includes(dia)) {
      return formatFechaLarga(fechaDeDia(semana, dia as DiaSemana))
    }
    const fila = filas.find((f) => f.dia_semana === dia)
    if (fila?.fecha) {
      const d = new Date(fila.fecha + 'T12:00:00')
      return formatFechaLarga(d)
    }
    return ''
  }

  const conteosOrdenados: { rol: Rol; filas: { perfil: Perfil; veces: number }[] }[] = roles
    .map((rol) => {
      const mapa = conteos[rol.id] ?? {}
      return {
        rol,
        filas: perfiles
          .map((perfil) => ({ perfil, veces: mapa[perfil.id] ?? 0 }))
          .sort((a, b) => b.veces - a.veces),
      }
    })
    .filter((g) => g.filas.some((f) => f.veces > 0))

  const filasConteo = conteosOrdenados.flatMap((g) =>
    g.filas.map((f) => ({ rol: g.rol.nombre, perfil: f.perfil, veces: f.veces })),
  )

  function repDe(dia: string): string {
    return repertorios.find((r) => r.dia_semana === dia)?.repertorio ?? ''
  }

  async function guardarRep(dia: string) {
    const semanaStr = toDateString(semana)
    const texto = (repEdit[dia] ?? '').trim()
    setRepGuardando(dia)
    try {
      await guardarRepertorio(semanaStr, dia, texto)
      setRepertorios((prev) => {
        const filtered = prev.filter((r) => r.dia_semana !== dia)
        if (texto) {
          filtered.push({
            semana_inicio: semanaStr,
            dia_semana: dia,
            repertorio: texto,
            updated_by: null,
            updated_at: new Date().toISOString(),
          })
        }
        // Actualizar caché con repertorio nuevo para no reconsultar
        const nuevos = filtered
        const cache = leerCacheSemana(semanaStr)
        if (cache) {
          guardarCacheProgramacion(semanaStr, { ...cache, repertorios: nuevos })
        }
        return filtered
      })
      setRepEdit((prev) => {
        const next = { ...prev }
        delete next[dia]
        return next
      })
    } catch {
      setError('No se pudo guardar el repertorio. Intenta de nuevo.')
      invalidarCacheProgramacion(semanaStr)
    } finally {
      setRepGuardando(null)
    }
  }

  return (
    <div className="pagina">
      <div className="encabezado-fila">
        <h2>Programación de la semana</h2>
        {esAdmin && !editing && (
          <div className="acciones-admin">
            <button type="button" className="btn btn-primary" onClick={() => void generar()} disabled={generando}>
              {generando ? 'Generando…' : 'Generar programación'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={entrarEdicion}>
              Modificar
            </button>
          </div>
        )}
        {editing && (
          <div className="acciones-admin">
            <button type="button" className="btn btn-primary" onClick={() => void guardarEdicion()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelarEdicion} disabled={guardando}>
              Cancelar
            </button>
          </div>
        )}
      </div>
      <p className="subtitulo">
        {editing
          ? 'Quita días que no necesites, agrega días especiales (puedes repetir fecha para varias programaciones el mismo día) y asigna integrantes.'
          : 'Cada semana se genera en automático, procurando un reparto justo según la disponibilidad de cada integrante.'}
      </p>

      <SemanaSelector semana={semana} onChange={cambiarSemana} />

      {mensaje && <p className="ok">{mensaje}</p>}
      {error && <p className="error">{error}</p>}
      {cargando ? (
        <div className="centrado">Cargando…</div>
      ) : (
        <div className="grid-dias">
          {todosDiasVisibles.length === 0 ? (
            <div className="card dia-card-estatico">
              <p className="vacio">No hay días habilitados para esta semana. Agrega uno en modo Modificar.</p>
            </div>
          ) : (
            todosDiasVisibles.map((dia) => (
              <div key={dia} className="card dia-card-estatico">
                <div className="dia-head">
                  <span className="dia-nombre">{dia}</span>
                  <span className="dia-fecha">{fechaParaDia(dia)}</span>
                  {editing && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => quitarDia(dia)}
                      style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--alerta, #dc2626)' }}
                    >
                      Quitar día
                    </button>
                  )}
                </div>

                {!editing && (
                  <>
                    {totalPorDia(dia) === 0 ? (
                      <p className="vacio">Aún no hay programación para esta fecha.</p>
                    ) : (
                      <div className="rol-lista">
                        {ORDEN_ROL.map((rolId) => {
                          const filasRol = porDia[dia]?.[rolId] ?? []
                          if (filasRol.length === 0) return null
                          const rol = roles.find((r) => r.id === rolId)
                          return (
                            <div key={rolId} className="rol-grupo">
                              <span className="rol-nombre">
                                {ROL_EMOJI[rolId] ?? ''} {rol?.nombre ?? `Rol ${rolId}`}
                              </span>
                              <div className="rol-miembros">
                                {filasRol.map((f) => (
                                  <span key={f.id} className="chip">
                                    {nombreDeId(perfiles, f.profile_id)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {editing && (
                  <>
                    <div className="filtro-dia">
                      <input
                        type="text"
                        placeholder="Buscar integrante…"
                        className="filtro-input"
                        value={filtro[dia] ?? ''}
                        onChange={(e) => setFiltro((prev) => ({ ...prev, [dia]: e.target.value }))}
                      />
                      {filtro[dia] && (
                        <button
                          type="button"
                          className="filtro-clear"
                          onClick={() => setFiltro((prev) => ({ ...prev, [dia]: '' }))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="rol-lista">
                      {ORDEN_ROL.map((rolId) => {
                        const rol = roles.find((r) => r.id === rolId)
                        const asignados = edicion[dia]?.[rolId] ?? []
                        const asignadosSet = new Set(asignados)
                        const texto = (filtro[dia] ?? '').toLowerCase()
                        const tieneBusqueda = texto.length > 0
                        const claveRol = `${dia}-${rolId}`
                        const expandido = tieneBusqueda || rolesExpandidos.has(claveRol)
                        const votantes = new Set(votosPorDia[dia] ?? [])
                        const todos = perfiles.filter(
                          (p) =>
                            p.is_activo &&
                            (rolesPerfil[p.id] ?? []).includes(rolId) &&
                            (!texto || p.nombre.toLowerCase().includes(texto)),
                        )
                        const asignadosLista = todos.filter((p) => asignadosSet.has(p.id))
                        const noAsignadosLista = todos.filter((p) => !asignadosSet.has(p.id))

                        function chipBadge(p: { id: string; nombre: string }, asignado: boolean) {
                          const disponible = votantes.has(p.id)
                          const cls = `badge-persona ${asignado ? 'badge-asignado' : ''} ${disponible ? 'badge-ok-soft' : 'badge-no-soft'}`
                          return (
                            <label key={p.id} className={cls}>
                              <input
                                type="checkbox"
                                checked={asignado}
                                onChange={() => toggleSlot(dia, rolId, p.id)}
                              />
                              <span className="badge-nombre">{p.nombre}</span>
                              <span className={`badge-dot ${disponible ? 'dot-verde' : 'dot-rojo'}`} />
                            </label>
                          )
                        }

                        return (
                          <div key={rolId} className="rol-grupo">
                            <span className="rol-nombre">
                              {ROL_EMOJI[rolId] ?? ''} {rol?.nombre ?? `Rol ${rolId}`}
                            </span>
                            {todos.length === 0 ? (
                              <span className="muted">{texto ? 'Sin resultados' : 'Sin integrantes'}</span>
                            ) : (
                              <>
                                <div className="checklist">
                                  {asignadosLista.map((p) => chipBadge(p, true))}
                                </div>
                                {noAsignadosLista.length > 0 && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm ver-mas-btn"
                                      onClick={() =>
                                        setRolesExpandidos((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(claveRol)) next.delete(claveRol)
                                          else next.add(claveRol)
                                          return next
                                        })
                                      }
                                    >
                                      {expandido && !tieneBusqueda
                                        ? `Ocultar (${noAsignadosLista.length})`
                                        : `+ Agregar (${noAsignadosLista.length})`}
                                    </button>
                                    {expandido && (
                                      <div className="checklist">
                                        {noAsignadosLista.map((p) => chipBadge(p, false))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {((noAsignados[dia] ?? []).length > 0) && (
                  <p className="aviso">
                    Sin cupo para esta fecha: {(noAsignados[dia] ?? []).map((id) => nombreDeId(perfiles, id)).join(', ')}
                  </p>
                )}
                {totalPorDia(dia) > 0 && (
                  <div className="repertorio-seccion">
                    <label className="repertorio-label">Repertorio</label>
                    {(!repDe(dia) || esAdmin) ? (
                      <>
                        <textarea
                          className="repertorio-textarea"
                          rows={3}
                          placeholder="Escribe el repertorio del día..."
                          disabled={!navigator.onLine}
                          value={repEdit[dia] ?? repDe(dia)}
                          onChange={(e) => setRepEdit((prev) => ({ ...prev, [dia]: e.target.value }))}
                        />
                        {(repEdit[dia] ?? '') !== repDe(dia) && navigator.onLine && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={repGuardando === dia}
                            onClick={() => void guardarRep(dia)}
                          >
                            {repGuardando === dia ? 'Guardando…' : 'Guardar repertorio'}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="repertorio-texto">{repDe(dia)}</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {editing && (
            <div className="card dia-card-estatico agregar-dia-card">
              <p className="agregar-dia-titulo">+ Agregar día especial</p>
              <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                Elige un día <strong>dentro de la semana seleccionada</strong> ({toDateString(semana)} –{' '}
                {toDateString(new Date(semana.getTime() + 6 * 86400000))}). Puedes repetir fecha para dos
                programaciones el mismo día (ej: Domingo AM y Domingo PM).
              </p>
              <input
                type="text"
                placeholder="Nombre del día (ej: Miércoles, Domingo PM)"
                className="filtro-input"
                value={nuevoDiaNombre}
                onChange={(e) => setNuevoDiaNombre(e.target.value)}
              />
              {/* Calendario bonito limitado a la semana */}
              <div className="calendario-mini" style={{ marginTop: '0.6rem' }}>
                <div className="calendario-mini-header">
                  {semana.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </div>
                <div className="calendario-mini-grid">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(semana)
                    d.setHours(12, 0, 0, 0)
                    d.setDate(d.getDate() + i)
                    const fechaStr = toDateString(d)
                    const seleccionado = nuevoDiaFecha === fechaStr
                    const diaSem = d.toLocaleDateString('es-ES', { weekday: 'short' })
                    const yaUsado = diasEdit.some((de) => de.fecha === fechaStr)
                    return (
                      <button
                        key={fechaStr}
                        type="button"
                        className={`cal-dia ${seleccionado ? 'cal-dia-seleccionado' : ''} ${yaUsado ? 'cal-dia-usado' : ''}`}
                        onClick={() => setNuevoDiaFecha(fechaStr)}
                        title={`${diaSem} ${fechaStr}${yaUsado ? ' (ya hay programación ese día)' : ''}`}
                      >
                        <span className="cal-dia-sem">{diaSem}</span>
                        <span className="cal-dia-num">{d.getDate()}</span>
                        {yaUsado && <span className="cal-dia-punto" />}
                      </button>
                    )
                  })}
                </div>
                {nuevoDiaFecha && (
                  <p className="cal-seleccionado">
                    Seleccionado: <strong>{new Date(nuevoDiaFecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>{' '}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevoDiaFecha('')}>
                      Quitar
                    </button>
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={agregarDiaExtra}
                disabled={!nuevoDiaNombre.trim() || !nuevoDiaFecha}
                style={{ marginTop: '0.6rem' }}
              >
                Agregar día
              </button>
            </div>
          )}
        </div>
      )}

      {esAdmin && conteosOrdenados.length > 0 && (
        <section className="card">
          <div className="encabezado-fila">
            <h3>Contador por rol</h3>
            <button type="button" className="btn btn-ghost" onClick={() => setVerContadores((v) => !v)}>
              {verContadores ? 'Ocultar' : 'Ver contador por rol'}
            </button>
          </div>
          <p className="subtitulo">Historial de asignaciones, para que el reparto entre los integrantes sea justo.</p>
          {verContadores && (
            <>
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Rol</th>
                      <th>Integrante</th>
                      <th>Veces asignado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasConteo.slice(0, limiteContadores).map((fila, i) => (
                      <tr key={`${fila.rol}-${fila.perfil.id}-${i}`}>
                        <td>{fila.rol}</td>
                        <td>{fila.perfil.nombre}</td>
                        <td>{fila.veces}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filasConteo.length > limiteContadores && (
                <button type="button" className="btn btn-ghost" onClick={() => setLimiteContadores((l) => l + 15)}>
                  Ver más ({filasConteo.length - limiteContadores} restantes)
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
