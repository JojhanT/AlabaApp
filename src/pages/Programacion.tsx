import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import SemanaSelector from '../components/SemanaSelector'
import { useSemana } from '../hooks/useSemana'
import { DIAS_SEMANA, ORDEN_ROL, ROL_EMOJI, type DiaSemana } from '../lib/planificador'
import { toDateString, fechaDeDia, formatFechaLarga } from '../lib/dias'
import {
  guardarCacheProgramacion,
  leerCacheProgramaciones,
  type CacheSemana,
} from '../lib/cache'
import {
  generarProgramacionSemana,
  obtenerConteosHistoricos,
  obtenerPerfiles,
  obtenerProgramacionSemana,
  obtenerRepertorios,
  obtenerRoles,
  obtenerRolesDePerfil,
  obtenerVotosSemana,
  guardarRepertorio,
  nombreDeId,
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
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [verContadores, setVerContadores] = useState(false)
  const [limiteContadores, setLimiteContadores] = useState(15)
  const [noAsignados, setNoAsignados] = useState<Record<DiaSemana, string[]>>({
    Martes: [],
    Jueves: [],
    Sabado: [],
    Domingo: [],
  })
  const [repertorios, setRepertorios] = useState<RepertorioDia[]>([])
  const [repEdit, setRepEdit] = useState<Record<string, string>>({})
  const [repGuardando, setRepGuardando] = useState<string | null>(null)
  const [votosPorDia, setVotosPorDia] = useState<Record<string, string[]>>({
    Martes: [],
    Jueves: [],
    Sabado: [],
    Domingo: [],
  })

  // ── Edit mode ──────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [edicion, setEdicion] = useState<Record<string, Record<number, string[]>>>({
    Martes: {},
    Jueves: {},
    Sabado: {},
    Domingo: {},
  })
  const [filtro, setFiltro] = useState<Record<string, string>>({
    Martes: '',
    Jueves: '',
    Sabado: '',
    Domingo: '',
  })
  const [rolesExpandidos, setRolesExpandidos] = useState<Set<string>>(new Set())
  const [diasExtras, setDiasExtras] = useState<DiaExtra[]>([])
  const [nuevoDiaNombre, setNuevoDiaNombre] = useState('')
  const [nuevoDiaFecha, setNuevoDiaFecha] = useState('')

  function aplicarCache(cache: CacheSemana) {
    setFilas(cache.filas)
    setPerfiles(cache.perfiles)
    setRoles(cache.roles)
    setConteos(cache.conteos)
  }

  async function cargar() {
    const semanaStr = toDateString(semana)
    const cache = leerCacheProgramaciones()[semanaStr]

    if (cache) {
      aplicarCache(cache)
      setCargando(false)
    } else {
      setCargando(true)
    }

    if (!navigator.onLine) {
      setCargando(false)
      return
    }

    try {
      const [filasData, perfilesData, rolesData, conteosData, repData, votosData] = await Promise.all([
        obtenerProgramacionSemana(semanaStr),
        obtenerPerfiles(),
        obtenerRoles(),
        obtenerConteosHistoricos(semanaStr),
        obtenerRepertorios(semanaStr).catch(() => [] as RepertorioDia[]),
        obtenerVotosSemana(semanaStr).catch(() => ({ porDia: { Martes: [], Jueves: [], Sabado: [], Domingo: [] }, propios: new Set() })),
      ])
      setFilas(filasData)
      setPerfiles(perfilesData)
      setRoles(rolesData)
      setConteos(conteosData)
      setRepertorios(repData)
      setVotosPorDia(votosData.porDia)
      guardarCacheProgramacion(semanaStr, {
        filas: filasData,
        perfiles: perfilesData,
        roles: rolesData,
        conteos: conteosData,
      })
      const mapa: Record<string, number[]> = {}
      for (const p of perfilesData) mapa[p.id] = await obtenerRolesDePerfil(p.id)
      setRolesPerfil(mapa)
    } catch {
      if (!cache) setError('No se pudo cargar la programación.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    setError('')
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
      await cargar()
    } catch {
      setError('No se pudo generar la programación. Verifica que tengas permisos de administrador.')
    } finally {
      setGenerando(false)
    }
  }

  // ── Extra days helpers ────────────────────────────────────
  const diasExistentesExtra = Array.from(
    new Set(filas.map((f) => f.dia_semana).filter((d) => !(DIAS_SEMANA as string[]).includes(d))),
  )

  function agregarDiaExtra() {
    const nombre = nuevoDiaNombre.trim()
    const fecha = nuevoDiaFecha
    if (!nombre || !fecha) return
    if ((DIAS_SEMANA as string[]).includes(nombre)) {
      setError('Ese nombre ya es un día estándar. Usa otro nombre (ej: "Miércoles", "Domingo PM").')
      return
    }
    setDiasExtras((prev) => [...prev, { nombre, fecha }])
    setEdicion((prev) => ({ ...prev, [nombre]: {} }))
    setFiltro((prev) => ({ ...prev, [nombre]: '' }))
    setNuevoDiaNombre('')
    setNuevoDiaFecha('')
  }

  function quitarDiaExtra(nombre: string) {
    setDiasExtras((prev) => prev.filter((d) => d.nombre !== nombre))
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
  }

  // ── Edit functions ──────────────────────────────────────────
  function entrarEdicion() {
    const init: Record<string, Record<number, string[]>> = {
      Martes: {},
      Jueves: {},
      Sabado: {},
      Domingo: {},
    }
    const extras: DiaExtra[] = []
    for (const fila of filas) {
      const dia = fila.dia_semana
      if (!init[dia]) init[dia] = {}
      init[dia][fila.rol_id] ??= []
      init[dia][fila.rol_id].push(fila.profile_id)
      if (!(DIAS_SEMANA as string[]).includes(dia)) {
        if (!extras.find((e) => e.nombre === dia)) {
          extras.push({ nombre: dia, fecha: fila.fecha })
        }
      }
    }
    setEdicion(init)
    setDiasExtras(extras)
    setEditing(true)
    setFiltro({ Martes: '', Jueves: '', Sabado: '', Domingo: '' })
    setRolesExpandidos(new Set())
    setError('')
  }

  function cancelarEdicion() {
    setEditing(false)
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
    const semanaStr = toDateString(semana)
    try {
      await supabase.from('programaciones').delete().eq('semana_inicio', semanaStr)

      const rows: {
        semana_inicio: string
        fecha: string
        dia_semana: string
        rol_id: number
        profile_id: string
      }[] = []

      const todosDias = [
        ...DIAS_SEMANA,
        ...diasExtras.map((de) => de.nombre),
      ]

      for (const dia of todosDias) {
        for (const [rolIdStr, personas] of Object.entries(edicion[dia] ?? {})) {
          const rolId = Number(rolIdStr)
          for (const profileId of personas) {
            const isExtra = !(DIAS_SEMANA as string[]).includes(dia)
            const fecha = isExtra
              ? diasExtras.find((de) => de.nombre === dia)?.fecha ?? toDateString(semana)
              : toDateString(fechaDeDia(semana, dia as DiaSemana))
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
      setEditing(false)
      setMensaje('Programación guardada correctamente.')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // ── Derived data ────────────────────────────────────────────
  const todosDiasVisibles = [
    ...DIAS_SEMANA,
    ...diasExistentesExtra,
  ]

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
    const texto = (repEdit[dia] ?? '').trim()
    setRepGuardando(dia)
    try {
      await guardarRepertorio(toDateString(semana), dia, texto)
      setRepertorios((prev) => {
        const filtered = prev.filter((r) => r.dia_semana !== dia)
        if (texto) {
          filtered.push({
            semana_inicio: toDateString(semana),
            dia_semana: dia,
            repertorio: texto,
            updated_by: null,
            updated_at: new Date().toISOString(),
          })
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
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void generar()}
              disabled={generando}
            >
              {generando ? 'Generando…' : 'Generar programación'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={entrarEdicion}>
              Modificar
            </button>
          </div>
        )}
        {editing && (
          <div className="acciones-admin">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void guardarEdicion()}
            >
              Guardar
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelarEdicion}>
              Cancelar
            </button>
          </div>
        )}
      </div>
      <p className="subtitulo">
        {editing
          ? 'Selecciona el rol de cada día y haz clic en «+ Agregar» para asignar integrantes.'
          : 'Cada semana se genera en automático, procurando un reparto justo según la disponibilidad de cada integrante.'}
      </p>

      <SemanaSelector semana={semana} onChange={cambiarSemana} />

      {mensaje && <p className="ok">{mensaje}</p>}
      {error && <p className="error">{error}</p>}
      {cargando ? (
        <div className="centrado">Cargando…</div>
      ) : (
        <div className="grid-dias">
          {todosDiasVisibles.map((dia) => (
            <div key={dia} className="card dia-card-estatico">
              <div className="dia-head">
                <span className="dia-nombre">{dia}</span>
                <span className="dia-fecha">{fechaParaDia(dia)}</span>
                {editing && !(DIAS_SEMANA as string[]).includes(dia) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => quitarDiaExtra(dia)}
                    style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--error, #dc2626)' }}
                  >
                    Quitar día
                  </button>
                )}
              </div>

              {/* ── Vista normal ──────────────────────────── */}
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

              {/* ── Modo edición ──────────────────────────── */}
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
                            <span className="muted">
                              {texto ? 'Sin resultados' : 'Sin integrantes'}
                            </span>
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

              {((noAsignados[dia as DiaSemana] ?? []).length > 0) && (
                <p className="aviso">
                  Sin cupo para esta fecha:{' '}
                  {(noAsignados[dia as DiaSemana] ?? []).map((id) => nombreDeId(perfiles, id)).join(', ')}
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
          ))}

          {/* ── Agregar día extra ──────────────────────────── */}
          {editing && (
            <div className="card dia-card-estatico agregar-dia-card">
              <p className="agregar-dia-titulo">+ Agregar día especial</p>
              <input
                type="text"
                placeholder="Nombre del día (ej: Miércoles)"
                className="filtro-input"
                value={nuevoDiaNombre}
                onChange={(e) => setNuevoDiaNombre(e.target.value)}
              />
              <input
                type="date"
                className="filtro-input"
                value={nuevoDiaFecha}
                onChange={(e) => setNuevoDiaFecha(e.target.value)}
                style={{ marginTop: '0.4rem' }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={agregarDiaExtra}
                disabled={!nuevoDiaNombre.trim() || !nuevoDiaFecha}
                style={{ marginTop: '0.4rem' }}
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setVerContadores((v) => !v)}
            >
              {verContadores ? 'Ocultar' : 'Ver contador por rol'}
            </button>
          </div>
          <p className="subtitulo">
            Historial de asignaciones, para que el reparto entre los integrantes sea justo.
          </p>
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setLimiteContadores((l) => l + 15)}
                >
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
