import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
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
  guardarRepertorio,
  nombreDeId,
} from '../lib/api'
import type { Perfil, ProgramacionRow, RepertorioDia, Rol } from '../types'

interface Agrupado {
  [rolId: number]: ProgramacionRow[]
}

export default function Programacion() {
  const { esAdmin } = useAuth()
  const { semana, cambiarSemana } = useSemana()
  const [filas, setFilas] = useState<ProgramacionRow[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [conteos, setConteos] = useState<Record<number, Record<string, number>>>({})
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
      const [filasData, perfilesData, rolesData, conteosData, repData] = await Promise.all([
        obtenerProgramacionSemana(semanaStr),
        obtenerPerfiles(),
        obtenerRoles(),
        obtenerConteosHistoricos(semanaStr),
        obtenerRepertorios(semanaStr).catch(() => [] as RepertorioDia[]),
      ])
      setFilas(filasData)
      setPerfiles(perfilesData)
      setRoles(rolesData)
      setConteos(conteosData)
      setRepertorios(repData)
      guardarCacheProgramacion(semanaStr, {
        filas: filasData,
        perfiles: perfilesData,
        roles: rolesData,
        conteos: conteosData,
      })
    } catch {
      if (!cache) setError('No se pudo cargar la programación.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    setError('')
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

  const porDia: Record<DiaSemana, Agrupado> = { Martes: {}, Jueves: {}, Sabado: {}, Domingo: {} }
  for (const fila of filas) {
    const dia = fila.dia_semana as DiaSemana
    if (!(dia in porDia)) continue
    porDia[dia][fila.rol_id] ??= []
    porDia[dia][fila.rol_id].push(fila)
  }

  const totalPorDia = (dia: DiaSemana): number =>
    Object.values(porDia[dia]).reduce((acc, arr) => acc + arr.length, 0)

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

  function repDe(dia: DiaSemana): string {
    return repertorios.find((r) => r.dia_semana === dia)?.repertorio ?? ''
  }

  async function guardarRep(dia: DiaSemana) {
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
    } catch {
      setError('No se pudo guardar el repertorio. Intenta de nuevo.')
    } finally {
    }
  }

  return (
    <div className="pagina">
      <div className="encabezado-fila">
        <h2>Programación de la semana</h2>
        {esAdmin && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void generar()}
            disabled={generando}
          >
            {generando ? 'Generando…' : 'Generar programación'}
          </button>
        )}
      </div>
      <p className="subtitulo">
        Cada semana se genera en automático, procurando un reparto justo según la disponibilidad
        de cada integrante.
      </p>

      <SemanaSelector semana={semana} onChange={cambiarSemana} />

      {mensaje && <p className="ok">{mensaje}</p>}
      {error && <p className="error">{error}</p>}
      {cargando ? (
        <div className="centrado">Cargando…</div>
      ) : (
        <div className="grid-dias">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="card dia-card-estatico">
              <div className="dia-head">
                <span className="dia-nombre">{dia}</span>
                <span className="dia-fecha">{formatFechaLarga(fechaDeDia(semana, dia))}</span>
              </div>
              {totalPorDia(dia) === 0 ? (
                <p className="vacio">Aún no hay programación para esta fecha.</p>
              ) : (
                <div className="rol-lista">
                  {ORDEN_ROL.map((rolId) => {
                    const filasRol = porDia[dia][rolId] ?? []
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
              {noAsignados[dia].length > 0 && (
                <p className="aviso">
                  Sin cupo para esta fecha:{' '}
                  {noAsignados[dia].map((id) => nombreDeId(perfiles, id)).join(', ')}
                </p>
              )}
              {totalPorDia(dia) > 0 && (
                <div className="repertorio-seccion">
                  <label className="repertorio-label">Repertorio</label>
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {conteosOrdenados.length > 0 && (
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
